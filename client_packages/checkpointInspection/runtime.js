const CFG = {
    STEP_SPEED: 1.1,
    HEARTBEAT_MS: 1000,
    DEAD_REPORT_CD: 1000,
    RIFLE_HASH: mp.game.joaat('weapon_carbinerifle'),
    WAIT_MARKER_COLOR: [80, 220, 255, 220],
    COMMAND_REFRESH_MS: 1200,
};

const me = mp.players.local;
const guards = new Map();
const pendingAssign = new Map();
const deadReportedAt = new Map();

const inspectionUi = {
    active: false,
    waitPoint: null,
    waitRadius: 2.8,
    reachTextUntil: 0,
    holdUntil: 0,
    message: '',
    marker: null,
    blip: null,
};

function drawText2D(text, x, y, scale = 0.45) {
    try {
        mp.game.graphics.drawText(String(text), [x, y], {
            font: 4,
            color: [255, 255, 255, 220],
            scale: [scale, scale],
            outline: true,
            centre: true,
        });
    } catch {}
}

function findPlayerById(id) {
    let target = null;
    mp.players.forEach((p) => {
        if (!target && p && p.id === id) target = p;
    });
    return target;
}

function isController(ped) {
    if (!ped || !mp.peds.exists(ped)) return false;
    const rid = parseInt(ped.getVariable('controllerRid'), 10);
    return rid === me.id;
}

function prepGuardPed(ped) {
    if (!ped || !mp.peds.exists(ped)) return;

    try { mp.game.entity.setEntityAsMissionEntity(ped.handle, true, true); } catch {}
    try { ped.setCanRagdoll(true); } catch {}
    try { ped.setBlockingOfNonTemporaryEvents(true); } catch {}
    try { ped.setKeepTask(true); } catch {}

    try { mp.game.ped.setPedCombatAttributes(ped.handle, 46, true); } catch {}
    try { mp.game.ped.setPedCombatMovement(ped.handle, 2); } catch {}
    try { mp.game.ped.setPedCombatRange(ped.handle, 2); } catch {}
    try { mp.game.ped.setPedAlertness(ped.handle, 3); } catch {}
    try { mp.game.weapon.giveWeaponToPed(ped.handle, CFG.RIFLE_HASH, 9999, false, true); } catch {}
}

function attachIfGuard(ped) {
    if (!ped || ped.type !== 'ped') return;
    const guardId = ped.getVariable('cpiGuardId');
    if (typeof guardId !== 'number') return;

    if (!guards.has(guardId)) {
        guards.set(guardId, {
            guardId,
            ped,
            command: 'idle',
            extra: {},
            targetRid: null,
            lastCommandSig: '',
            lastRefreshAt: 0,
        });
    } else {
        guards.get(guardId).ped = ped;
    }

    prepGuardPed(ped);
}

function detachIfGuard(ped) {
    if (!ped || ped.type !== 'ped') return;
    const guardId = ped.getVariable('cpiGuardId');
    if (typeof guardId !== 'number') return;

    guards.delete(guardId);
    pendingAssign.delete(guardId);
    deadReportedAt.delete(guardId);
}

function ackController(guardId, ver) {
    try { mp.events.callRemote('cpi:ctrlAck', guardId, ver); } catch {}
}

function applyIdle(ped) {
    try { ped.clearTasks(); } catch {}
    try { ped.taskStandStill(900); } catch {}
}

function applyAim(ped, rid, forceReset = false) {
    const target = findPlayerById(rid);
    if (!target || !target.handle) return;

    if (forceReset) {
        try { ped.clearTasks(); } catch {}
    }
    try { ped.taskAimGunAtEntity(target.handle, 900, false); } catch {}
    try { ped.taskLookAt(target.handle, 500, 2048, 3); } catch {}
}

function applyShoot(ped, rid, forceReset = false) {
    const target = findPlayerById(rid);
    if (!target || !target.handle) return;

    try { mp.game.weapon.giveWeaponToPed(ped.handle, CFG.RIFLE_HASH, 9999, false, true); } catch {}
    if (forceReset) {
        try { ped.clearTasks(); } catch {}
    }
    try { ped.taskCombatPed(target.handle, 0, 16); } catch {}
    try { mp.game.ped.setPedShootRate(ped.handle, 900); } catch {}
}

