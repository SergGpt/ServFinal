// checkpointInspection (client)
// Independent checkpoint guard sync module (zombie-like controller/command model)

const me = mp.players.local;
const guards = new Map(); // guardId -> state
const pendingAssign = new Map();
const deadReportedAt = new Map();

const STEP_SPEED = 1.1;
const HEARTBEAT_MS = 1000;
const DEAD_REPORT_CD = 1000;
const RIFLE_HASH = mp.game.joaat('weapon_carbinerifle');

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

function attachIfGuard(ped) {
    if (!ped || ped.type !== 'ped') return false;
    const guardId = ped.getVariable('cpiGuardId');
    if (typeof guardId !== 'number') return false;

    if (!guards.has(guardId)) {
        guards.set(guardId, {
            guardId,
            ped,
            command: 'idle',
            extra: {},
            followRid: null,
            shootRid: null,
            returnPost: null,
            lastCommandAt: 0,
        });
    }

    prepGuardPed(guards.get(guardId).ped);
    return true;
}

function detachIfGuard(ped) {
    if (!ped || ped.type !== 'ped') return;
    const guardId = ped.getVariable('cpiGuardId');
    if (typeof guardId !== 'number') return;
    guards.delete(guardId);
    pendingAssign.delete(guardId);
    deadReportedAt.delete(guardId);
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
    try { mp.game.weapon.giveWeaponToPed(ped.handle, RIFLE_HASH, 9999, false, true); } catch {}
}

function ackController(guardId, ver) {
    try { mp.events.callRemote('cpi:ctrlAck', guardId, ver); } catch {}
}

function executeCommand(state, command, extra) {
    const ped = state.ped;
    if (!ped || !mp.peds.exists(ped)) return;

    state.command = command;
    state.extra = extra || {};
    state.lastCommandAt = Date.now();

    switch (command) {
        case 'idle':
            try { ped.clearTasks(); } catch {}
            try { ped.taskStandStill(800); } catch {}
            break;
        case 'followTarget':
            state.followRid = typeof state.extra.rid === 'number' ? state.extra.rid : null;
            applyFollow(state);
            break;
        case 'shootTarget':
            state.shootRid = typeof state.extra.rid === 'number' ? state.extra.rid : null;
            applyShoot(state);
            break;
        case 'returnToPost':
            state.returnPost = state.extra || null;
            applyReturn(state);
            break;
        case 'dead':
            try { ped.clearTasksImmediately(); } catch {}
            try { ped.setHealth(0); } catch {}
            try { mp.game.ped.setPedToRagdoll(ped.handle, 5000, 5000, 0, false, false, false); } catch {}
            break;
    }
}

function applyFollow(state) {
    const ped = state.ped;
    if (!ped || !mp.peds.exists(ped)) return;
    const target = findPlayerById(state.followRid);
    if (!target || !target.handle) return;

    try { ped.clearTasks(); } catch {}
    try { ped.taskFollowToOffsetOfEntity(target.handle, 0, 0, 0, STEP_SPEED, -1, 3.5, true); } catch {}
}

function applyShoot(state) {
    const ped = state.ped;
    if (!ped || !mp.peds.exists(ped)) return;
    const target = findPlayerById(state.shootRid);
    if (!target || !target.handle) return;

    try { mp.game.weapon.giveWeaponToPed(ped.handle, RIFLE_HASH, 9999, false, true); } catch {}
    try { ped.clearTasks(); } catch {}
    try { ped.taskCombatPed(target.handle, 0, 16); } catch {}
    try { mp.game.ped.setPedShootRate(ped.handle, 800); } catch {}
}

function applyReturn(state) {
    const ped = state.ped;
    if (!ped || !mp.peds.exists(ped)) return;
    const post = state.returnPost;
    if (!post) return;

    try { ped.clearTasks(); } catch {}
    try { ped.taskGoStraightToCoord(post.x, post.y, post.z, STEP_SPEED, -1, 0.0, 0.0); } catch {}
}

function reportDead(guardId, reason) {
    const now = Date.now();
    const last = deadReportedAt.get(guardId) || 0;
    if (now - last < DEAD_REPORT_CD) return;
    deadReportedAt.set(guardId, now);
    try { mp.events.callRemote('cpi:deadSignal', guardId, reason); } catch {}
}

mp.events.add('entityStreamIn', (entity) => {
    try {
        if (entity && entity.type === 'ped') attachIfGuard(entity);
    } catch {}
});

mp.events.add('entityStreamOut', (entity) => {
    try {
        if (entity && entity.type === 'ped') detachIfGuard(entity);
    } catch {}
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

    executeCommand(state, command, extra);
});

mp.events.add('cpi:dead', (guardIdRaw) => {
    const guardId = parseInt(guardIdRaw, 10);
    const state = guards.get(guardId);
    if (!state || !state.ped || !mp.peds.exists(state.ped)) return;

    try { state.ped.clearTasksImmediately(); } catch {}
    try { state.ped.setHealth(0); } catch {}
    try { mp.game.ped.setPedToRagdoll(state.ped.handle, 5000, 5000, 0, false, false, false); } catch {}
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

        if (state.command === 'followTarget') applyFollow(state);
        if (state.command === 'shootTarget') applyShoot(state);
        if (state.command === 'returnToPost') applyReturn(state);
    });
}, 500);

setInterval(() => {
    guards.forEach((state, guardId) => {
        const ped = state.ped;
        if (!ped || !mp.peds.exists(ped) || !isController(ped)) return;

        const ver = parseInt(ped.getVariable('ctrlVer'), 10) || 0;
        try { mp.events.callRemote('cpi:ctrlHeartbeat', guardId, ver); } catch {}
    });
}, HEARTBEAT_MS);

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
