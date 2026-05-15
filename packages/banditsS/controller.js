const { ZOMBIE_CONFIG } = require('./zombie.config');
const {
    createLogger,
    dist3,
    getPlayerById,
    isPlayerInZone,
    playersInZone,
    isPlayerValidTarget,
    chooseNearestTarget,
    normalizeZonePoints,
    randomPointInPolygon,
} = require('./zombie.utils');
const { ZOMBIE_STATE, setZombieState } = require('./zombie.state');
const { saveTask, clearTask, restoreTask } = require('./zombieTaskMemory');
const { createControllerManager } = require('./zombieControllerManager');
const damageSystem = require('../damageSystem/index.js');
const { createZombieLootManager } = require('./zombieLoot');

const zlog = createLogger(ZOMBIE_CONFIG.debug, 'ZCTRL');

function infoLog(msg) {
    if (!/loaded/i.test(String(msg || ''))) return;
    console.log(`[Z] ${msg}`);
}

const zones = new Map();
const zombies = new Map();
let zombieZoneMapSignature = '';
const zombieLootManager = createZombieLootManager();
let infectionRef = null;
let zombieZoneColumnSet = null;
const ZONE_SPAWN_DELAY_MS = 45 * 1000;
const ZONE_EMPTY_DESTROY_DELAY_MS = 30 * 1000;


function getInfection() {
    if (infectionRef) return infectionRef;
    try { infectionRef = call('infection'); } catch {}
    return infectionRef;
}

function getDbRef() {
    try {
        if (typeof global !== 'undefined' && global.db) return global.db;
    } catch {}
    return null;
}

async function getZombieZoneColumnSet() {
    if (zombieZoneColumnSet) return zombieZoneColumnSet;

    const dbRef = getDbRef();
    if (!dbRef || !dbRef.sequelize) return null;

    try {
        const [rows] = await dbRef.sequelize.query('SHOW COLUMNS FROM zombie_zones');
        zombieZoneColumnSet = new Set((rows || []).map((r) => String(r.Field || '')));
    } catch (error) {
        zlog(`ZombieZone SHOW COLUMNS failed: ${error.message}`);
        zombieZoneColumnSet = null;
    }

    return zombieZoneColumnSet;
}

async function ensureZombieZoneSchema() {
    const dbRef = getDbRef();
    if (!dbRef || !dbRef.sequelize) return;

    try {
        const cols = await getZombieZoneColumnSet();
        if (cols && !cols.has('points')) {
            await dbRef.sequelize.query('ALTER TABLE zombie_zones ADD COLUMN points LONGTEXT NULL');
            zombieZoneColumnSet = null;
            await getZombieZoneColumnSet();
            infoLog('ZombieZone schema upgraded: added points column');
        }
    } catch (error) {
        zlog(`ZombieZone schema ensure failed: ${error.message}`);
    }
}

function buildLegacyZoneFromRow(row) {
    const src = row && typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: src.id,
        name: src.name || null,
        x: src.x,
        y: src.y,
        z: src.z,
        dimension: typeof src.dimension === 'number' ? src.dimension : 0,
        radius: src.radius,
        zombieCount: src.zombieCount,
        respawnMs: src.respawnMs,
        maxZombieCount: src.maxZombieCount,
        waveSize: src.waveSize,
        points: src.points || null,
    };
}

function parseZonePoints(rawPoints) {
    try {
        if (Array.isArray(rawPoints)) return normalizeZonePoints(rawPoints);
        if (typeof rawPoints === 'string' && rawPoints.trim()) {
            return normalizeZonePoints(JSON.parse(rawPoints));
        }
    } catch {}
    return [];
}

function toRuntimeZone(raw) {
    const radius = Math.max(5, Number(raw.radius) || 30);
    const zombieCount = Math.max(1, parseInt(raw.zombieCount, 10) || 3);
    const maxZombieCount = Math.max(zombieCount, parseInt(raw.maxZombieCount, 10) || zombieCount);
    const waveSize = Math.max(1, parseInt(raw.waveSize, 10) || zombieCount);
    const points = parseZonePoints(raw.points);

    let centerX = Number(raw.x) || 0;
    let centerY = Number(raw.y) || 0;
    let centerZ = Number(raw.z) || 0;
    let computedRadius = radius;

    if (points.length >= 3) {
        const sum = points.reduce((acc, p) => {
            acc.x += p.x;
            acc.y += p.y;
            acc.z += p.z;
            return acc;
        }, { x: 0, y: 0, z: 0 });
        centerX = sum.x / points.length;
        centerY = sum.y / points.length;
        centerZ = sum.z / points.length;
        computedRadius = Math.max(5, ...points.map((p) => dist3({ x: centerX, y: centerY, z: centerZ }, p)));
    }

    return {
        id: parseInt(raw.id, 10),
        name: raw.name || `Zombie Zone #${raw.id}`,
        x: centerX,
        y: centerY,
        z: centerZ,
        dimension: Number(raw.dimension) || 0,
        radius: computedRadius,
        points,
        zombieCount,
        maxZombieCount,
        waveSize,
        respawnMs: Math.max(1000, parseInt(raw.respawnMs, 10) || ZOMBIE_CONFIG.timers.waveIntervalMs),
        zombieIds: [],
        active: false,
        activatorRid: null,
        firstSpawnAt: 0,
        lastWaveAt: 0,
        emptySinceAt: 0,
    };
}

function upsertZone(raw) {
    const runtimeZone = toRuntimeZone(raw);
    const prev = zones.get(runtimeZone.id);
    if (prev) {
        runtimeZone.zombieIds = Array.isArray(prev.zombieIds) ? prev.zombieIds : [];
        runtimeZone.active = !!prev.active;
        runtimeZone.activatorRid = prev.activatorRid || null;
        runtimeZone.firstSpawnAt = Number(prev.firstSpawnAt) || 0;
        runtimeZone.lastWaveAt = Number(prev.lastWaveAt) || 0;
        runtimeZone.emptySinceAt = Number(prev.emptySinceAt) || 0;
    }
    zones.set(runtimeZone.id, runtimeZone);
    return runtimeZone;
}

function getZombieZoneMapData() {
    return Array.from(zones.values())
        .filter((zone) => zone && zone.dimension === 0)
        .sort((a, b) => a.id - b.id)
        .map((zone) => ({
            id: zone.id,
            name: 'точка вспышки',
            x: zone.x,
            y: zone.y,
            z: zone.z,
            radius: zone.radius,
            points: Array.isArray(zone.points) ? zone.points.map((point) => ({
                x: point.x,
                y: point.y,
                z: point.z,
            })) : [],
        }));
}

function syncZombieZoneMapBlips(player) {
    if (!player || !mp.players.exists(player)) return;
    try { player.call('zombies:zones:map', [getZombieZoneMapData()]); } catch {}
}

function syncZombieZoneMapBlipsForAll(force = false) {
    const data = getZombieZoneMapData();
    const signature = JSON.stringify(data);
    if (!force && signature === zombieZoneMapSignature) return;
    zombieZoneMapSignature = signature;

    mp.players.forEach((player) => {
        try { player.call('zombies:zones:map', [data]); } catch {}
    });
}

