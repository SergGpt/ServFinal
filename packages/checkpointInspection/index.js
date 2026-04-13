const POST_POS = new mp.Vector3(732.9288940429688, -2550.538818359375, 19.97984504699707);
const CONFIG = {
    guardId: 1,
    zoneRadius: 32,
    interactionRadius: 18,
    controllerMaxDistance: 200,
    commandResendMs: 900,
    heartbeatTimeoutMs: 5000,
    suspectGraceMs: 8000,
    returnDistance: 3,
    deadRespawnMs: 60000,
    dimension: 0,
    heading: 0,
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
    suspectRid: null,
    suspectEnteredAt: 0,
    suspectCompliant: false,
    lastDeadSignalAt: 0,
    deadAt: 0,
};

function dist(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    const dz = Number(a.z) - Number(b.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function broadcast(eventName, args = []) {
    mp.players.forEach((p) => {
        try { p.call(eventName, args); } catch {}
    });
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
    guardState.suspectRid = null;
    guardState.suspectEnteredAt = 0;
    guardState.suspectCompliant = false;

    beginControllerSwitch('spawn');
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
    broadcast('cpi:dead', [CONFIG.guardId, reason]);

    setTimeout(() => {
        if (guardState.ped && mp.peds.exists(guardState.ped)) {
            try { guardState.ped.destroy(); } catch {}
        }
        broadcast('cpi:forceRemove', [CONFIG.guardId]);
    }, 2000);

    setTimeout(() => {
        spawnGuard();
    }, CONFIG.deadRespawnMs);
}

function evaluateSuspectBehavior(player) {
    if (!player || !mp.players.exists(player)) return { bad: false, reason: 'none' };

    const weapon = Number(player.weapon) || 0;
    if (weapon !== 0) return { bad: true, reason: 'weapon-drawn' };

    const speed = Number(player.getSpeed ? player.getSpeed() : 0) || 0;
    if (speed > 3.2) return { bad: true, reason: 'running' };

    return { bad: false, reason: 'ok' };
}

function pickNearestPlayerInZone() {
    let best = null;
    let bestDist = Infinity;
    mp.players.forEach((player) => {
        if (!player || !mp.players.exists(player)) return;
        if ((Number(player.dimension) || 0) !== CONFIG.dimension) return;
        const d = dist(player.position, POST_POS);
        if (d > CONFIG.zoneRadius) return;
        if (d < bestDist) {
            best = player;
            bestDist = d;
        }
    });
    return best;
}

function tickBehavior() {
    if (!guardState.ped || !mp.peds.exists(guardState.ped) || guardState.dead) return;

    const suspect = pickNearestPlayerInZone();
    if (!suspect) {
        guardState.suspectRid = null;
        guardState.suspectEnteredAt = 0;
        guardState.suspectCompliant = false;

        const guardDist = dist(guardState.ped.position, POST_POS);
        if (guardDist > CONFIG.returnDistance) {
            if (guardState.currentCommand !== COMMAND.RETURN) {
                sendCommand(COMMAND.RETURN, {
                    x: POST_POS.x,
                    y: POST_POS.y,
                    z: POST_POS.z,
                }, 'no-suspect-return');
            }
        } else if (guardState.currentCommand !== COMMAND.IDLE) {
            sendCommand(COMMAND.IDLE, { reason: 'post-clear' }, 'post-clear');
        }
        return;
    }

    if (guardState.suspectRid !== suspect.id) {
        guardState.suspectRid = suspect.id;
        guardState.suspectEnteredAt = Date.now();
        guardState.suspectCompliant = false;
    }

    const bad = evaluateSuspectBehavior(suspect);
    const insideInteraction = dist(suspect.position, POST_POS) <= CONFIG.interactionRadius;
    const overGrace = Date.now() - guardState.suspectEnteredAt > CONFIG.suspectGraceMs;

    if (bad.bad || !insideInteraction || overGrace) {
        sendCommand(COMMAND.SHOOT, { rid: suspect.id, reason: bad.reason, post: POST_POS }, 'suspect-violation');
        return;
    }

    guardState.suspectCompliant = true;
    sendCommand(COMMAND.FOLLOW, { rid: suspect.id, post: POST_POS, stopDist: 4.2 }, 'inspect-follow');
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
        if (guardState.suspectRid === player.id) {
            guardState.suspectRid = null;
            guardState.suspectEnteredAt = 0;
        }
    });
}

function initCheckpointInspection() {
    spawnGuard();
    registerEvents();

    setInterval(tickBehavior, 500);
    setInterval(tickControllerHealth, 1000);

    console.log('[CPI] checkpointInspection initialized (new independent module)');
}

initCheckpointInspection();
