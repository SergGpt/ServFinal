const me = mp.players.local;
const npcs = new Map();
const pendingAssign = new Map();
const HEARTBEAT_MS = 1000;

const friskState = {
    active: false,
    endAt: 0,
    chiefNpcId: null,
};

function log(msg) {
    try { mp.console.logInfo(`[SECURITY-CL] ${msg}`); } catch {}
}

function attachIfSecurityPed(ped) {
    if (!ped || ped.type !== 'ped') return false;
    const nid = ped.getVariable('secNpcId');
    const zoneId = ped.getVariable('secZoneId');
    if (typeof nid !== 'number' || typeof zoneId !== 'number') return false;

    if (!npcs.has(nid)) {
        npcs.set(nid, {
            ped,
            holdRid: null,
            friskRid: null,
            lastCommandAt: 0,
        });
    } else {
        npcs.get(nid).ped = ped;
    }

    preparePed(ped);
    return true;
}

function preparePed(ped) {
    try { ped.setBlockingOfNonTemporaryEvents(true); } catch {}
    try { ped.setKeepTask(true); } catch {}
    try { ped.setCanRagdoll(false); } catch {}
    try { ped.setCombatAttributes(46, true); } catch {}
}

function findSecurityPed(nid) {
    const obj = npcs.get(nid);
    if (obj && obj.ped && mp.peds.exists(obj.ped)) return obj.ped;

    let found = null;
    try {
        mp.peds.forEach((ped) => {
            if (!found && ped && mp.peds.exists(ped) && ped.getVariable('secNpcId') === nid) found = ped;
        });
    } catch {}
    return found;
}

function findPlayerById(rid) {
    let found = null;
    try {
        mp.players.forEach((p) => {
            if (!found && p.id === rid) found = p;
        });
    } catch {}
    return found;
}

function parseExtra(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    if (typeof raw === 'object') return raw;
    return {};
}

function ackController(nid, ver) {
    try { mp.events.callRemote('sec:ctrlAck', nid, ver); } catch {}
}

function doHoldAim(obj, ped, target) {
    if (!obj || !ped || !target) return;
    try { ped.clearTasks(); } catch {}
    try { ped.taskAimGunAtEntity(target.handle, 1000, false); } catch {}
    try {
        ped.taskFollowToOffsetOfEntity(target.handle, 0.0, -4.0, 0.0, 1.2, 1000, 4.0, true);
    } catch {}
}

function doChiefFrisk(obj, ped, target, friskDist = 1.0) {
    if (!obj || !ped || !target) return;
    const dist = target.position.distanceTo(ped.position);

    if (dist <= friskDist) {
        try { ped.clearTasks(); } catch {}
        try { ped.taskAimGunAtEntity(target.handle, 1500, false); } catch {}
        try { mp.events.callRemote('sec:chiefReachedTarget', ped.getVariable('secNpcId'), target.id); } catch {}
        return;
    }

    try { ped.clearTasks(); } catch {}
    try { ped.taskGoToCoordAnyMeans(target.position.x, target.position.y, target.position.z, 1.4, 0, false, 0, 0.0); } catch {}
    try { ped.taskAimGunAtEntity(target.handle, 1500, false); } catch {}
}

function playFriskAnim(ped, target) {
    try {
        const dict = 'amb@prop_human_bum_bin@idle_b';
        if (!mp.game.streaming.hasAnimDictLoaded(dict)) {
            mp.game.streaming.requestAnimDict(dict);
            let i = 0;
            while (!mp.game.streaming.hasAnimDictLoaded(dict) && i++ < 100) mp.game.wait(0);
        }
        ped.taskPlayAnim(dict, 'idle_d', 8.0, -8.0, -1, 1, 0.0, false, false, false);
        if (target && target.handle === me.handle) {
            me.taskPlayAnim(dict, 'idle_a', 8.0, -8.0, -1, 1, 0.0, false, false, false);
        }
    } catch {}
}