async function loadZonesFromDb(options = {}) {
    const fallbackToConfig = options.fallbackToConfig !== false;
    const dbRef = getDbRef();
    const dbModel = dbRef && dbRef.Models ? dbRef.Models.ZombieZone : null;
    if (!dbModel) {
        if (!fallbackToConfig) return;
        infoLog('ZombieZone model is missing; loaded zones from config');
        ZOMBIE_CONFIG.zones.forEach((zone) => upsertZone(zone));
        return;
    }

    let dbZones = [];
    try {
        dbZones = await dbModel.findAll();
    } catch (error) {
        const message = String(error && error.message ? error.message : error);
        zlog(`ZombieZone findAll failed: ${message}`);

        // Backward compatibility for DBs where some columns were not added yet.
        const hasUnknownColumn = /unknown column/i.test(message);
        if (hasUnknownColumn && dbRef && dbRef.sequelize) {
            try {
                const cols = await getZombieZoneColumnSet();
                if (cols && cols.size) {
                    const selected = ['id', 'x', 'y', 'z']
                        .concat(cols.has('name') ? ['name'] : [])
                        .concat(cols.has('radius') ? ['radius'] : [])
                        .concat(cols.has('zombieCount') ? ['zombieCount'] : [])
                        .concat(cols.has('respawnMs') ? ['respawnMs'] : [])
                        .concat(cols.has('maxZombieCount') ? ['maxZombieCount'] : [])
                        .concat(cols.has('waveSize') ? ['waveSize'] : [])
                        .concat(cols.has('dimension') ? ['dimension'] : [])
                        .concat(cols.has('points') ? ['points'] : []);

                    const [rows] = await dbRef.sequelize.query(`SELECT ${selected.join(', ')} FROM zombie_zones`);
                    dbZones = (rows || []).map((row) => buildLegacyZoneFromRow(row));
                }
            } catch (compatError) {
                zlog(`ZombieZone compat-select failed: ${compatError.message}`);
            }
        }
    }

    if (!dbZones.length) {
        if (!fallbackToConfig) return;
        infoLog('ZombieZone table is empty; loaded zones from config');
        ZOMBIE_CONFIG.zones.forEach((zone) => upsertZone(zone));
        return;
    }

    dbZones.forEach((zone) => upsertZone(zone));
    infoLog(`loaded ${dbZones.length} zombie zones from DB`);
}

function getZonePlayerDwellMs(player, zoneId) {
    if (!player) return 0;
    const enteredAt = Number(player.getVariable(`inZoneSince_${zoneId}`)) || 0;
    if (!enteredAt) return 0;
    return Math.max(0, Date.now() - enteredAt);
}

function randomModel() {
    const arr = ZOMBIE_CONFIG.models;
    return arr[(Math.random() * arr.length) | 0] || 'u_m_y_zombie_01';
}

function nextZid() {
    let zid = (Math.random() * 1e9) | 0;
    while (zombies.has(zid)) zid = (Math.random() * 1e9) | 0;
    return zid;
}

function resolveZombieHitDamage(player, dmgRaw) {
    const parsed = parseInt(dmgRaw, 10) || 0;
    if (parsed > 0) return parsed;

    try {
        const weaponHash = player ? player.weapon : null;
        const byWeapon = damageSystem.findDamageValue(weaponHash);
        if (typeof byWeapon === 'number' && byWeapon > 0) return byWeapon;
    } catch {}

    return damageSystem.defaultDamage || 10;
}

function chooseController(zone, ped, preferredPlayer = null) {
    const preferredValid = preferredPlayer && isPlayerValidTarget(mp, preferredPlayer, zone, {
        maxDistance: ZOMBIE_CONFIG.ai.controllerMaxDistance,
        fromPos: ped.position,
        dimension: ped.dimension,
    });
    if (preferredValid) return preferredPlayer;

    const plist = playersInZone(mp, zone).filter((p) => isPlayerValidTarget(mp, p, zone, {
        maxDistance: ZOMBIE_CONFIG.ai.controllerMaxDistance,
        fromPos: ped.position,
        dimension: ped.dimension,
    }));

    if (!plist.length) return null;

    let best = null;
    let bestDist = Infinity;
    plist.forEach((p) => {
        const d = dist3(p.position, ped.position);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    });

    return best;
}

function setTaskIdle(st, reason = 'idle') {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;
    if (st.switching) return;

    if (st.lastTaskType === 'idle' && st.lastTaskData && st.lastTaskData.reason === reason) return;

    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    try {
        ctrl.call('z:executeCommand', [st.zid, 'idle', JSON.stringify({ reason })]);
    } catch {}

    try {
        st.ped.setVariable('command', 'idle');
        st.ped.setVariable('commandExtra', { reason });
    } catch {}

    saveTask(st, 'idle', { reason });
    const now = Date.now();
    if (!st.lastCmdLogAt || now - st.lastCmdLogAt >= ZOMBIE_CONFIG.timers.cmdDebugMs) {
        st.lastCmdLogAt = now;
        zlog(`cmd idle zid=${st.zid} reason=${reason}`);
    }
}

function setTaskFollow(st, reason = 'chase') {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;
    if (st.switching) return;

    const owner = getPlayerById(mp, st.ownerRid);
    if (!owner || !mp.players.exists(owner)) return;

    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    if (st.lastFollowTargetRid === owner.id && Date.now() - (st.lastFollowSentAt || 0) < ZOMBIE_CONFIG.ai.skipDuplicateFollowMs) {
        return;
    }

    const payload = {
        rid: owner.id,
        speed: ZOMBIE_CONFIG.stats.moveSpeed,
        stopDist: ZOMBIE_CONFIG.stats.stopDistance,
    };

    try {
        ctrl.call('z:executeCommand', [st.zid, 'follow', JSON.stringify(payload)]);
    } catch {}

    try {
        st.ped.setVariable('command', 'follow');
        st.ped.setVariable('commandExtra', payload);
    } catch {}

    st.lastFollowTargetRid = owner.id;
    st.lastFollowSentAt = Date.now();
    st.lastFollowIssueAt = st.lastFollowSentAt;
    st.stuckGraceUntil = Math.max(st.stuckGraceUntil || 0, st.lastFollowIssueAt + (ZOMBIE_CONFIG.ai.stuckGraceAfterFollowMs || 1800));
    saveTask(st, 'follow', payload);

    const now = Date.now();
    if (!st.lastCmdLogAt || now - st.lastCmdLogAt >= ZOMBIE_CONFIG.timers.cmdDebugMs) {
        st.lastCmdLogAt = now;
        zlog(`cmd follow zid=${st.zid} targetRid=${owner.id} reason=${reason}`);
    }
}

