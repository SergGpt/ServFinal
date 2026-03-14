const { ZOMBIE_CONFIG } = require('./zombie.config');
const {
    createLogger,
    dist3,
    getPlayerById,
    isPlayerInZone,
    playersInZone,
    isPlayerValidTarget,
    chooseNearestTarget,
} = require('./zombie.utils');
const { ZOMBIE_STATE, setZombieState } = require('./zombie.state');
const { saveTask, clearTask, restoreTask } = require('./zombieTaskMemory');
const { createControllerManager } = require('./zombieControllerManager');
const damageSystem = require('../damageSystem/index.js');
const { createZombieLootManager } = require('./zombieLoot');

const zlog = createLogger(ZOMBIE_CONFIG.debug, 'ZCTRL');

const zones = new Map();
const zombies = new Map();
const zombieLootManager = createZombieLootManager();

function toRuntimeZone(raw) {
    const radius = Math.max(5, Number(raw.radius) || 30);
    const zombieCount = Math.max(1, parseInt(raw.zombieCount, 10) || 3);
    const maxZombieCount = Math.max(zombieCount, parseInt(raw.maxZombieCount, 10) || zombieCount);
    const waveSize = Math.max(1, parseInt(raw.waveSize, 10) || zombieCount);

    return {
        id: parseInt(raw.id, 10),
        name: raw.name || `Zombie Zone #${raw.id}`,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        z: Number(raw.z) || 0,
        radius,
        zombieCount,
        maxZombieCount,
        waveSize,
        respawnMs: Math.max(1000, parseInt(raw.respawnMs, 10) || ZOMBIE_CONFIG.timers.waveIntervalMs),
        zombieIds: [],
        active: false,
        activatorRid: null,
        firstSpawnAt: 0,
        lastWaveAt: 0,
    };
}

function upsertZone(raw) {
    const runtimeZone = toRuntimeZone(raw);
    zones.set(runtimeZone.id, runtimeZone);
    return runtimeZone;
}

async function loadZonesFromDb() {
    const dbModel = db && db.Models ? db.Models.ZombieZone : null;
    if (!dbModel) {
        zlog('ZombieZone model is missing, fallback to config zones');
        ZOMBIE_CONFIG.zones.forEach((zone) => upsertZone(zone));
        return;
    }

    const dbZones = await dbModel.findAll();
    if (!dbZones.length) {
        zlog('ZombieZone table is empty, fallback to config zones');
        ZOMBIE_CONFIG.zones.forEach((zone) => upsertZone(zone));
        return;
    }

    dbZones.forEach((zone) => upsertZone(zone));
    console.log(`[Z] loaded ${dbZones.length} zombie zones from DB`);
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
    const angle = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * Math.max(4, zone.radius - 10);
    const x = zone.x + Math.cos(angle) * d;
    const y = zone.y + Math.sin(angle) * d;
    const z = zone.z;

    const ped = mp.peds.new(mp.joaat(randomModel()), new mp.Vector3(x, y, z), {
        dynamic: true,
        invincible: false,
    });

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

    console.log(`[Z] spawn zid=${zid} in zone=${zone.id}`);
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

    zone.active = true;
    zone.activatorRid = activator.id;

    const spawned = spawnWave(zone, activator, zone.zombieCount, 'initial-enter');
    if (spawned > 0) {
        const now = Date.now();
        zone.firstSpawnAt = now;
        zone.lastWaveAt = now;
        console.log(`[ZONE] Spawning ${spawned} zombies in "${zone.name}"`);
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
                zlog(`player ${player.id} entered zone=${zoneId}`);
            } else if (!inZone && wasInZone) {
                player.setVariable(key, false);
                zlog(`player ${player.id} left zone=${zoneId}`);
            }
        });
    });
}

function cleanupEmptyZones() {
    zones.forEach((zone) => {
        const plist = playersInZone(mp, zone);
        if (plist.length) return;

        zone.active = false;
        zone.activatorRid = null;
        zone.firstSpawnAt = 0;
        zone.lastWaveAt = 0;

        zone.zombieIds.forEach((zid) => {
            const st = zombies.get(zid);
            if (!st || st.dead) return;

            st.ownerRid = null;
            if (st.switching) return;

            setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'zone-empty');
            if (ZOMBIE_CONFIG.ai.emptyZoneBehavior === 'destroy') {
                destroyZombie(zid, 'zone-empty');
            } else {
                setTaskIdle(st, 'zone-empty');
            }
        });
    });
}

function spawnZonesByPresenceCheck() {
    zones.forEach((zone) => {
        const plist = playersInZone(mp, zone);
        if (!plist.length) {
            zlog(`presence-check zone=${zone.id}: empty, skip spawn`);
            return;
        }

        if (zone.zombieIds.length) {
            zlog(`presence-check zone=${zone.id}: already active (${zone.zombieIds.length} zombies)`);
            return;
        }

        const target = chooseNearestTarget(mp, zone, { x: zone.x, y: zone.y, z: zone.z });
        if (!target) return;

        zlog(`presence-check zone=${zone.id}: players=${plist.length}, spawn start`);
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

        const target = chooseNearestTarget(mp, zone, st.ped.position, {
            maxDistance: ZOMBIE_CONFIG.ai.maxTargetDistance,
            dimension: st.ped.dimension,
        });

        if (!target) {
            st.ownerRid = null;
            if (st.state !== ZOMBIE_STATE.SLEEP) {
                setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'no-valid-target');
                setTaskIdle(st, 'sleep-no-target');
            }
            return;
        }

        const distToTarget = dist3(st.ped.position, target.position);
        if (distToTarget > ZOMBIE_CONFIG.ai.sleepWakeDistance) {
            st.ownerRid = null;
            if (st.state !== ZOMBIE_STATE.SLEEP) {
                setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, `far-target=${distToTarget.toFixed(1)}`);
                setTaskIdle(st, 'sleep-far-target');
            }
            return;
        }

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

        setZombieState(st, ZOMBIE_STATE.CHASE, zlog, `target=${target.id}`);
        setTaskFollow(st, 'sync-chase');
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
                radius,
                zombieCount,
                respawnMs,
                maxZombieCount,
                waveSize: zombieCount,
            };

            const dbModel = db && db.Models ? db.Models.ZombieZone : null;
            let created = payload;
            if (dbModel) {
                created = await dbModel.create(payload);
            } else {
                const fallbackId = zones.size ? Math.max(...Array.from(zones.keys())) + 1 : 1;
                created = { ...payload, id: fallbackId };
            }

            const zone = upsertZone(created);

            player.outputChatBox(`!{#66ff66}[Z] Добавлена зона #${zone.id}: ${zone.name} | R=${zone.radius} | spawn=${zone.zombieCount} | respawn=${(zone.respawnMs / 1000).toFixed(0)}s`);
            console.log(`[Z] zone added id=${zone.id} name=${zone.name} pos=${zone.x.toFixed(2)},${zone.y.toFixed(2)},${zone.z.toFixed(2)} radius=${zone.radius} spawn=${zone.zombieCount} respawnMs=${zone.respawnMs}`);
        } catch (e) {
            if (player && player.outputChatBox) {
                player.outputChatBox(`!{#ff6666}[Z] Ошибка добавления зоны: ${e.message}`);
            }
            zlog(`zone-add error: ${e.message}`);
        }
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
            spawnZonesByPresenceCheck();
        } catch {}
    }, ZOMBIE_CONFIG.timers.zonePresenceMs);

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
    await loadZonesFromDb();
    registerLoops();
    console.log(`✅ Zombies server controller loaded (zones=${zones.size})`);
}

module.exports = {
    initZombieController,
};