mp.events.add('entityStreamIn', (ent) => {
    try {
        if (ent && ent.type === 'ped') {
            attachIfSecurityPed(ent);
            const nid = ent.getVariable('secNpcId');
            const pending = pendingAssign.get(nid);
            if (pending) {
                ackController(nid, pending.ver);
                pendingAssign.delete(nid);
            }
        }
    } catch {}
});

mp.events.add('entityStreamOut', (ent) => {
    try {
        if (ent && ent.type === 'ped') {
            const nid = ent.getVariable('secNpcId');
            if (typeof nid === 'number') npcs.delete(nid);
        }
    } catch {}
});

mp.events.add('sec:assignController', (nid, ver) => {
    nid = parseInt(nid);
    ver = parseInt(ver);
    const ped = findSecurityPed(nid);
    if (!ped || !mp.peds.exists(ped)) {
        pendingAssign.set(nid, { ver, at: Date.now() });
        return;
    }
    attachIfSecurityPed(ped);
    ackController(nid, ver);
});

mp.events.add('sec:executeCommand', (nid, cmd, extraJson) => {
    nid = parseInt(nid);
    const obj = npcs.get(nid);
    if (!obj) return;
    const ped = obj.ped;
    if (!ped || !mp.peds.exists(ped)) return;

    const ctrlRid = ped.getVariable('controllerRid');
    if (ctrlRid !== me.id) return;

    const extra = parseExtra(extraJson);

    const target = typeof extra.rid === 'number' ? findPlayerById(extra.rid) : null;

    if (cmd === 'holdAim') {
        obj.holdRid = extra.rid;
        doHoldAim(obj, ped, target);
    } else if (cmd === 'chiefFrisk') {
        obj.friskRid = extra.rid;
        doChiefFrisk(obj, ped, target, Number(extra.friskDist) || 1.0);
    } else if (cmd === 'playFriskAnim') {
        playFriskAnim(ped, target);
    } else if (cmd === 'idle') {
        try { ped.clearTasks(); } catch {}
        try { ped.taskStandStill(1000); } catch {}
    }

    obj.lastCommandAt = Date.now();
});

mp.events.add('sec:friskStart', (chiefNpcId, durationMs) => {
    friskState.active = true;
    friskState.endAt = Date.now() + (parseInt(durationMs) || 5000);
    friskState.chiefNpcId = parseInt(chiefNpcId);
});

mp.events.add('sec:friskStop', () => {
    friskState.active = false;
    friskState.endAt = 0;
    friskState.chiefNpcId = null;
    try { me.clearTasks(); } catch {}
});

mp.events.add('render', () => {
    try {
        const now = Date.now();

        if (friskState.active) {
            try {
                mp.game.controls.disableAllControlActions(0);
                mp.game.controls.enableControlAction(0, 245, true);
                mp.game.controls.enableControlAction(0, 200, true);
            } catch {}
            if (now >= friskState.endAt) {
                friskState.active = false;
                friskState.endAt = 0;
                friskState.chiefNpcId = null;
                try { me.clearTasks(); } catch {}
            }
        }

        npcs.forEach((obj, nid) => {
            const ped = obj.ped;
            if (!ped || !mp.peds.exists(ped)) return;
            const ctrlRid = ped.getVariable('controllerRid');
            if (ctrlRid !== me.id) return;

            if (!obj.lastHeartbeatAt || now - obj.lastHeartbeatAt >= HEARTBEAT_MS) {
                obj.lastHeartbeatAt = now;
                try { mp.events.callRemote('sec:heartbeat', nid); } catch {}
            }

            const cmd = ped.getVariable('secCommand');
            const extra = parseExtra(ped.getVariable('secCommandExtra'));
            const target = typeof extra.rid === 'number' ? findPlayerById(extra.rid) : null;

            if (cmd === 'holdAim') {
                doHoldAim(obj, ped, target);
            } else if (cmd === 'chiefFrisk') {
                doChiefFrisk(obj, ped, target, Number(extra.friskDist) || 1.0);
            }
        });
    } catch (e) {
        log(`render error: ${e.message}`);
    }
});

setTimeout(() => {
    try {
        mp.peds.forEach((ped) => attachIfSecurityPed(ped));
        log(`security client loaded npcs=${npcs.size}`);
    } catch {}
}, 1000);
