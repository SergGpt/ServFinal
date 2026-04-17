const { SECURITY_CONFIG } = require('./security.config');
const { SECURITY_STATE, setSecurityState } = require('./security.state');
const { saveTask, restoreTask } = require('./securityTaskMemory');
const { createSecurityControllerManager } = require('./securityControllerManager');

function log(msg) {
    console.log(`[SECURITY] ${msg}`);
}

function dist3(a, b) {
    try {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch {
        return 99999;
    }
}

const zones = new Map();
const npcs = new Map();
let nextNid = 1;

function nextId() {
    return nextNid++;
}

function playersInZone(zone) {
    const list = [];
    mp.players.forEach((p) => {
        try {
            if (!p || !mp.players.exists(p)) return;
            if (p.dimension !== zone.dimension) return;
            if (dist3(p.position, zone) <= zone.radius) list.push(p);
        } catch {}
    });
    return list;
}

function chooseController(zone, ped, preferredRid = null) {
    let best = null;
    let bestDist = Infinity;
    mp.players.forEach((p) => {
        try {
            if (!p || !mp.players.exists(p)) return;
            if (p.dimension !== zone.dimension) return;
            const d = dist3(p.position, ped.position);
            if (preferredRid !== null && p.id === preferredRid) {
                if (d <= SECURITY_CONFIG.stats.controllerMaxDistance && d < bestDist) {
                    best = p;
                    bestDist = d;
                }
                return;
            }
            if (d <= SECURITY_CONFIG.stats.controllerMaxDistance && d < bestDist) {
                best = p;
                bestDist = d;
            }
        } catch {}
    });
    return best;
}

function randomFrom(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function giveWeapon(ped, weaponName) {
    try {
        const hash = mp.joaat(weaponName);
        ped.giveWeapon(hash, 9999);
        ped.setWeapon(hash);
        ped.currentWeapon = hash;
    } catch {}
}

function createNpc(zone, role, target) {
    const angle = Math.random() * Math.PI * 2;
    const d = 6 + Math.random() * 8;
    const x = zone.x + Math.cos(angle) * d;
    const y = zone.y + Math.sin(angle) * d;
    const z = zone.z;
    const modelName = role === 'chief' ? randomFrom(SECURITY_CONFIG.models.chief) : randomFrom(SECURITY_CONFIG.models.guard);
    const ped = mp.peds.new(mp.joaat(modelName), new mp.Vector3(x, y, z), { dynamic: true, invincible: false });

    ped.dimension = zone.dimension;
    const nid = nextId();

    ped.setVariable('secZoneId', zone.id);
    ped.setVariable('secNpcId', nid);
    ped.setVariable('secRole', role);
    ped.setVariable('controllerRid', -1);
    ped.setVariable('secState', SECURITY_STATE.IDLE);
    ped.setVariable('secCommand', 'idle');
    ped.setVariable('secCommandExtra', null);

    try {
        ped.health = SECURITY_CONFIG.stats.hp;
        ped.setHealth(SECURITY_CONFIG.stats.hp);
    } catch {}

    giveWeapon(ped, role === 'chief' ? SECURITY_CONFIG.weapons.chief : SECURITY_CONFIG.weapons.guard);

    const st = {
        nid,
        role,
        zoneId: zone.id,
        ped,
        targetRid: target ? target.id : null,
        controllerRid: null,
        ctrlVer: 0,
        switching: false,
        switchStartAt: 0,
        lastHeartbeatAt: 0,
        state: SECURITY_STATE.IDLE,
        friskingTargetRid: null,
        lastTaskType: null,
        lastTaskData: null,
        lastTaskAt: 0,
        friskEndAt: 0,
    };

    npcs.set(nid, st);
    zone.npcIds.push(nid);
    controllerManager.beginSwitch(st, 'spawn');
    return st;
}

function clearZoneNpcs(zone) {
    const ids = Array.isArray(zone.npcIds) ? [...zone.npcIds] : [];
    ids.forEach((nid) => {
        const st = npcs.get(nid);
        if (!st) return;
        try {
            if (st.ped && mp.peds.exists(st.ped)) st.ped.destroy();
        } catch {}
        npcs.delete(nid);
    });
    zone.npcIds = [];
    zone.active = false;
}

function ensureZoneSpawned(zone) {
    const players = playersInZone(zone);
    if (!players.length) {
        if (zone.active && zone.npcIds.length) {
            clearZoneNpcs(zone);
            log(`zone ${zone.id}: guards despawned (empty zone)`);
        }
        return;
    }

    const target = players[0];
    if (!zone.active || !zone.npcIds.length) {
        zone.active = true;
        zone.npcIds = [];
        for (let i = 0; i < SECURITY_CONFIG.guardsPerZone; i++) createNpc(zone, 'guard', target);
        for (let i = 0; i < SECURITY_CONFIG.chiefsPerZone; i++) createNpc(zone, 'chief', target);
        log(`zone ${zone.id}: spawned 4 security NPCs`);
    }

    zone.targetRid = target.id;
    zone.npcIds.forEach((nid) => {
        const st = npcs.get(nid);
        if (st) st.targetRid = target.id;
    });
}

function setTaskHoldAim(st, targetRid) {
    if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    const payload = { rid: targetRid, aimDist: SECURITY_CONFIG.stats.guardAimDistance };
    try { ctrl.call('sec:executeCommand', [st.nid, 'holdAim', JSON.stringify(payload)]); } catch {}
    try {
        st.ped.setVariable('secCommand', 'holdAim');
        st.ped.setVariable('secCommandExtra', payload);
    } catch {}
    saveTask(st, 'holdAim', payload);
    setSecurityState(st, SECURITY_STATE.HOLDING, log, 'guard-hold');
}

function setTaskChiefFrisk(st, targetRid) {
    if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    const payload = {
        rid: targetRid,
        stopDist: SECURITY_CONFIG.stats.chiefStopDistance,
        friskDist: SECURITY_CONFIG.stats.friskDistance,
    };

    try { ctrl.call('sec:executeCommand', [st.nid, 'chiefFrisk', JSON.stringify(payload)]); } catch {}
    try {
        st.ped.setVariable('secCommand', 'chiefFrisk');
        st.ped.setVariable('secCommandExtra', payload);
    } catch {}
    saveTask(st, 'chiefFrisk', payload);
    setSecurityState(st, SECURITY_STATE.APPROACH, log, 'chief-approach');
}

function performBehaviorTick() {
    zones.forEach((zone) => {
        ensureZoneSpawned(zone);

        if (!zone.active) return;
        const target = mp.players.at(zone.targetRid);
        if (!target || !mp.players.exists(target)) return;

        zone.npcIds.forEach((nid) => {
            const st = npcs.get(nid);
            if (!st || !st.ped || !mp.peds.exists(st.ped)) return;

            controllerManager.checkTimeout(st);

            const zonePlayers = playersInZone(zone);
            const nearest = zonePlayers.sort((a, b) => dist3(a.position, st.ped.position) - dist3(b.position, st.ped.position))[0] || target;
            st.targetRid = nearest ? nearest.id : target.id;

            const correctController = chooseController(zone, st.ped, st.targetRid);
            if (correctController && st.controllerRid !== correctController.id && !st.switching) {
                controllerManager.beginSwitch(st, 'better-controller');
                return;
            }

            if (st.role === 'chief') {
                if (st.friskEndAt && Date.now() < st.friskEndAt) {
                    setSecurityState(st, SECURITY_STATE.FRISK, log, 'frisk-running');
                    return;
                }
                setTaskChiefFrisk(st, st.targetRid);
            } else {
                setTaskHoldAim(st, st.targetRid);
            }
        });
    });
}

async function loadZones() {
    const dbRef = global.db;
    const Model = dbRef && dbRef.Models ? dbRef.Models.SecurityZone : null;
    if (!Model) {
        log('SecurityZone model is missing; no DB zones loaded');
        return;
    }
    const rows = await Model.findAll().catch(() => []);
    rows.forEach((row) => {
        const zone = row.get ? row.get({ plain: true }) : row;
        zones.set(Number(zone.id), {
            id: Number(zone.id),
            name: zone.name || `Security Zone #${zone.id}`,
            x: Number(zone.x) || 0,
            y: Number(zone.y) || 0,
            z: Number(zone.z) || 0,
            dimension: Number(zone.dimension) || 0,
            radius: Number(zone.radius) || SECURITY_CONFIG.zoneRadius,
            active: false,
            npcIds: [],
            targetRid: null,
        });
    });
    log(`loaded zones=${zones.size}`);
}

const controllerManager = createSecurityControllerManager({
    chooseController,
    getZone: (id) => zones.get(id),
    logger: log,
    timers: {
        controllerTimeoutMs: SECURITY_CONFIG.timers.controllerTimeoutMs,
        switchCooldownMs: SECURITY_CONFIG.timers.switchCooldownMs,
    },
    restoreTask: (st) => restoreTask(st, {
        holdAim: (s, data) => setTaskHoldAim(s, data.rid),
        chiefFrisk: (s, data) => setTaskChiefFrisk(s, data.rid),
    }),
});

async function addZone(player, name) {
    if (!player || !mp.players.exists(player)) return null;
    const dbRef = global.db;
    const Model = dbRef && dbRef.Models ? dbRef.Models.SecurityZone : null;
    if (!Model) throw new Error('SecurityZone model is not registered in db.Models');

    const created = await Model.create({
        name: name || 'Security Zone',
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        dimension: player.dimension || 0,
        radius: SECURITY_CONFIG.zoneRadius,
    });

    const zone = created.get ? created.get({ plain: true }) : created;
    zones.set(Number(zone.id), {
        id: Number(zone.id),
        name: zone.name,
        x: Number(zone.x) || 0,
        y: Number(zone.y) || 0,
        z: Number(zone.z) || 0,
        dimension: Number(zone.dimension) || 0,
        radius: Number(zone.radius) || SECURITY_CONFIG.zoneRadius,
        active: false,
        npcIds: [],
        targetRid: null,
    });

    return zone;
}

async function initSecurityController() {
    await loadZones();

    mp.events.add('security:zone:add', async (player, name) => {
        const zone = await addZone(player, name);
        if (zone) {
            try { player.outputChatBox(`!{#99ff99}[SECURITY] Zone created id=${zone.id} radius=${zone.radius}`); } catch {}
            log(`zone created id=${zone.id} by=${player.id}`);
        }
    });

    mp.events.add('security:respawn', async () => {
        zones.forEach((zone) => clearZoneNpcs(zone));
    });

    mp.events.add('playerQuit', (player) => {
        npcs.forEach((st) => {
            if (st.controllerRid === player.id) controllerManager.beginSwitch(st, 'player-quit');
            if (st.targetRid === player.id) st.targetRid = null;
            if (st.friskingTargetRid === player.id) st.friskingTargetRid = null;
        });
    });

    mp.events.add('sec:ctrlAck', (player, nid, ver) => {
        const st = npcs.get(parseInt(nid));
        if (st) controllerManager.onControllerAck(st, player.id, parseInt(ver));
    });

    mp.events.add('sec:heartbeat', (player, nid) => {
        const st = npcs.get(parseInt(nid));
        if (st) controllerManager.onHeartbeat(st, player.id);
    });

    mp.events.add('sec:chiefReachedTarget', (player, nid, rid) => {
        const st = npcs.get(parseInt(nid));
        const target = mp.players.at(parseInt(rid));
        if (!st || !target || !mp.players.exists(target)) return;
        if (st.controllerRid !== player.id) return;

        const d = dist3(st.ped.position, target.position);
        if (d > SECURITY_CONFIG.stats.friskDistance + 0.35) return;

        st.friskingTargetRid = target.id;
        st.friskEndAt = Date.now() + SECURITY_CONFIG.stats.friskDurationMs;
        setSecurityState(st, SECURITY_STATE.FRISK, log, 'chief-reached-target');

        try { target.call('sec:friskStart', [st.nid, SECURITY_CONFIG.stats.friskDurationMs]); } catch {}
        try { player.call('sec:executeCommand', [st.nid, 'playFriskAnim', JSON.stringify({ rid: target.id })]); } catch {}

        setTimeout(() => {
            if (!npcs.has(st.nid)) return;
            if (st.friskingTargetRid !== target.id) return;
            try { target.call('sec:friskStop', [st.nid]); } catch {}
            st.friskingTargetRid = null;
            st.friskEndAt = 0;
            setSecurityState(st, SECURITY_STATE.IDLE, log, 'frisk-finished');
        }, SECURITY_CONFIG.stats.friskDurationMs);
    });

    setInterval(performBehaviorTick, SECURITY_CONFIG.timers.behaviorMs);

    log(`server controller loaded (zones=${zones.size})`);
}

module.exports = { initSecurityController };
