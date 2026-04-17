"use strict";

let zoneState = null;
let previewUntil = 0;
const PREVIEW_MS = 20000;
let isInsideZone = false;

const controlledNpcs = new Map();
const pendingAssign = new Map();
const HEARTBEAT_MS = 1000;

function parsePayload(value, fallback = null) {
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value == null ? fallback : value;
}

function drawPolygon(zone, color) {
    if (!zone || !Array.isArray(zone.points) || zone.points.length < 2) return;
    const c = color || [220, 45, 45, 190];
    const points = zone.points;
    const minZ = Number(zone.minZ);
    const maxZ = Number(zone.maxZ);
    const hasHeight = Number.isFinite(minZ) && Number.isFinite(maxZ);

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        mp.game.graphics.drawLine(a.x, a.y, a.z + 0.05, b.x, b.y, b.z + 0.05, c[0], c[1], c[2], c[3]);
        if (hasHeight) {
            mp.game.graphics.drawLine(a.x, a.y, minZ, a.x, a.y, maxZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, minZ, b.x, b.y, minZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, maxZ, b.x, b.y, maxZ, c[0], c[1], c[2], c[3]);
        }

        mp.game.graphics.drawMarker(
            1,
            a.x, a.y, a.z - 1,
            0, 0, 0,
            0, 0, 0,
            0.3, 0.3, 0.3,
            255, 100, 50, 220,
            false, true, 2, false, null, null, false
        );
    }
}

function drawDebugText() {
    const text = '~r~NpcAttakZone~w~: игрок внутри зоны';
    mp.game.graphics.drawText(text, [0.5, 0.83], {
        font: 4,
        color: [255, 255, 255, 230],
        scale: [0.45, 0.45],
        outline: true,
        centre: true,
    });
}

function drawServerDebugMessage(text) {
    if (!text) return;
    mp.game.graphics.drawText(`~y~${text}`, [0.5, 0.79], {
        font: 4,
        color: [255, 255, 180, 220],
        scale: [0.38, 0.38],
        outline: true,
        centre: true,
    });
}

const debugMessage = {
    text: null,
    until: 0,
};

function findPlayerById(rid) {
    let found = null;
    mp.players.forEach((p) => {
        if (!found && p && p.id === rid) found = p;
    });
    return found;
}

function findNpcPed(nid) {
    const item = controlledNpcs.get(nid);
    if (item && item.ped && mp.peds.exists(item.ped)) return item.ped;

    let found = null;
    mp.peds.forEach((ped) => {
        if (!found && ped && mp.peds.exists(ped) && ped.getVariable('npcazNpcId') === nid) found = ped;
    });
    return found;
}

function ensureNpcEntry(ped) {
    if (!ped || ped.type !== 'ped') return null;
    const nid = ped.getVariable('npcazNpcId');
    if (typeof nid !== 'number') return null;

    if (!controlledNpcs.has(nid)) {
        controlledNpcs.set(nid, {
            ped,
            lastHeartbeatAt: 0,
            lastHydrateAt: 0,
            lastCommandAt: 0,
        });
    } else {
        controlledNpcs.get(nid).ped = ped;
    }

    try { ped.setBlockingOfNonTemporaryEvents(true); } catch (e) {}
    try { ped.setKeepTask(true); } catch (e) {}
    return controlledNpcs.get(nid);
}

function runFollowStop(obj, ped, target, extra) {
    if (!obj || !ped || !target) return;
    const stopDist = Number(extra && extra.stopDist) || 3.0;
    const speed = Number(extra && extra.speed) || 1.2;
    const dist = target.position.distanceTo(ped.position);

    if (dist <= stopDist) {
        try { ped.clearTasks(); } catch (e) {}
        try { ped.taskStandStill(700); } catch (e) {}
        try { ped.taskAimGunAtEntity(target.handle, 800, false); } catch (e) {}
        return;
    }

    try { ped.clearTasks(); } catch (e) {}
    try { ped.taskFollowToOffsetOfEntity(target.handle, 0.0, -stopDist, 0.0, speed, 800, stopDist, true); } catch (e) {}
    try { ped.taskAimGunAtEntity(target.handle, 1200, false); } catch (e) {}
}

function applyCommand(nid, cmd, extraJson) {
    nid = parseInt(nid);
    const obj = controlledNpcs.get(nid);
    if (!obj) return;

    const ped = obj.ped;
    if (!ped || !mp.peds.exists(ped)) return;

    const me = mp.players.local;
    const controllerRid = ped.getVariable('npcazControllerRid');
    if (controllerRid !== me.id) return;

    let extra = {};
    try { extra = extraJson ? JSON.parse(extraJson) : {}; } catch (e) {}

    const rid = typeof extra.rid === 'number' ? extra.rid : Number(extra.rid);
    const target = Number.isInteger(rid) ? findPlayerById(rid) : null;

    if (cmd === 'followStop') {
        runFollowStop(obj, ped, target, extra);
    } else if (cmd === 'idle') {
        try { ped.clearTasks(); } catch (e) {}
        try { ped.taskStandStill(1000); } catch (e) {}
    }

    obj.lastCommandAt = Date.now();
}

