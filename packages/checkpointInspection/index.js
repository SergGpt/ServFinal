const POST_POS = new mp.Vector3(732.9288940429688, -2550.538818359375, 19.97984504699707);
const ENTRY_POS = new mp.Vector3(740.25244140625, -2528.21923828125, 19.55854606628418);
const WAIT_POS = new mp.Vector3(734.9447021484375, -2549.41455078125, 19.37537384033203);

const CONFIG = {
    guardId: 1,
    controllerMaxDistance: 200,
    commandResendMs: 900,
    heartbeatTimeoutMs: 5000,
    returnDistance: 3,
    deadRespawnMs: 60000,
    dimension: 0,
    heading: 0,
    entryRadius: 9.0,
    waitRadius: 2.3,
    reachPointMs: 5000,
    holdStillMs: 5000,
};

const COMMAND = {
    IDLE: 'idle',
    FOLLOW: 'followTarget',
    SHOOT: 'shootTarget',
    RETURN: 'returnToPost',
    DEAD: 'dead',
};

const guardState = {
    ped: null,
    dead: false,
    hp: 250,
    ctrlVer: 0,
    controllerRid: null,
    lastHeartbeatAt: 0,
    switching: false,
    switchStartAt: 0,
    lastCommandAt: 0,
    currentCommand: COMMAND.IDLE,
    currentExtra: null,
    lastDeadSignalAt: 0,
    deadAt: 0,
    entryShape: null,
};

const inspections = new Map(); // rid -> { enteredAt, reachUntil, standingSince, completed, violated }
const hostiles = new Set();

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

function isPlayerValidController(player) {
    if (!player || !mp.players.exists(player)) return false;
    if ((Number(player.dimension) || 0) !== CONFIG.dimension) return false;
    return dist(player.position, POST_POS) <= CONFIG.controllerMaxDistance;
}

function chooseController(preferred = null) {
    if (preferred && isPlayerValidController(preferred)) return preferred;

    let best = null;
    let bestDist = Infinity;
    mp.players.forEach((player) => {
        if (!isPlayerValidController(player)) return;
        const d = dist(player.position, guardState.ped ? guardState.ped.position : POST_POS);
        if (d < bestDist) {
            best = player;
            bestDist = d;
        }
    });
    return best;
}

function sendCommand(command, extra = null, reason = 'logic') {
    if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;

    guardState.currentCommand = command;
    guardState.currentExtra = extra;
    guardState.lastCommandAt = Date.now();

    try {
        guardState.ped.setVariable('cpiCommand', command);
        guardState.ped.setVariable('cpiCommandExtra', extra);
    } catch {}

    const ctrl = guardState.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    try {
        ctrl.call('cpi:executeCommand', [CONFIG.guardId, command, JSON.stringify(extra || {}), reason]);
    } catch {}
}

function beginControllerSwitch(reason = 'unknown', preferred = null) {
    if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return false;

    const next = chooseController(preferred);
    if (!next) {
        guardState.controllerRid = null;
        guardState.switching = false;
        sendCommand(COMMAND.IDLE, { reason: `no-controller:${reason}` }, reason);
        return false;
    }

    guardState.switching = true;
    guardState.switchStartAt = Date.now();
    guardState.ctrlVer += 1;

    try {
        guardState.ped.controller = undefined;
        guardState.ped.setVariable('controllerRid', -1);
        guardState.ped.setVariable('ctrlVer', guardState.ctrlVer);
        guardState.ped.setVariable('ctrlState', 'switching');
    } catch {}

    try {
        guardState.ped.dimension = next.dimension;
        guardState.ped.controller = next;
        guardState.ped.setVariable('controllerRid', next.id);
    } catch {}

    guardState.controllerRid = next.id;
    guardState.lastHeartbeatAt = 0;

    try {
        next.call('cpi:assignController', [CONFIG.guardId, guardState.ctrlVer]);
    } catch {}

    return true;
}