function spawnZombie(zone, owner, spawnIndex = 0) {
    const zid = nextZid();

    let spawnBaseX = zone.x;
    let spawnBaseY = zone.y;
    if (owner && mp.players.exists(owner) && isPlayerInZone(owner, zone)) {
        spawnBaseX = Number(owner.position.x) || zone.x;
        spawnBaseY = Number(owner.position.y) || zone.y;
    }

    let x = spawnBaseX;
    let y = spawnBaseY;
    const hasPolygon = Array.isArray(zone.points) && zone.points.length >= 3;

    if (hasPolygon) {
        const p = randomPointInPolygon(zone.points, {
            x: zone.x,
            y: zone.y,
            z: zone.z,
            radius: zone.radius,
        });
        x = p.x;
        y = p.y;
    } else {
        const angle = Math.random() * Math.PI * 2;
        const localSpawnRadius = Math.min(Math.max(6, zone.radius - 2), 24);
        const d = 4 + Math.random() * Math.max(3, localSpawnRadius - 4);
        x = spawnBaseX + Math.cos(angle) * d;
        y = spawnBaseY + Math.sin(angle) * d;
    }

    const distFromZoneCenter = dist3({ x, y, z: zone.z }, { x: zone.x, y: zone.y, z: zone.z });
    const maxDistFromCenter = Math.max(2, Number(zone.radius) - 1);
    if (distFromZoneCenter > maxDistFromCenter) {
        const k = maxDistFromCenter / distFromZoneCenter;
        x = zone.x + (x - zone.x) * k;
        y = zone.y + (y - zone.y) * k;
    }

    const z = zone.z;

    const ped = mp.peds.new(mp.joaat(randomModel()), new mp.Vector3(x, y, z), {
        dynamic: true,
        invincible: false,
    });

    try {
        ped.dimension = Number(zone.dimension) || 0;
    } catch {}

    ped.setVariable('zoneId', zone.id);
    ped.setVariable('zid', zid);
    ped.setVariable('command', 'idle');
    ped.setVariable('commandExtra', null);
    ped.setVariable('deadFlag', false);
    ped.setVariable('zState', ZOMBIE_STATE.SLEEP);

    try {
        ped.health = ZOMBIE_CONFIG.stats.hp;
        if (typeof ped.setHealth === 'function') ped.setHealth(ZOMBIE_CONFIG.stats.hp);
    } catch {}

    const now = Date.now();
    const st = {
        zid,
        ped,
        zoneId: zone.id,
        ownerRid: owner && mp.players.exists(owner) ? owner.id : null,
        dead: false,
        deadFlag: false,
        deadAt: 0,
        deadSignalAt: 0,
        hp: ZOMBIE_CONFIG.stats.hp,
        attackEnabledAt: now + ZOMBIE_CONFIG.stats.attackWarmupMs,
        lastFollowSyncAt: 0,
        lastAttackAt: 0,
        lastHpLogAt: 0,
        lastCmdLogAt: 0,
        lastPos: { x, y, z },
        lastMoveAt: now,
        stuckCount: 0,
        controllerRid: null,
        lastHeartbeatAt: 0,
        lastControllerSwitchAt: 0,
        switching: false,
        switchStartAt: 0,
        switchReason: null,
        switchAttempts: 0,
        switchAssignDelayMs: Math.max(0, parseInt(spawnIndex, 10) || 0) * (ZOMBIE_CONFIG.timers.switchAssignJitterMs || 0),
        ctrlVer: 0,
        state: ZOMBIE_STATE.SLEEP,
        lastFollowSentAt: 0,
        lastFollowTargetRid: null,
        lastTaskType: null,
        lastTaskData: null,
        lastTaskAt: 0,
        deadDestroyScheduled: false,
        lastFollowIssueAt: 0,
        lastControllerAckAt: 0,
        stuckGraceUntil: now + (ZOMBIE_CONFIG.ai.stuckGraceAfterSpawnMs || 4000),
        lootSpawned: false,
    };

    zombies.set(zid, st);
    zone.zombieIds.push(zid);

    controllerManager.beginSwitch(st, 'spawn');

    zlog(`spawn zid=${zid} owner=${st.ownerRid} pos=${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
}

function spawnWave(zone, activator, count, source = 'unknown') {
    if (!zone || !activator || !mp.players.exists(activator)) return 0;

    const maxZombieCount = Math.max(0, parseInt(zone.maxZombieCount, 10) || zone.zombieCount || 0);
    const activeZombieCount = zone.zombieIds.length;
    const freeSlots = Math.max(0, maxZombieCount - activeZombieCount);
    const waveCount = Math.max(0, Math.min(parseInt(count, 10) || 0, freeSlots));

    if (!waveCount) {
        zlog(`wave-skip zone=${zone.id} source=${source} active=${activeZombieCount} max=${maxZombieCount}`);
        return 0;
    }

    zlog(`wave-spawn zone=${zone.id} source=${source} count=${waveCount} active=${activeZombieCount}->${activeZombieCount + waveCount} max=${maxZombieCount}`);
    for (let i = 0; i < waveCount; i++) {
        setTimeout(() => spawnZombie(zone, activator, activeZombieCount + i), i * 400);
    }

    return waveCount;
}

function spawnZoneOnEnter(zone, activator) {
    if (!zone || !activator || !mp.players.exists(activator)) return;
    if (zone.zombieIds.length) return;

    const dwellMs = getZonePlayerDwellMs(activator, zone.id);
    if (dwellMs < ZONE_SPAWN_DELAY_MS) {
        const waitLeft = Math.ceil((ZONE_SPAWN_DELAY_MS - dwellMs) / 1000);
        zlog(`spawn-delay zone=${zone.id} player=${activator.id} dwellMs=${dwellMs}`);
        infoLog(`zone=${zone.id} waiting dwell: player=${activator.id}, left=${waitLeft}s`);
        return;
    }

    zone.active = true;
    zone.activatorRid = activator.id;
    zone.emptySinceAt = 0;

    const spawned = spawnWave(zone, activator, zone.zombieCount, 'initial-enter');
    if (spawned > 0) {
        const now = Date.now();
        zone.firstSpawnAt = now;
        zone.lastWaveAt = now;
        zlog(`zone-spawn-start zone=${zone.id} name=${zone.name} count=${spawned}`);
        infoLog(`spawn started zone=${zone.id} name="${zone.name}" count=${spawned}`);
    }
}

function destroyZombie(zid, reason = 'unknown') {
    const st = zombies.get(zid);
    if (!st) return;

    zlog(`destroy-start zid=${zid} reason=${reason}`);
    const zone = zones.get(st.zoneId);

    try {
        if (!st.dead) zombieLootManager.removeLootByZombie(zid, `zombie-destroy-${reason}`);
    } catch {}

    try {
        if (mp.peds.exists(st.ped)) st.ped.destroy();
    } catch {}

    zombies.delete(zid);

    if (zone) {
        zone.zombieIds = zone.zombieIds.filter((id) => id !== zid);
        if (!zone.zombieIds.length) {
            zone.active = false;
            zone.activatorRid = null;
            zone.firstSpawnAt = 0;
            zone.lastWaveAt = 0;
        }
    }

    mp.players.forEach((p) => {
        try {
            p.call('z:forceRemove', [zid]);
        } catch {}
    });

    zlog(`destroy done zid=${zid} reason=${reason} zone=${st.zoneId}`);
}

function spawnLootBagForDeadZombie(st, source = 'unknown') {
    if (!st) return;
    if (st.lootSpawned) {
        zlog(`loot-skip zid=${st.zid} source=${source} reason=already-spawned`);
        return;
    }

    if (!st.ped || !mp.peds.exists(st.ped)) {
        zlog(`loot-skip zid=${st.zid} source=${source} reason=ped-missing`);
        return;
    }

    const pedPos = st.ped.position;
    if (!pedPos) {
        zlog(`loot-skip zid=${st.zid} source=${source} reason=ped-position-missing`);
        return;
    }

    const pos = { x: pedPos.x, y: pedPos.y, z: pedPos.z };
    const dimension = Number(st.ped.dimension) || 0;

    zlog(`loot-create-call zid=${st.zid} source=${source} coords=ped.position pos=${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)} dim=${dimension}`);
    const loot = zombieLootManager.createLootBag(st.zid, pos, dimension);
    if (!loot) {
        zlog(`loot-fail zid=${st.zid} source=${source} reason=create-returned-null`);
        return;
    }

    st.lootSpawned = true;
    const objPos = loot && loot.object && mp.objects.exists(loot.object) ? loot.object.position : null;
    if (objPos) {
        zlog(`loot bag created zid=${st.zid} lootId=${loot.id} pos=${objPos.x.toFixed(2)},${objPos.y.toFixed(2)},${objPos.z.toFixed(2)} dim=${dimension}`);
    }
}

function markDeadByHit(zid, killer) {
    const st = zombies.get(zid);
    if (!st || st.dead) return;

    zlog(`mark-dead zid=${zid} by=${killer}`);
    st.dead = true;
    st.deadFlag = true;
    st.deadAt = Date.now();
    st.deadSignalAt = st.deadAt;
    st.hp = 0;
    st.ownerRid = null;
    st.switching = false;
    st.deadDestroyScheduled = true;

    setZombieState(st, ZOMBIE_STATE.DEAD, zlog, killer);

    try {
        if (mp.peds.exists(st.ped)) {
            st.ped.health = 0;
            st.ped.setVariable('deadFlag', true);
            st.ped.setVariable('command', 'idle');
            st.ped.setVariable('commandExtra', null);
        }
    } catch {}

    clearTask(st);

    mp.players.forEach((p) => {
        try {
            p.call('z:dead', [zid]);
        } catch {}
    });

    zlog(`dead zid=${zid} killer=${killer}`);

    try {
        spawnLootBagForDeadZombie(st, 'markDeadByHit');
    } catch (e) {
        zlog(`loot-fail zid=${zid} source=markDeadByHit reason=${e.message}`);
    }
}

function markDeadBySignal(zid, source = 'unknown') {
    const st = zombies.get(zid);
    if (!st || st.dead) return;
    zlog(`dead signal accepted zid=${zid} source=${source}`);
    markDeadByHit(zid, source);
}

function syncDeadStateFromPed() {
    zombies.forEach((st) => {
        if (!st || st.dead) return;

        if (!mp.peds.exists(st.ped)) {
            zlog(`dead-sync zid=${st.zid}: ped missing -> mark dead`);
            markDeadBySignal(st.zid, 'ped-missing');
            return;
        }

        const hp = Number(st.ped.health) || 0;
        const deadFlag = !!st.ped.getVariable('deadFlag');
        const isPedDead = deadFlag || st.deadFlag === true;
        const now = Date.now();
        if (!st.lastHpLogAt || now - st.lastHpLogAt >= ZOMBIE_CONFIG.timers.hpDebugMs) {
            st.lastHpLogAt = now;
            zlog(`hp-check zid=${st.zid} hp=${hp} pedDeadFlag=${deadFlag} stDeadFlag=${st.deadFlag === true} dead=${isPedDead} state=${st.state} switching=${st.switching}`);
        }
        if (isPedDead) {
            const source = deadFlag ? 'ped-flag' : 'state-flag';
            markDeadBySignal(st.zid, source);
            zlog(`dead-sync zid=${st.zid}: hp=${hp} pedDeadFlag=${deadFlag} stDeadFlag=${st.deadFlag === true} source=${source}`);
        }
    });
}

function updateZoneEntryState() {
    mp.players.forEach((player) => {
        zones.forEach((zone, zoneId) => {
            const key = `inZone_${zoneId}`;
            const inZone = isPlayerInZone(player, zone);
            const wasInZone = !!player.getVariable(key);

            if (inZone && !wasInZone) {
                player.setVariable(key, true);
                player.setVariable(`inZoneSince_${zoneId}`, Date.now());
                zlog(`player ${player.id} entered zone=${zoneId}`);
                infoLog(`player ${player.id} entered zone=${zoneId}`);
            } else if (!inZone && wasInZone) {
                player.setVariable(key, false);
                player.setVariable(`inZoneSince_${zoneId}`, 0);
                zlog(`player ${player.id} left zone=${zoneId}`);
                infoLog(`player ${player.id} left zone=${zoneId}`);
            }
        });
    });
}

function cleanupEmptyZones() {
    zones.forEach((zone) => {
        if (!zone) return;
        const plist = playersInZone(mp, zone);
        if (plist.length) {
            if (zone.emptySinceAt) infoLog(`zone=${zone.id} is populated again (players=${plist.length})`);
            zone.emptySinceAt = 0;
            return;
        }

        zone.active = false;
        zone.activatorRid = null;
        zone.firstSpawnAt = 0;
        zone.lastWaveAt = 0;

        if (!zone.zombieIds.length) {
            zone.emptySinceAt = 0;
            return;
        }

        if (!zone.emptySinceAt) {
            zone.emptySinceAt = Date.now();
            infoLog(`zone=${zone.id} became empty, destroy timer started (${ZONE_EMPTY_DESTROY_DELAY_MS / 1000}s)`);
        }

        const emptyForMs = Date.now() - zone.emptySinceAt;

        if (emptyForMs < ZONE_EMPTY_DESTROY_DELAY_MS) {
            zone.zombieIds.forEach((zid) => {
                const st = zombies.get(zid);
                if (!st || st.dead) return;

                st.ownerRid = null;
                if (st.switching) return;

                setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'zone-empty-wait-destroy');
                setTaskIdle(st, 'zone-empty-wait-destroy');
            });
            return;
        }

        infoLog(`zone=${zone.id} empty for ${Math.floor(emptyForMs / 1000)}s, destroying zombies=${zone.zombieIds.length}`);
        zone.zombieIds.slice().forEach((zid) => destroyZombie(zid, 'zone-empty-timeout'));
        zone.emptySinceAt = 0;
        zone.zombieIds = [];
    });
}

function spawnZonesByPresenceCheck() {
    zones.forEach((zone) => {
        const plist = playersInZone(mp, zone);
        if (!plist.length) {
            zlog(`presence-check zone=${zone.id}: empty, skip spawn`);
            infoLog(`presence-check zone=${zone.id}: no players`);
            return;
        }

        if (zone.zombieIds.length) {
            zlog(`presence-check zone=${zone.id}: already active (${zone.zombieIds.length} zombies)`);
            infoLog(`presence-check zone=${zone.id}: already has zombies=${zone.zombieIds.length}`);
            return;
        }

        const eligiblePlayers = plist.filter((p) => getZonePlayerDwellMs(p, zone.id) >= ZONE_SPAWN_DELAY_MS);
        if (!eligiblePlayers.length) {
            zlog(`presence-check zone=${zone.id}: waiting dwell >= ${ZONE_SPAWN_DELAY_MS}ms`);
            infoLog(`presence-check zone=${zone.id}: players in zone=${plist.length}, waiting dwell 45s`);
            return;
        }

        const centerPos = { x: zone.x, y: zone.y, z: zone.z };
        let target = null;
        let bestDist = Infinity;
        eligiblePlayers.forEach((p) => {
            const d = dist3(p.position, centerPos);
            if (d < bestDist) {
                bestDist = d;
                target = p;
            }
        });
        if (!target) return;

        zlog(`presence-check zone=${zone.id}: players=${plist.length}, spawn start`);
        infoLog(`presence-check zone=${zone.id}: spawn candidate player=${target.id}, players=${plist.length}`);
        spawnZoneOnEnter(zone, target);
    });
}


function spawnZoneWaves() {
    const now = Date.now();

    zones.forEach((zone) => {
        if (!zone || !zone.active) return;
        if (!zone.zombieIds.length) return;

        const activator = getPlayerById(mp, zone.activatorRid);
        const players = playersInZone(mp, zone);
        if (!activator || !mp.players.exists(activator)) return;
        if (!players.length) return;

        const firstSpawnAt = Number(zone.firstSpawnAt) || 0;
        const lastWaveAt = Number(zone.lastWaveAt) || firstSpawnAt;
        if (!firstSpawnAt) return;

        const zoneRespawnMs = Math.max(1000, parseInt(zone.respawnMs, 10) || ZOMBIE_CONFIG.timers.waveIntervalMs);
        if (now - firstSpawnAt < zoneRespawnMs) return;
        if (now - lastWaveAt < zoneRespawnMs) return;

        const waveSize = Math.max(1, parseInt(zone.waveSize, 10) || 3);
        const spawned = spawnWave(zone, activator, waveSize, 'timed-wave');
        if (spawned > 0) zone.lastWaveAt = now;
    });
}

function processStuck(st) {
    if (!mp.peds.exists(st.ped)) return;
    if (st.switching) return;
    if (!(st.state === ZOMBIE_STATE.CHASE || st.state === ZOMBIE_STATE.ATTACK)) return;

    const now = Date.now();
    if (now < (st.stuckGraceUntil || 0)) return;
    if (now - (st.lastFollowIssueAt || 0) < (ZOMBIE_CONFIG.ai.stuckGraceAfterFollowMs || 1800)) return;
    if (now - (st.lastControllerAckAt || 0) < (ZOMBIE_CONFIG.ai.stuckGraceAfterAckMs || 2500)) return;

    const pos = st.ped.position;
    const moved = dist3(pos, st.lastPos || pos);

    if (moved >= ZOMBIE_CONFIG.ai.stuckDistanceEps) {
        st.lastPos = { x: pos.x, y: pos.y, z: pos.z };
        st.lastMoveAt = now;
        st.stuckCount = 0;
        return;
    }

    if (now - (st.lastMoveAt || now) < ZOMBIE_CONFIG.ai.stuckTimeoutMs) return;

    st.stuckCount = (st.stuckCount || 0) + 1;
    st.lastMoveAt = now;
    zlog(`stuck zid=${st.zid} count=${st.stuckCount} controller=${st.controllerRid}`);

    const reassignThreshold = Math.max(
        ZOMBIE_CONFIG.ai.maxStuckBeforeReassign || 4,
        ZOMBIE_CONFIG.ai.stuckRecoveryBursts || 2,
    );

    // 1) мягкое восстановление без смены контроллера
    if (st.stuckCount < reassignThreshold) {
        const restored = restoreTask(st, {
            follow: (state) => setTaskFollow(state, 'stuck-recover-follow'),
            idle: (state, data) => setTaskIdle(state, data.reason || 'stuck-recover-idle'),
            attack: (state) => setTaskFollow(state, 'stuck-recover-attack-follow'),
        });
        if (!restored) setTaskFollow(st, 'stuck-recover-fallback');
        st.stuckGraceUntil = now + (ZOMBIE_CONFIG.ai.stuckGraceAfterFollowMs || 1800);
        return;
    }

    // 2) reassign только если это действительно другой/невалидный контроллер
    const zone = zones.get(st.zoneId);
    if (!zone) return;

    const hbAlive = st.controllerRid && (now - (st.lastHeartbeatAt || 0) <= ZOMBIE_CONFIG.timers.heartbeatTimeoutMs);
    const currentCtrlObj = getPlayerById(mp, st.controllerRid);
    const currentCtrlValid = currentCtrlObj && isPlayerValidTarget(mp, currentCtrlObj, zone, {
        maxDistance: ZOMBIE_CONFIG.ai.controllerMaxDistance,
        fromPos: st.ped.position,
        dimension: st.ped.dimension,
    });

    const preferred = getPlayerById(mp, st.ownerRid);
    const nextCtrl = chooseController(zone, st.ped, preferred);
    const sameController = nextCtrl && st.controllerRid && nextCtrl.id === st.controllerRid;

    if (sameController && hbAlive && currentCtrlValid) {
        zlog(`stuck same-controller zid=${st.zid}: skip switch, do recovery`);
        setTaskFollow(st, 'stuck-same-controller-recover');
        st.stuckGraceUntil = now + (ZOMBIE_CONFIG.ai.stuckGraceAfterFollowMs || 1800);
        return;
    }

    if (!hbAlive || !currentCtrlValid || (nextCtrl && !sameController)) {
        st.stuckCount = 0;
        controllerManager.beginSwitch(st, 'stuck-reassign');
        return;
    }

    // fallback: мягкое восстановление
    setTaskFollow(st, 'stuck-final-recover');
    st.stuckGraceUntil = now + (ZOMBIE_CONFIG.ai.stuckGraceAfterFollowMs || 1800);
}

function syncAllZombieFollow() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        controllerManager.checkTimeout(st);
        if (st.switching) return;

        const zoneAggroDistance = Math.max(
            ZOMBIE_CONFIG.ai.maxTargetDistance,
            (Number(zone.radius) || 30) * 3
        );

        let target = chooseNearestTarget(mp, zone, st.ped.position, {
            maxDistance: zoneAggroDistance,
            dimension: st.ped.dimension,
        });

        if (!target) {
            // Для больших зон: если игрок есть в зоне, но далеко — всё равно принудительно цепляем цель.
            target = chooseNearestTarget(mp, zone, st.ped.position, {
                dimension: st.ped.dimension,
            });
        }

        if (!target) {
            st.ownerRid = null;
            if (st.state !== ZOMBIE_STATE.SLEEP) {
                setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'no-valid-target');
                setTaskIdle(st, 'sleep-no-target');
            }
            return;
        }

        const distToTarget = dist3(st.ped.position, target.position);

        if (st.ownerRid !== target.id) {
            st.ownerRid = target.id;
            zlog(`retarget zid=${st.zid} -> owner=${st.ownerRid}`);
        }

        const hbDead = st.controllerRid && Date.now() - (st.lastHeartbeatAt || 0) > ZOMBIE_CONFIG.timers.heartbeatTimeoutMs;
        const currentCtrl = st.ped.controller;
        if (hbDead || !currentCtrl || !mp.players.exists(currentCtrl) || !isPlayerInZone(currentCtrl, zone)) {
            controllerManager.beginSwitch(st, hbDead ? 'heartbeat-timeout' : 'invalid-controller');
            return;
        }

        const now = Date.now();
        if (now - st.lastFollowSyncAt < ZOMBIE_CONFIG.timers.syncMs) return;
        st.lastFollowSyncAt = now;

        if (distToTarget > ZOMBIE_CONFIG.ai.sleepWakeDistance) {
            setZombieState(st, ZOMBIE_STATE.CHASE, zlog, `far-aggro target=${target.id} dist=${distToTarget.toFixed(1)}`);
            setTaskFollow(st, 'sync-long-range-aggro');
        } else {
            setZombieState(st, ZOMBIE_STATE.CHASE, zlog, `target=${target.id}`);
            setTaskFollow(st, 'sync-chase');
        }
        processStuck(st);
    });
}

function processZombieAttacks() {
    zombies.forEach((st) => {
        if (st.dead || st.switching) return;
        if (st.state === ZOMBIE_STATE.SLEEP || st.state === ZOMBIE_STATE.IDLE || st.state === ZOMBIE_STATE.SWITCH_CONTROLLER) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const owner = getPlayerById(mp, st.ownerRid);
        if (!isPlayerValidTarget(mp, owner, zone, {
            dimension: st.ped.dimension,
            maxDistance: ZOMBIE_CONFIG.ai.maxTargetDistance,
            fromPos: st.ped.position,
        })) {
            st.ownerRid = null;
            if (st.state !== ZOMBIE_STATE.SLEEP) {
                setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'invalid-target-before-attack');
                setTaskIdle(st, 'invalid-target-before-attack');
            }
            return;
        }

        const now = Date.now();
        if (now < (st.attackEnabledAt || 0)) return;

        const d = dist3(st.ped.position, owner.position);
        if (d > ZOMBIE_CONFIG.stats.attackRange) return;
        if (now - st.lastAttackAt < 800) return;
        st.lastAttackAt = now;

        const before = Number(owner.health) || 0;
        const after = Math.max(0, before - ZOMBIE_CONFIG.stats.damage);
        try {
            owner.health = after;
        } catch {}

        try {
            owner.call('z:playerDamagedByZombie', [st.zid]);
        } catch {}

        try {
            const infection = getInfection();
            if (infection && typeof infection.addBite === 'function') infection.addBite(owner);
        } catch {}

        setZombieState(st, ZOMBIE_STATE.ATTACK, zlog, `target=${owner.id}`);
        saveTask(st, 'attack', { rid: owner.id, dist: d });

        mp.players.forEach((p) => {
            if (p.dimension !== owner.dimension) return;
            try {
                p.call('npc:animHit', [st.zid, owner.id]);
            } catch {}
        });

        zlog(`attack zid=${st.zid} target=${owner.id} hp=${before}->${after}`);
    });
}

function cleanupDeadZombies() {
    const now = Date.now();

    zombies.forEach((st) => {
        if (!st.dead) return;
        const elapsed = now - st.deadAt;
        if (elapsed < ZOMBIE_CONFIG.timers.deadRemoveDelayMs) return;
        zlog(`cleanup-destroy zid=${st.zid} reason=dead-delay`);
        destroyZombie(st.zid, 'dead-delay');
    });
}

const controllerManager = createControllerManager({
    zlog,
    chooseController,
    setTaskIdle,
    restoreTask: (st) => restoreTask(st, {
        follow: (state) => {
            const owner = getPlayerById(mp, state.lastTaskData && state.lastTaskData.rid);
            if (owner && mp.players.exists(owner)) state.ownerRid = owner.id;
            if (state.state === ZOMBIE_STATE.CHASE && state.lastFollowTargetRid === state.ownerRid && Date.now() - (state.lastFollowSentAt || 0) < ZOMBIE_CONFIG.ai.skipDuplicateFollowMs) {
                return;
            }
            setZombieState(state, ZOMBIE_STATE.CHASE, zlog, 'restore-follow');
            setTaskFollow(state, 'restore-follow');
        },
        attack: (state, data) => {
            const owner = getPlayerById(mp, data && data.rid);
            if (!owner || !mp.players.exists(owner)) {
                setTaskIdle(state, 'restore-attack-invalid-target');
                setZombieState(state, ZOMBIE_STATE.IDLE, zlog, 'restore-attack-invalid-target');
                return;
            }
            state.ownerRid = owner.id;
            setZombieState(state, ZOMBIE_STATE.ATTACK, zlog, 'restore-attack');
            setTaskFollow(state, 'restore-attack-as-follow');
        },
        idle: (state, data) => {
            setZombieState(state, ZOMBIE_STATE.IDLE, zlog, 'restore-idle');
            setTaskIdle(state, (data && data.reason) || 'restore-idle');
        },
    }),
    getZone: (id) => zones.get(id),
    timers: ZOMBIE_CONFIG.timers,
});

function registerEvents() {
    zombieLootManager.registerEvents();
    mp.events.add('z:ctrlAck', (player, zid, ver) => {
        try {
            zid = parseInt(zid, 10);
            ver = parseInt(ver, 10);
            const st = zombies.get(zid);
            if (!st || st.dead) return;
            if (!mp.peds.exists(st.ped)) return;
            if (st.ped.getVariable('controllerRid') !== player.id) return;
            if (st.ped.getVariable('ctrlVer') !== ver) return;

            st.controllerRid = player.id;
            st.lastHeartbeatAt = Date.now();
            st.lastControllerAckAt = Date.now();
            st.stuckGraceUntil = Math.max(st.stuckGraceUntil || 0, st.lastControllerAckAt + (ZOMBIE_CONFIG.ai.stuckGraceAfterAckMs || 2500));
            st.ctrlVer = ver;
            controllerManager.onControllerAck(st, player.id, ver);
        } catch {}
    });

    mp.events.add('z:ctrlHeartbeat', (player, zidRaw, verRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const ver = parseInt(verRaw, 10);
            const st = zombies.get(zid);
            if (!st || st.dead) return;
            if (!mp.peds.exists(st.ped)) return;
            if (st.ped.getVariable('controllerRid') !== player.id) return;
            if (st.ped.getVariable('ctrlVer') !== ver) return;
            st.lastHeartbeatAt = Date.now();
            st.controllerRid = player.id;
            st.ctrlVer = ver;
        } catch {}
    });

    mp.events.add('z:hit', (player, zidRaw, dmgRaw, groundZRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const dmg = resolveZombieHitDamage(player, dmgRaw);
            zlog(`z:hit raw player=${player ? player.id : -1} zidRaw=${zidRaw} dmgRaw=${dmgRaw} groundZRaw=${groundZRaw}`);
            zlog(`z:hit parsed player=${player ? player.id : -1} zid=${zid} dmg=${dmg}`);
            const st = zombies.get(zid);
            if (!st) {
                zlog(`z:hit ignored by=${player ? player.id : -1} zid=${zid} dmg=${dmg} reason=no-state`);
                return;
            }
            if (st.dead) {
                zlog(`z:hit ignored by=${player ? player.id : -1} zid=${zid} dmg=${dmg} reason=already-dead`);
                return;
            }


            const groundZ = Number(groundZRaw);
            if (Number.isFinite(groundZ)) {
                st.lastGroundZ = groundZ;
                zlog(`z:hit groundZ accepted zid=${zid} groundZ=${groundZ.toFixed(2)}`);
            }
            zlog(`z:hit recv by=${player ? player.id : -1} zid=${zid} dmg=${dmg} hp=${st.hp}`);

            const oldHp = Math.max(0, parseInt(st.hp, 10) || ZOMBIE_CONFIG.stats.hp);
            const newHp = Math.max(0, oldHp - Math.max(1, dmg));
            st.hp = newHp;
            if (newHp <= 0) st.deadFlag = true;

            try {
                if (mp.peds.exists(st.ped)) {
                    st.ped.health = newHp;
                    if (newHp <= 0) st.ped.setVariable('deadFlag', true);
                }
            } catch {}

            if (newHp <= 0) {
                markDeadByHit(zid, player && player.name ? player.name : `rid:${player ? player.id : -1}`);
                zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg} hp=${oldHp}->0 DEAD`);
            } else {
                zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg} hp=${oldHp}->${newHp}`);
            }
        } catch (e) {
            zlog(`z:hit error ${e.message}`);
        }
    });

    mp.events.add('z:deadSignal', (player, zidRaw, reasonRaw, groundZRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const reason = typeof reasonRaw === 'string' ? reasonRaw : 'client-signal';
            zlog(`z:deadSignal raw player=${player ? player.id : -1} zidRaw=${zidRaw} reasonRaw=${reasonRaw} groundZRaw=${groundZRaw}`);
            zlog(`z:deadSignal parsed player=${player ? player.id : -1} zid=${zid} reason=${reason}`);
            const st = zombies.get(zid);
            if (!st) return;
            if (st.dead) return;

            const groundZ = Number(groundZRaw);
            if (Number.isFinite(groundZ)) {
                st.lastGroundZ = groundZ;
                zlog(`z:deadSignal groundZ accepted zid=${zid} groundZ=${groundZ.toFixed(2)}`);
            }

            const now = Date.now();
            if (now - (st.deadSignalAt || 0) < ZOMBIE_CONFIG.timers.deadSignalCooldownMs) return;
            st.deadSignalAt = now;

            zlog(`z:deadSignal recv by=${player ? player.id : -1} zid=${zid} reason=${reason}`);
            markDeadBySignal(zid, `${reason}:rid=${player ? player.id : -1}`);
            zlog(`deadSignal accepted zid=${zid} by=${player ? player.id : -1} reason=${reason}`);
        } catch (e) {
            zlog(`z:deadSignal error ${e.message}`);
        }
    });

    mp.events.add('zombies:respawn', (player) => {
        zones.forEach((zone) => {
            zone.zombieIds.slice().forEach((zid) => destroyZombie(zid, 'manual-reset'));
            zone.zombieIds = [];
            zone.active = false;
            zone.activatorRid = null;
            zone.firstSpawnAt = 0;
            zone.lastWaveAt = 0;
        });

        if (player && player.outputChatBox) {
            player.outputChatBox('!{#66ff66}[Z] Зомби очищены. Войдите в зону для нового спавна.');
        }
    });

    mp.events.add('characterInit.done', (player) => {
        setTimeout(() => syncZombieZoneMapBlips(player), 1500);
    });

    mp.events.add('zombies:zone:add', async (player, radiusRaw, zombieCountRaw, respawnSecRaw, ...nameParts) => {
        try {
            if (!player || !mp.players.exists(player)) return;

            const radius = Math.max(5, Number(radiusRaw) || 30);
            const zombieCount = Math.max(1, parseInt(zombieCountRaw, 10) || 3);
            const respawnSec = Math.max(1, parseInt(respawnSecRaw, 10) || 60);
            const respawnMs = respawnSec * 1000;
            const maxZombieCount = Math.max(zombieCount, zombieCount * 6);
            const zoneName = (nameParts || []).join(' ').trim() || `Zone_${Date.now()}`;

            const payload = {
                name: zoneName,
                x: Number(player.position.x),
                y: Number(player.position.y),
                z: Number(player.position.z),
                dimension: Number(player.dimension) || 0,
                radius,
                zombieCount,
                respawnMs,
                maxZombieCount,
                waveSize: zombieCount,
            };

            const dbRef = getDbRef();
            const dbModel = dbRef && dbRef.Models ? dbRef.Models.ZombieZone : null;
            let created = payload;
            if (dbModel) {
                try {
                    created = await dbModel.create(payload);
                } catch (error) {
                    const message = String(error && error.message ? error.message : error);
                    const hasUnknownColumn = /unknown column/i.test(message);
                    if (!hasUnknownColumn) throw error;

                    const cols = await getZombieZoneColumnSet();
                    if (!cols || !cols.size) throw error;

                    const legacyPayload = {
                        x: payload.x,
                        y: payload.y,
                        z: payload.z,
                    };

                    if (cols.has('name')) legacyPayload.name = payload.name;
                    if (cols.has('radius')) legacyPayload.radius = payload.radius;
                    if (cols.has('zombieCount')) legacyPayload.zombieCount = payload.zombieCount;
                    if (cols.has('respawnMs')) legacyPayload.respawnMs = payload.respawnMs;
                    if (cols.has('maxZombieCount')) legacyPayload.maxZombieCount = payload.maxZombieCount;
                    if (cols.has('waveSize')) legacyPayload.waveSize = payload.waveSize;
                    if (cols.has('dimension')) legacyPayload.dimension = payload.dimension;

                    created = await dbModel.create(legacyPayload);
                    created = buildLegacyZoneFromRow(created);
                    zlog(`ZombieZone create fallback: compat insert with columns=${Object.keys(legacyPayload).join(',')}`);
                }
            } else {
                const fallbackId = zones.size ? Math.max(...Array.from(zones.keys())) + 1 : 1;
                created = { ...payload, id: fallbackId };
            }

            const zone = upsertZone(created);

            if (isPlayerInZone(player, zone)) {
                spawnZoneOnEnter(zone, player);
            }

            player.outputChatBox(`!{#66ff66}[Z] Добавлена зона #${zone.id}: ${zone.name} | dim=${zone.dimension} | R=${zone.radius} | spawn=${zone.zombieCount} | respawn=${(zone.respawnMs / 1000).toFixed(0)}s`);
            console.log(`[Z] zone added id=${zone.id} name=${zone.name} dim=${zone.dimension} pos=${zone.x.toFixed(2)},${zone.y.toFixed(2)},${zone.z.toFixed(2)} radius=${zone.radius} spawn=${zone.zombieCount} respawnMs=${zone.respawnMs}`);
            syncZombieZoneMapBlipsForAll();
        } catch (e) {
            if (player && player.outputChatBox) {
                player.outputChatBox(`!{#ff6666}[Z] Ошибка добавления зоны: ${e.message}`);
            }
            zlog(`zone-add error: ${e.message}`);
        }
    });

    mp.events.add('zombies:zone:addPolygon', async (player, payloadRaw) => {
        try {
            if (!player || !mp.players.exists(player)) return;

            const payloadClient = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : (payloadRaw || {});
            const zonePoints = normalizeZonePoints(payloadClient.points);
            if (zonePoints.length < 3) {
                player.outputChatBox('!{#ff6666}[Z] Нужно минимум 3 точки для полигональной зоны.');
                return;
            }

            const zombieCount = Math.max(1, parseInt(payloadClient.zombieCount, 10) || 3);
            const respawnSec = Math.max(1, parseInt(payloadClient.respawnSec, 10) || 60);
            const respawnMs = respawnSec * 1000;
            const maxZombieCount = Math.max(zombieCount, zombieCount * 6);
            const zoneName = String(payloadClient.name || '').trim() || `Zone_${Date.now()}`;

            const sum = zonePoints.reduce((acc, p) => {
                acc.x += p.x;
                acc.y += p.y;
                acc.z += p.z;
                return acc;
            }, { x: 0, y: 0, z: 0 });
            const center = {
                x: sum.x / zonePoints.length,
                y: sum.y / zonePoints.length,
                z: sum.z / zonePoints.length,
            };

            const radius = Math.max(5, ...zonePoints.map((p) => dist3(center, p)));

            const payload = {
                name: zoneName,
                x: center.x,
                y: center.y,
                z: center.z,
                dimension: Number(player.dimension) || 0,
                radius,
                zombieCount,
                respawnMs,
                maxZombieCount,
                waveSize: zombieCount,
                points: JSON.stringify(zonePoints),
            };

            const dbRef = getDbRef();
            const dbModel = dbRef && dbRef.Models ? dbRef.Models.ZombieZone : null;
            let created = payload;

            if (dbModel) {
                try {
                    created = await dbModel.create(payload);
                } catch (error) {
                    const message = String(error && error.message ? error.message : error);
                    const hasUnknownColumn = /unknown column/i.test(message);
                    if (!hasUnknownColumn) throw error;

                    const cols = await getZombieZoneColumnSet();
                    if (!cols || !cols.size) throw error;

                    const legacyPayload = {
                        x: payload.x,
                        y: payload.y,
                        z: payload.z,
                    };

                    if (cols.has('name')) legacyPayload.name = payload.name;
                    if (cols.has('radius')) legacyPayload.radius = payload.radius;
                    if (cols.has('zombieCount')) legacyPayload.zombieCount = payload.zombieCount;
                    if (cols.has('respawnMs')) legacyPayload.respawnMs = payload.respawnMs;
                    if (cols.has('maxZombieCount')) legacyPayload.maxZombieCount = payload.maxZombieCount;
                    if (cols.has('waveSize')) legacyPayload.waveSize = payload.waveSize;
                    if (cols.has('dimension')) legacyPayload.dimension = payload.dimension;
                    if (cols.has('points')) legacyPayload.points = payload.points;

                    created = await dbModel.create(legacyPayload);
                    created = buildLegacyZoneFromRow(created);
                }
            } else {
                const fallbackId = zones.size ? Math.max(...Array.from(zones.keys())) + 1 : 1;
                created = { ...payload, id: fallbackId };
            }

            const zone = upsertZone(created);
            player.outputChatBox(`!{#66ff66}[Z] Полигональная зона #${zone.id} сохранена: ${zone.name} | точек=${zone.points.length} | dim=${zone.dimension}`);
            console.log(`[Z] polygon zone added id=${zone.id} name=${zone.name} points=${zone.points.length} dim=${zone.dimension}`);
            syncZombieZoneMapBlipsForAll();

            if (isPlayerInZone(player, zone)) {
                spawnZoneOnEnter(zone, player);
            }
        } catch (e) {
            if (player && player.outputChatBox) {
                player.outputChatBox(`!{#ff6666}[Z] Ошибка сохранения полигональной зоны: ${e.message}`);
            }
            zlog(`zone-add-polygon error: ${e.message}`);
        }
    });
}