function applyReturn(ped, post, forceReset = false) {
    if (!post) return;

    if (forceReset) {
        try { ped.clearTasks(); } catch {}
    }
    try { ped.taskGoStraightToCoord(post.x, post.y, post.z, CFG.STEP_SPEED, -1, Number(post.heading) || 0, 0.0); } catch {}
}

function executeGuardCommand(state, command, extra) {
    const ped = state.ped;
    if (!ped || !mp.peds.exists(ped)) return;

    state.command = command;
    state.extra = extra || {};
    state.targetRid = typeof state.extra.rid === 'number' ? state.extra.rid : null;
    const nextSig = `${state.command}:${state.targetRid}:${JSON.stringify(state.extra || {})}`;
    const changed = state.lastCommandSig !== nextSig;
    state.lastCommandSig = nextSig;
    state.lastRefreshAt = Date.now();

    if (command === 'idle') applyIdle(ped);
    if (command === 'aimTarget') applyAim(ped, state.targetRid, changed);
    if (command === 'shootTarget') applyShoot(ped, state.targetRid, changed);
    if (command === 'returnToPost') applyReturn(ped, state.extra, changed);
    if (command === 'dead') {
        try { ped.clearTasksImmediately(); } catch {}
        try { ped.setHealth(0); } catch {}
        try { mp.game.ped.setPedToRagdoll(ped.handle, 5000, 5000, 0, false, false, false); } catch {}
    }
}

function reportDead(guardId, reason) {
    const now = Date.now();
    const last = deadReportedAt.get(guardId) || 0;
    if (now - last < CFG.DEAD_REPORT_CD) return;
    deadReportedAt.set(guardId, now);

    try { mp.events.callRemote('cpi:deadSignal', guardId, reason); } catch {}
}

function clearInspectionVisuals() {
    try {
        if (inspectionUi.marker) {
            inspectionUi.marker.destroy();
            inspectionUi.marker = null;
        }
    } catch {}

    try {
        if (inspectionUi.blip) {
            inspectionUi.blip.destroy();
            inspectionUi.blip = null;
        }
    } catch {}
}

mp.events.add('entityStreamIn', (entity) => {
    try { if (entity && entity.type === 'ped') attachIfGuard(entity); } catch {}
});

mp.events.add('entityStreamOut', (entity) => {
    try { if (entity && entity.type === 'ped') detachIfGuard(entity); } catch {}
});

mp.events.add('cpi:assignController', (guardIdRaw, verRaw) => {
    const guardId = parseInt(guardIdRaw, 10);
    const ver = parseInt(verRaw, 10);
    if (!Number.isFinite(guardId) || !Number.isFinite(ver)) return;

    const state = guards.get(guardId);
    if (!state || !state.ped || !mp.peds.exists(state.ped)) {
        pendingAssign.set(guardId, { ver, at: Date.now() });
        return;
    }

    prepGuardPed(state.ped);
    ackController(guardId, ver);
    setTimeout(() => ackController(guardId, ver), 350);
    pendingAssign.delete(guardId);
});

mp.events.add('cpi:executeCommand', (guardIdRaw, command, extraJson) => {
    const guardId = parseInt(guardIdRaw, 10);
    const state = guards.get(guardId);
    if (!state || !state.ped || !mp.peds.exists(state.ped)) return;

    let extra = {};
    try { extra = extraJson ? JSON.parse(extraJson) : {}; } catch {}

    executeGuardCommand(state, command, extra);
});

mp.events.add('cpi:dead', (guardIdRaw) => {
    const guardId = parseInt(guardIdRaw, 10);
    const state = guards.get(guardId);
    if (!state || !state.ped || !mp.peds.exists(state.ped)) return;

    executeGuardCommand(state, 'dead', {});
});

mp.events.add('cpi:forceRemove', (guardIdRaw) => {
    const guardId = parseInt(guardIdRaw, 10);
    const state = guards.get(guardId);
    if (!state) return;

    try {
        if (state.ped && mp.peds.exists(state.ped)) state.ped.destroy();
    } catch {}

    guards.delete(guardId);
    pendingAssign.delete(guardId);
    deadReportedAt.delete(guardId);
});