function spawnGuard() {
    if (guardState.ped && mp.peds.exists(guardState.ped)) {
        try { guardState.ped.destroy(); } catch {}
    }

    const ped = mp.peds.new(mp.joaat('s_m_m_armoured_01'), POST_POS, {
        dynamic: true,
        invincible: false,
    });

    ped.dimension = CONFIG.dimension;
    ped.heading = CONFIG.heading;
    ped.setVariable('cpiGuardId', CONFIG.guardId);
    ped.setVariable('controllerRid', -1);
    ped.setVariable('ctrlVer', 0);
    ped.setVariable('ctrlState', 'sleep');
    ped.setVariable('deadFlag', false);
    ped.setVariable('cpiCommand', COMMAND.IDLE);
    ped.setVariable('cpiCommandExtra', null);

    try {
        ped.health = guardState.hp;
        if (typeof ped.setHealth === 'function') ped.setHealth(guardState.hp);
    } catch {}

    guardState.ped = ped;
    guardState.dead = false;
    guardState.ctrlVer = 0;
    guardState.controllerRid = null;
    guardState.lastHeartbeatAt = 0;
    guardState.switching = false;
    guardState.currentCommand = COMMAND.IDLE;
    guardState.currentExtra = null;

    beginControllerSwitch('spawn');
}

function stopInspectionFor(playerId, reason = 'stopped') {
    inspections.delete(playerId);
    const player = getPlayerById(playerId);
    if (player && mp.players.exists(player)) {
        try { player.call('cpi:inspection:stop', [reason]); } catch {}
    }
}

function setViolation(playerId, reason = 'rule-break') {
    const session = inspections.get(playerId);
    if (!session || session.completed) return;
    session.violated = true;
    hostiles.add(playerId);
    stopInspectionFor(playerId, reason);
}

function setCompleted(playerId) {
    const session = inspections.get(playerId);
    if (!session || session.violated) return;
    session.completed = true;
    hostiles.delete(playerId);
    stopInspectionFor(playerId, 'completed');
}

function startInspection(player) {
    if (!player || !mp.players.exists(player)) return;
    const rid = player.id;
    const now = Date.now();

    inspections.set(rid, {
        enteredAt: now,
        reachUntil: now + CONFIG.reachPointMs,
        standingSince: 0,
        completed: false,
        violated: false,
    });

    hostiles.delete(rid);

    try {
        player.call('cpi:inspection:start', [
            {
                entry: { x: ENTRY_POS.x, y: ENTRY_POS.y, z: ENTRY_POS.z },
                waitPoint: { x: WAIT_POS.x, y: WAIT_POS.y, z: WAIT_POS.z },
                reachDurationMs: CONFIG.reachPointMs,
                holdDurationMs: CONFIG.holdStillMs,
                waitRadius: CONFIG.waitRadius,
                text: 'Двигайтесь на указанную точку',
            },
        ]);
    } catch {}
}

function markDead(reason = 'unknown') {
    if (guardState.dead || !guardState.ped || !mp.peds.exists(guardState.ped)) return;

    guardState.dead = true;
    guardState.deadAt = Date.now();

    try {
        guardState.ped.setVariable('deadFlag', true);
        guardState.ped.setVariable('cpiCommand', COMMAND.DEAD);
        guardState.ped.setVariable('cpiCommandExtra', { reason });
    } catch {}

    sendCommand(COMMAND.DEAD, { reason }, reason);

    mp.players.forEach((p) => {
        try { p.call('cpi:dead', [CONFIG.guardId, reason]); } catch {}
    });

    setTimeout(() => {
        if (guardState.ped && mp.peds.exists(guardState.ped)) {
            try { guardState.ped.destroy(); } catch {}
        }

        mp.players.forEach((p) => {
            try { p.call('cpi:forceRemove', [CONFIG.guardId]); } catch {}
        });
    }, 2000);

    setTimeout(() => {
        spawnGuard();
    }, CONFIG.deadRespawnMs);
}

function processInspections() {
    const now = Date.now();

    inspections.forEach((session, rid) => {
        const player = getPlayerById(rid);
        if (!player || !mp.players.exists(player)) {
            inspections.delete(rid);
            hostiles.delete(rid);
            return;
        }

        if ((Number(player.dimension) || 0) !== CONFIG.dimension) {
            setViolation(rid, 'wrong-dimension');
            return;
        }

        const dToWait = dist(player.position, WAIT_POS);
        const insideWait = dToWait <= CONFIG.waitRadius;

        if (now > session.reachUntil && !insideWait) {
            setViolation(rid, 'timeout-to-point');
            return;
        }

        if (insideWait) {
            if (!session.standingSince) {
                session.standingSince = now;
                try { player.call('cpi:inspection:hold', [CONFIG.holdStillMs]); } catch {}
            }

            if (now - session.standingSince >= CONFIG.holdStillMs) {
                setCompleted(rid);
            }
            return;
        }

        session.standingSince = 0;
    });
}