function processZoneInfectionExposure() {
    const infection = getInfection();
    if (!infection || typeof infection.applyZoneExposure !== 'function') return;

    const exposedPlayerIds = new Set();
    zones.forEach((zone) => {
        try {
            playersInZone(mp, zone).forEach((player) => {
                if (!player || !player.character) return;
                if (exposedPlayerIds.has(player.id)) return;
                exposedPlayerIds.add(player.id);
                infection.applyZoneExposure(player, zone.name || 'заражённая зона');
            });
        } catch {}
    });
}

function registerLoops() {
    zombieLootManager.registerLoops();
    setInterval(() => {
        try {
            updateZoneEntryState();
        } catch {}
    }, ZOMBIE_CONFIG.timers.zoneEntryScanMs);

    setInterval(() => {
        try {
            processZoneInfectionExposure();
        } catch {}
    }, 5 * 1000);

    setInterval(async () => {
        try {
            await loadZonesFromDb({ fallbackToConfig: false });
            syncZombieZoneMapBlipsForAll();
            spawnZonesByPresenceCheck();
        } catch {}
    }, 15000);

    setInterval(() => {
        try {
            spawnZoneWaves();
        } catch {}
    }, ZOMBIE_CONFIG.timers.waveSpawnCheckMs);

    setInterval(() => {
        try {
            syncAllZombieFollow();
        } catch {}
    }, ZOMBIE_CONFIG.timers.syncMs);

    setInterval(() => {
        try {
            processZombieAttacks();
        } catch {}
    }, ZOMBIE_CONFIG.timers.attackMs);

    setInterval(() => {
        try {
            syncDeadStateFromPed();
        } catch {}
    }, ZOMBIE_CONFIG.timers.deadSyncMs);

    setInterval(() => {
        try {
            cleanupDeadZombies();
            cleanupEmptyZones();
        } catch {}
    }, ZOMBIE_CONFIG.timers.cleanupMs);
}

async function initZombieController() {
    registerEvents();
    await ensureZombieZoneSchema();
    await loadZonesFromDb();
    registerLoops();
    console.log(`✅ Zombies server controller loaded (zones=${zones.size})`);
}

module.exports = {
    initZombieController,
};