function ackController(nid, ver) {
    try { mp.events.callRemote('npcattakzone:npc.ctrlAck', nid, ver); } catch (e) {}
}

mp.events.add('entityStreamIn', (ent) => {
    try {
        if (!ent || ent.type !== 'ped') return;
        const obj = ensureNpcEntry(ent);
        if (!obj) return;

        const nid = ent.getVariable('npcazNpcId');
        const pending = pendingAssign.get(nid);
        if (pending) {
            ackController(nid, pending.ver);
            pendingAssign.delete(nid);
        }
    } catch (e) {}
});

mp.events.add('entityStreamOut', (ent) => {
    try {
        if (!ent || ent.type !== 'ped') return;
        const nid = ent.getVariable('npcazNpcId');
        if (typeof nid === 'number') controlledNpcs.delete(nid);
    } catch (e) {}
});

mp.events.add({
    'npcattakzone.menu.show.request': () => {
        mp.events.callRemote('npcattakzone.menu.open');
    },

    'npcattakzone.menu.point.fromPlayer': () => {
        const p = mp.players.local.position;
        const payload = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].addPointFromPlayer(${JSON.stringify(payload)})`);
    },

    'npcattakzone.menu.show': (data) => {
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].init(${JSON.stringify(data || {})})`);
        mp.callCEFV("selectMenu.showByName('npcAttakZoneEditor')");
    },

    'npcattakzone.zone.preview': (zone) => {
        zone = parsePayload(zone, null);
        if (!zone) return;
        zoneState = zone;
        previewUntil = Date.now() + PREVIEW_MS;
    },

    'npcattakzone.zone.sync': (zone) => {
        zoneState = parsePayload(zone, null);
    },

    'npcattakzone.debug.state': (inside) => {
        const nextState = !!inside;
        if (nextState !== isInsideZone) {
            isInsideZone = nextState;
            if (isInsideZone) {
                mp.notify.success('Вы вошли в NpcAttakZone', 'NpcAttakZone');
            } else {
                mp.notify.info('Вы вышли из NpcAttakZone', 'NpcAttakZone');
            }
        }
    },

    'npcattakzone:debug.message': (msg) => {
        debugMessage.text = String(msg || '');
        debugMessage.until = Date.now() + 3000;
        mp.notify.info(debugMessage.text, 'NpcAttakZone DEBUG');
    },

    'npcattakzone:npc.assignController': (nid, ver) => {
        nid = parseInt(nid);
        ver = parseInt(ver);

        const ped = findNpcPed(nid);
        if (!ped || !mp.peds.exists(ped)) {
            pendingAssign.set(nid, { ver, at: Date.now() });
            return;
        }

        ensureNpcEntry(ped);
        ackController(nid, ver);
    },

    'npcattakzone:npc.executeCommand': (nid, cmd, extraJson) => {
        applyCommand(nid, cmd, extraJson);
    },

    render: () => {
        if (zoneState && Date.now() <= previewUntil) {
            drawPolygon(zoneState, [220, 45, 45, 185]);
        }

        if (isInsideZone) drawDebugText();
        if (debugMessage.text && Date.now() <= debugMessage.until) drawServerDebugMessage(debugMessage.text);

        const now = Date.now();
        controlledNpcs.forEach((obj, nid) => {
            const ped = obj.ped;
            if (!ped || !mp.peds.exists(ped)) return;

            const me = mp.players.local;
            const controllerRid = ped.getVariable('npcazControllerRid');
            if (controllerRid !== me.id) return;

            if (!obj.lastHeartbeatAt || now - obj.lastHeartbeatAt >= HEARTBEAT_MS) {
                obj.lastHeartbeatAt = now;
                try { mp.events.callRemote('npcattakzone:npc.heartbeat', nid); } catch (e) {}
            }

            if (!obj.lastHydrateAt || now - obj.lastHydrateAt >= 300) {
                obj.lastHydrateAt = now;
                const cmd = ped.getVariable('npcazCommand');
                const extra = ped.getVariable('npcazCommandExtra') || {};
                if (cmd) applyCommand(nid, cmd, JSON.stringify(extra));
            }
        });
    },
});

mp.events.add('playerQuit', () => {
    controlledNpcs.clear();
    pendingAssign.clear();
    isInsideZone = false;
});