function getNextHostileRid() {
    let bestRid = null;
    let bestDist = Infinity;

    hostiles.forEach((rid) => {
        const player = getPlayerById(rid);
        if (!player || !mp.players.exists(player)) {
            hostiles.delete(rid);
            return;
        }

        const d = dist(player.position, guardState.ped ? guardState.ped.position : POST_POS);
        if (d < bestDist) {
            bestDist = d;
            bestRid = rid;
        }
    });

    return bestRid;
}

function tickBehavior() {
    if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;

    processInspections();

    const hostileRid = getNextHostileRid();
    if (hostileRid !== null) {
        sendCommand(COMMAND.SHOOT, { rid: hostileRid, reason: 'inspection-failed' }, 'inspection-failed');
        return;
    }

    if (inspections.size > 0) {
        sendCommand(COMMAND.RETURN, { x: WAIT_POS.x, y: WAIT_POS.y, z: WAIT_POS.z, reason: 'inspection-active' }, 'inspection-active');
        return;
    }

    const guardDist = dist(guardState.ped.position, POST_POS);
    if (guardDist > CONFIG.returnDistance) {
        sendCommand(COMMAND.RETURN, { x: POST_POS.x, y: POST_POS.y, z: POST_POS.z, reason: 'return-post' }, 'return-post');
    } else if (guardState.currentCommand !== COMMAND.IDLE) {
        sendCommand(COMMAND.IDLE, { reason: 'post-clear' }, 'post-clear');
    }
}

function tickControllerHealth() {
    if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;

    const now = Date.now();
    const controllerAlive = guardState.controllerRid && (now - guardState.lastHeartbeatAt) <= CONFIG.heartbeatTimeoutMs;
    const ctrlObj = getPlayerById(guardState.controllerRid);

    if (!controllerAlive || !ctrlObj || !mp.players.exists(ctrlObj)) {
        beginControllerSwitch('heartbeat-timeout');
    }

    if (guardState.currentCommand && now - guardState.lastCommandAt > CONFIG.commandResendMs) {
        sendCommand(guardState.currentCommand, guardState.currentExtra, 'command-resend');
    }
}

function registerEvents() {
    mp.events.add('playerEnterColshape', (player, shape) => {
        if (!player || !mp.players.exists(player)) return;
        if (shape !== guardState.entryShape) return;
        if ((Number(player.dimension) || 0) !== CONFIG.dimension) return;
        if (guardState.dead) return;

        startInspection(player);
    });

    mp.events.add('cpi:ctrlAck', (player, guardIdRaw, verRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        if (guardId !== CONFIG.guardId) return;
        if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;
        if (guardState.ped.getVariable('controllerRid') !== player.id) return;
        if (guardState.ped.getVariable('ctrlVer') !== ver) return;

        guardState.controllerRid = player.id;
        guardState.lastHeartbeatAt = Date.now();
        guardState.switching = false;
        try { guardState.ped.setVariable('ctrlState', 'ready'); } catch {}

        sendCommand(guardState.currentCommand, guardState.currentExtra, 'ack-sync');
    });

    mp.events.add('cpi:ctrlHeartbeat', (player, guardIdRaw, verRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        if (guardId !== CONFIG.guardId) return;
        if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;
        if (guardState.ped.getVariable('controllerRid') !== player.id) return;
        if (guardState.ped.getVariable('ctrlVer') !== ver) return;

        guardState.controllerRid = player.id;
        guardState.lastHeartbeatAt = Date.now();
    });

    mp.events.add('cpi:deadSignal', (player, guardIdRaw, reasonRaw) => {
        const guardId = parseInt(guardIdRaw, 10);
        if (guardId !== CONFIG.guardId) return;
        if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;

        const now = Date.now();
        if (now - guardState.lastDeadSignalAt < 800) return;
        guardState.lastDeadSignalAt = now;

        const reason = typeof reasonRaw === 'string' ? reasonRaw : 'client-dead-signal';
        markDead(`${reason}:rid=${player ? player.id : -1}`);
    });

    mp.events.add('playerQuit', (player) => {
        if (!player) return;

        if (guardState.controllerRid === player.id) {
            beginControllerSwitch('controller-quit');
        }

        inspections.delete(player.id);
        hostiles.delete(player.id);
    });
};

function initCheckpointInspection() {
    spawnGuard();
    guardState.entryShape = mp.colshapes.newSphere(ENTRY_POS.x, ENTRY_POS.y, ENTRY_POS.z, CONFIG.entryRadius);

    registerEvents();
    setInterval(tickBehavior, 400);
    setInterval(tickControllerHealth, 1000);

    console.log('[CPI] checkpointInspection initialized with entry colshape + wait marker flow');
}

initCheckpointInspection();
