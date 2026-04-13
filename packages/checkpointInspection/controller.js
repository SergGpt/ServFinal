const CFG = require('./config');

const COMMAND = {
    IDLE: 'idle',
    FOLLOW: 'followTarget',
    AIM: 'aimTarget',
    SHOOT: 'shootTarget',
    RETURN: 'returnToPost',
    DEAD: 'dead',
};

const guards = new Map();
const inspections = new Map(); // rid -> session
const hostiles = new Set();
let entryShape = null;

function dist(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    const dz = Number(a.z) - Number(b.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getPlayerById(id) {
    let found = null;
    mp.players.forEach((p) => {
        if (!found && p && p.id === id) found = p;
    });
    return found;
}

function sendToAll(eventName, args = []) {
    mp.players.forEach((player) => {
        try { player.call(eventName, args); } catch {}
    });
}

function isValidController(player, guard) {
    if (!player || !mp.players.exists(player)) return false;
    if ((Number(player.dimension) || 0) !== CFG.DIMENSION) return false;
    return dist(player.position, guard.ped ? guard.ped.position : guard.postVec) <= CFG.CONTROLLER_MAX_DISTANCE;
}

function chooseController(guard, preferred = null) {
    if (preferred && isValidController(preferred, guard)) return preferred;

    let best = null;
    let bestDist = Infinity;
    mp.players.forEach((player) => {
        if (!isValidController(player, guard)) return;
        const d = dist(player.position, guard.ped ? guard.ped.position : guard.postVec);
        if (d < bestDist) {
            bestDist = d;
            best = player;
        }
    });

    return best;
}

function sendGuardCommand(guard, command, extra = null, reason = 'logic') {
    if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;

    guard.currentCommand = command;
    guard.currentExtra = extra;
    guard.lastCommandAt = Date.now();

    try {
        guard.ped.setVariable('cpiCommand', command);
        guard.ped.setVariable('cpiCommandExtra', extra);
    } catch {}

    const ctrl = guard.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    try {
        ctrl.call('cpi:executeCommand', [guard.id, command, JSON.stringify(extra || {}), reason]);
    } catch {}
}

function switchController(guard, reason = 'switch', preferred = null) {
    if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return false;

    const next = chooseController(guard, preferred);
    if (!next) {
        guard.controllerRid = null;
        guard.switching = false;
        sendGuardCommand(guard, COMMAND.IDLE, { reason: `no-controller:${reason}` }, reason);
        return false;
    }

    guard.ctrlVer += 1;
    guard.switching = true;
    guard.switchStartAt = Date.now();
    guard.controllerRid = next.id;
    guard.lastHeartbeatAt = 0;

    try {
        guard.ped.controller = undefined;
        guard.ped.setVariable('controllerRid', -1);
        guard.ped.setVariable('ctrlVer', guard.ctrlVer);
        guard.ped.setVariable('ctrlState', 'switching');

        guard.ped.dimension = next.dimension;
        guard.ped.controller = next;
        guard.ped.setVariable('controllerRid', next.id);
    } catch {}

    try { next.call('cpi:assignController', [guard.id, guard.ctrlVer]); } catch {}

    return true;
}

function spawnGuard(guardCfg) {
    const postVec = new mp.Vector3(guardCfg.post.x, guardCfg.post.y, guardCfg.post.z);

    const ped = mp.peds.new(mp.joaat(guardCfg.model), postVec, {
        dynamic: true,
        invincible: false,
    });

    ped.dimension = CFG.DIMENSION;
    ped.heading = Number(guardCfg.heading) || 0;
    ped.setVariable('cpiGuardId', guardCfg.id);
    ped.setVariable('controllerRid', -1);
    ped.setVariable('ctrlVer', 0);
    ped.setVariable('ctrlState', 'sleep');
    ped.setVariable('deadFlag', false);
    ped.setVariable('cpiCommand', COMMAND.IDLE);
    ped.setVariable('cpiCommandExtra', null);

    try {
        ped.health = guardCfg.hp;
        if (typeof ped.setHealth === 'function') ped.setHealth(guardCfg.hp);
    } catch {}

    const guard = {
        id: guardCfg.id,
        postVec,
        heading: Number(guardCfg.heading) || 0,
        hp: Number(guardCfg.hp) || 250,
        ped,
        dead: false,
        deadAt: 0,
        ctrlVer: 0,
        controllerRid: null,
        switching: false,
        switchStartAt: 0,
        lastHeartbeatAt: 0,
        lastDeadSignalAt: 0,
        lastCommandAt: 0,
        currentCommand: COMMAND.IDLE,
        currentExtra: null,
        respawnTimer: null,
    };

    guards.set(guard.id, guard);
    switchController(guard, 'spawn');
    return guard;
}

function destroyGuard(guard) {
    if (!guard) return;
    try {
        if (guard.ped && mp.peds.exists(guard.ped)) guard.ped.destroy();
    } catch {}
}

function markGuardDead(guard, reason = 'unknown') {
    if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;

    guard.dead = true;
    guard.deadAt = Date.now();

    try {
        guard.ped.setVariable('deadFlag', true);
        guard.ped.setVariable('cpiCommand', COMMAND.DEAD);
        guard.ped.setVariable('cpiCommandExtra', { reason });
    } catch {}

    sendGuardCommand(guard, COMMAND.DEAD, { reason }, reason);
    sendToAll('cpi:dead', [guard.id, reason]);

    setTimeout(() => {
        destroyGuard(guard);
        sendToAll('cpi:forceRemove', [guard.id]);
    }, 2000);

    guard.respawnTimer = setTimeout(() => {
        guards.delete(guard.id);
        const cfg = CFG.GUARDS.find((g) => g.id === guard.id);
        if (cfg) spawnGuard(cfg);
    }, CFG.DEAD_RESPAWN_MS);
}

function startInspection(player) {
    if (!player || !mp.players.exists(player)) return;
    const rid = player.id;
    const now = Date.now();

    const nearestGuard = getNearestAliveGuardToPos(player.position);

    inspections.set(rid, {
        enteredAt: now,
        reachUntil: now + CFG.REACH_POINT_MS,
        standingSince: 0,
        guardId: nearestGuard ? nearestGuard.id : null,
    });
    hostiles.delete(rid);

    try {
        player.call('cpi:inspection:start', [{
            waitPoint: CFG.WAIT_POS,
            waitRadius: CFG.WAIT_RADIUS,
            reachDurationMs: CFG.REACH_POINT_MS,
            holdDurationMs: CFG.HOLD_STILL_MS,
            text: 'Двигайтесь на указанную точку',
        }]);
    } catch {}
}

function stopInspection(rid, reason = 'done') {
    inspections.delete(rid);
    const player = getPlayerById(rid);
    if (player && mp.players.exists(player)) {
        try { player.call('cpi:inspection:stop', [reason]); } catch {}
    }
}

function completeInspection(rid) {
    hostiles.delete(rid);
    const player = getPlayerById(rid);
    if (player && mp.players.exists(player)) {
        try { player.call('cpi:inspection:approved', ['Проверка завершена. Можете ехать дальше.']); } catch {}
    }
    stopInspection(rid, 'completed');
}

function violationInspection(rid, reason = 'failed') {
    hostiles.add(rid);
    stopInspection(rid, reason);
}

function processInspections() {
    const now = Date.now();
    const waitPos = CFG.WAIT_POS;

    inspections.forEach((session, rid) => {
        const player = getPlayerById(rid);
        if (!player || !mp.players.exists(player)) {
            inspections.delete(rid);
            hostiles.delete(rid);
            return;
        }

        if ((Number(player.dimension) || 0) !== CFG.DIMENSION) {
            violationInspection(rid, 'wrong-dimension');
            return;
        }

        const inside = dist(player.position, waitPos) <= CFG.WAIT_RADIUS;
        if (now > session.reachUntil && !inside) {
            violationInspection(rid, 'timeout-to-point');
            return;
        }

        if (inside) {
            if (!session.standingSince) {
                session.standingSince = now;
                try { player.call('cpi:inspection:hold', [CFG.HOLD_STILL_MS]); } catch {}
            }

            if (now - session.standingSince >= CFG.HOLD_STILL_MS) completeInspection(rid);
            return;
        }

        session.standingSince = 0;
    });
}

function getNearestRidFromSet(sourceSet) {
    let bestRid = null;
    let bestDist = Infinity;

    sourceSet.forEach((rid) => {
        const player = getPlayerById(rid);
        if (!player || !mp.players.exists(player)) {
            sourceSet.delete(rid);
            return;
        }

        const d = dist(player.position, CFG.ENTRY_POS);
        if (d < bestDist) {
            bestDist = d;
            bestRid = rid;
        }
    });

    return bestRid;
}

function getNearestAliveGuardToPos(pos) {
    let best = null;
    let bestDist = Infinity;

    guards.forEach((guard) => {
        if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;
        const d = dist(guard.ped.position, pos);
        if (d < bestDist) {
            bestDist = d;
            best = guard;
        }
    });

    return best;
}

function getOldestInspection() {
    let bestRid = null;
    let bestSession = null;

    inspections.forEach((session, rid) => {
        if (!bestSession || session.enteredAt < bestSession.enteredAt) {
            bestSession = session;
            bestRid = rid;
        }
    });

    return { rid: bestRid, session: bestSession };
}

function getTrackedPlayersSet() {
    const tracked = new Set();
    inspections.forEach((_, rid) => tracked.add(rid));
    hostiles.forEach((rid) => tracked.add(rid));
    return tracked;
}

function tickBehavior() {
    processInspections();

    const hostileRid = getNearestRidFromSet(hostiles);
    if (hostileRid !== null) {
        guards.forEach((guard) => {
            if (guard.dead) return;
            sendGuardCommand(guard, COMMAND.SHOOT, { rid: hostileRid, reason: 'entry-hostile' }, 'entry-hostile');
        });
        return;
    }

    const trackedSet = getTrackedPlayersSet();
    const trackedRid = getNearestRidFromSet(trackedSet);
    if (trackedRid !== null) {
        const activeInspection = getOldestInspection();
        const inspectedRid = activeInspection.rid;
        const inspectedSession = activeInspection.session;
        const inspectedPlayer = getPlayerById(inspectedRid);

        guards.forEach((guard) => {
            if (guard.dead) return;
            if (
                inspectedSession &&
                guard.id === inspectedSession.guardId &&
                inspectedPlayer &&
                mp.players.exists(inspectedPlayer)
            ) {
                sendGuardCommand(guard, COMMAND.FOLLOW, { rid: inspectedRid, stopDist: 2.0 }, 'inspection-follow');
                return;
            }

            sendGuardCommand(guard, COMMAND.AIM, { rid: trackedRid }, 'cover-aim');
        });
        return;
    }

    guards.forEach((guard) => {
        if (guard.dead) return;
        if (dist(guard.ped ? guard.ped.position : guard.postVec, guard.postVec) > 1.5) {
            sendGuardCommand(guard, COMMAND.RETURN, {
                x: guard.postVec.x,
                y: guard.postVec.y,
                z: guard.postVec.z,
                heading: guard.heading,
            }, 'return-post');
        } else if (guard.currentCommand !== COMMAND.IDLE) {
            sendGuardCommand(guard, COMMAND.IDLE, { reason: 'post-clear' }, 'post-clear');
        }
    });
}

function tickControllers() {
    guards.forEach((guard) => {
        if (guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;

        const now = Date.now();
        const currentCtrl = getPlayerById(guard.controllerRid);
        const controllerAlive = guard.controllerRid && (now - guard.lastHeartbeatAt <= CFG.HEARTBEAT_TIMEOUT_MS);
        if (!controllerAlive || !currentCtrl || !mp.players.exists(currentCtrl)) {
            switchController(guard, 'heartbeat-timeout');
        }

        if (guard.currentCommand && now - guard.lastCommandAt > CFG.COMMAND_RESEND_MS) {
            sendGuardCommand(guard, guard.currentCommand, guard.currentExtra, 'command-resend');
        }
    });
}

function registerEvents() {
    mp.events.add('playerEnterColshape', (player, shape) => {
        if (shape !== entryShape) return;
        if (!player || !mp.players.exists(player)) return;
        if ((Number(player.dimension) || 0) !== CFG.DIMENSION) return;

        startInspection(player);
    });

    mp.events.add('playerQuit', (player) => {
        if (!player) return;
        inspections.delete(player.id);
        hostiles.delete(player.id);

        guards.forEach((guard) => {
            if (guard.controllerRid === player.id) switchController(guard, 'controller-quit');
        });
    });

    mp.events.add('cpi:ctrlAck', (player, guardIdRaw, verRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        const guard = guards.get(guardId);
        if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;
        if (guard.ped.getVariable('controllerRid') !== player.id) return;
        if (guard.ped.getVariable('ctrlVer') !== ver) return;

        guard.controllerRid = player.id;
        guard.lastHeartbeatAt = Date.now();
        guard.switching = false;
        try { guard.ped.setVariable('ctrlState', 'ready'); } catch {}
        sendGuardCommand(guard, guard.currentCommand, guard.currentExtra, 'ack-sync');
    });

    mp.events.add('cpi:ctrlHeartbeat', (player, guardIdRaw, verRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        const guard = guards.get(guardId);
        if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;
        if (guard.ped.getVariable('controllerRid') !== player.id) return;
        if (guard.ped.getVariable('ctrlVer') !== ver) return;

        guard.controllerRid = player.id;
        guard.lastHeartbeatAt = Date.now();
    });

    mp.events.add('cpi:deadSignal', (player, guardIdRaw, reasonRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        const guard = guards.get(guardId);
        if (!guard || guard.dead || !guard.ped || !mp.peds.exists(guard.ped)) return;

        const now = Date.now();
        if (now - guard.lastDeadSignalAt < 800) return;
        guard.lastDeadSignalAt = now;

        const reason = typeof reasonRaw === 'string' ? reasonRaw : 'client-dead-signal';
        markGuardDead(guard, `${reason}:rid=${player ? player.id : -1}`);
    });
}

function initCheckpointInspection() {
    const ep = CFG.ENTRY_POS;
    entryShape = mp.colshapes.newSphere(ep.x, ep.y, ep.z, CFG.ENTRY_RADIUS);

    CFG.GUARDS.forEach(spawnGuard);
    registerEvents();

    setInterval(tickBehavior, 350);
    setInterval(tickControllers, 1000);

    console.log('[CPI] checkpointInspection initialized (split modules + multi guards)');
}

module.exports = {
    initCheckpointInspection,
};