mp.events.add('cpi:inspection:start', (payload) => {
    if (!payload || typeof payload !== 'object') return;

    const now = Date.now();
    inspectionUi.active = true;
    inspectionUi.waitPoint = payload.waitPoint || null;
    inspectionUi.waitRadius = Number(payload.waitRadius) || 2.8;
    inspectionUi.reachTextUntil = now + (Number(payload.reachDurationMs) || 5000);
    inspectionUi.holdUntil = 0;
    inspectionUi.message = String(payload.text || 'Двигайтесь на указанную точку');

    clearInspectionVisuals();

    if (!inspectionUi.waitPoint) return;

    try {
        inspectionUi.marker = mp.markers.new(
            1,
            new mp.Vector3(inspectionUi.waitPoint.x, inspectionUi.waitPoint.y, inspectionUi.waitPoint.z - 1.0),
            inspectionUi.waitRadius * 2.0,
            {
                color: CFG.WAIT_MARKER_COLOR,
                visible: true,
                dimension: me.dimension,
            },
        );
    } catch {}

    try {
        inspectionUi.blip = mp.blips.new(1, new mp.Vector3(inspectionUi.waitPoint.x, inspectionUi.waitPoint.y, inspectionUi.waitPoint.z), {
            color: 3,
            shortRange: false,
            name: 'Точка досмотра',
            scale: 0.9,
            dimension: me.dimension,
        });
        inspectionUi.blip.setRoute(true);
    } catch {}
});

mp.events.add('cpi:inspection:hold', (holdDurationMsRaw) => {
    const holdDurationMs = Number(holdDurationMsRaw) || 5000;
    inspectionUi.holdUntil = Date.now() + holdDurationMs;
});

mp.events.add('cpi:inspection:stop', () => {
    inspectionUi.active = false;
    inspectionUi.waitPoint = null;
    inspectionUi.reachTextUntil = 0;
    inspectionUi.holdUntil = 0;
    inspectionUi.message = '';
    clearInspectionVisuals();
});

mp.events.add('render', () => {
    if (!inspectionUi.active) return;

    const now = Date.now();
    if (now < inspectionUi.reachTextUntil) {
        const left = Math.max(0, Math.ceil((inspectionUi.reachTextUntil - now) / 1000));
        drawText2D(`${inspectionUi.message} (${left})`, 0.5, 0.82, 0.42);
        return;
    }

    if (inspectionUi.holdUntil > now) {
        const holdLeft = Math.max(0, Math.ceil((inspectionUi.holdUntil - now) / 1000));
        drawText2D(`Стойте на метке: ${holdLeft}`, 0.5, 0.82, 0.42);
        return;
    }

    drawText2D('Встаньте на метку и стойте 5 секунд', 0.5, 0.82, 0.42);
});

setInterval(() => {
    guards.forEach((state, guardId) => {
        try {
            const ped = state.ped;
            if (!ped || !mp.peds.exists(ped)) return;

            const hp = Number(ped.getHealth ? ped.getHealth() : ped.health) || 0;
            const deadFlag = !!ped.getVariable('deadFlag');
            if (deadFlag || hp <= 0) reportDead(guardId, `client-loop deadFlag=${deadFlag} hp=${hp}`);
        } catch {}
    });
}, 1000);

setInterval(() => {
    guards.forEach((state) => {
        const ped = state.ped;
        if (!ped || !mp.peds.exists(ped) || !isController(ped)) return;
        if (Date.now() - (state.lastRefreshAt || 0) < CFG.COMMAND_REFRESH_MS) return;

        if (state.command === 'aimTarget') applyAim(ped, state.targetRid, false);
        if (state.command === 'shootTarget') applyShoot(ped, state.targetRid, false);
        if (state.command === 'returnToPost') applyReturn(ped, state.extra, false);
        state.lastRefreshAt = Date.now();
    });
}, 450);

setInterval(() => {
    guards.forEach((state, guardId) => {
        const ped = state.ped;
        if (!ped || !mp.peds.exists(ped) || !isController(ped)) return;

        const ver = parseInt(ped.getVariable('ctrlVer'), 10) || 0;
        try { mp.events.callRemote('cpi:ctrlHeartbeat', guardId, ver); } catch {}
    });
}, CFG.HEARTBEAT_MS);

setInterval(() => {
    pendingAssign.forEach((entry, guardId) => {
        if (Date.now() - entry.at > 5000) {
            pendingAssign.delete(guardId);
            return;
        }

        const state = guards.get(guardId);
        if (!state || !state.ped || !mp.peds.exists(state.ped)) return;

        ackController(guardId, entry.ver);
        pendingAssign.delete(guardId);
    });
}, 250);
