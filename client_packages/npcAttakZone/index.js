"use strict";

let zoneState = null;
let previewUntil = 0;
const PREVIEW_MS = 20000;
let isInsideZone = false;

const controlledNpcs = new Map();
const pendingAssign = new Map();
const HEARTBEAT_MS = 1000;
const COMMAND_REISSUE_MS = 1200;
const COMMAND_RECOVERY_MS = 2500;

function logHeartbeatDebug(message) {
    const text = `[NpcAttakZone][heartbeat] ${message}`;
    try {
        if (mp.console && typeof mp.console.logInfo === 'function') mp.console.logInfo(text);
        else if (typeof console !== 'undefined' && typeof console.log === 'function') console.log(text);
    } catch (e) {}
}

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

function drawNpcLogicDebugText(text) {
    if (!text) return;
    mp.game.graphics.drawText(`~b~NPC DEBUG~w~: ${text}`, [0.5, 0.75], {
        font: 4,
        color: [180, 220, 255, 230],
        scale: [0.36, 0.36],
        outline: true,
        centre: true,
    });
}

function drawNpcPedDebug(ped) {
    if (!ped || !mp.peds.exists(ped)) return;
    const syncedPos = ped.getVariable('npcazLivePos');
    const pos = syncedPos && typeof syncedPos === 'object'
        ? new mp.Vector3(Number(syncedPos.x) || 0, Number(syncedPos.y) || 0, Number(syncedPos.z) || 0)
        : ped.position;
    const screenPos = mp.game.graphics.world3dToScreen2d(pos.x, pos.y, pos.z + 1.1);
    if (!screenPos) return;

    const targetRid = Number(ped.getVariable('npcazTargetRid'));
    const controllerRid = Number(ped.getVariable('npcazControllerRid'));
    const target = Number.isInteger(targetRid) ? findPlayerById(targetRid) : null;
    let dist = -1;
    if (target) {
        const targetPos = target.position;
        const dx = targetPos.x - pos.x;
        const dy = targetPos.y - pos.y;
        const dz = targetPos.z - pos.z;
        dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const text = [
        `NPC#${ped.getVariable('npcazNpcId')} role=${ped.getVariable('npcazRole') || 'n/a'}`,
        `pos: ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}`,
        `dist->target: ${dist >= 0 ? dist.toFixed(2) : 'n/a'} rid=${targetRid}`,
        `controllerRid: ${controllerRid}`,
    ].join(' | ');

    mp.game.graphics.drawText(text, [screenPos.x, screenPos.y], {
        font: 4,
        color: [255, 255, 255, 220],
        scale: [0.26, 0.26],
        outline: true,
        centre: true,
    });
}

function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function syncObserverNpcTransform(obj, ped) {
    if (!obj || !ped || !mp.peds.exists(ped)) return;
    const livePos = ped.getVariable('npcazLivePos');
    if (!livePos || typeof livePos !== 'object') return;

    const targetPos = new mp.Vector3(
        Number(livePos.x) || 0,
        Number(livePos.y) || 0,
        Number(livePos.z) || 0,
    );
    const current = ped.position;
    const dx = targetPos.x - current.x;
    const dy = targetPos.y - current.y;
    const dz = targetPos.z - current.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // крупное расхождение — жестко догоняем
    if (dist > 3.0) {
        try { ped.setCoordsNoOffset(targetPos.x, targetPos.y, targetPos.z, false, false, false); } catch (e) {}
    } else if (dist > 0.05) {
        // мелкие расхождения — мягкая интерполяция
        const alpha = clamp01(0.22);
        const nx = current.x + dx * alpha;
        const ny = current.y + dy * alpha;
        const nz = current.z + dz * alpha;
        try { ped.setCoordsNoOffset(nx, ny, nz, false, false, false); } catch (e) {}
    }

    const liveHeading = Number(ped.getVariable('npcazLiveHeading'));
    if (!isNaN(liveHeading)) {
        try { ped.setHeading(liveHeading); } catch (e) {}
    }
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
            lastCommandAt: 0,
            lastAppliedCommand: null,
            lastAppliedTargetRid: null,
            lastAppliedPayload: null,
            lastAppliedAt: 0,
            needsRehydrate: true,
            recoveryAt: 0,
        });
    } else {
        controlledNpcs.get(nid).ped = ped;
        controlledNpcs.get(nid).needsRehydrate = true;
    }

    try { ped.setBlockingOfNonTemporaryEvents(true); } catch (e) {}
    try { ped.setKeepTask(true); } catch (e) {}
    return controlledNpcs.get(nid);
}

function runGuardEngage(obj, ped, target, extra) {
    if (!obj || !ped || !target) return;
    const weaponHash = mp.game.joaat('WEAPON_CARBINERIFLE');
    try { ped.setWeapon(weaponHash); } catch (e) {}
    try { ped.currentWeapon = weaponHash; } catch (e) {}

    const speed = Number(extra && extra.runSpeed) || 3.2;
    const aimDist = Number(extra && extra.aimDist) || 7.0;
    const dist = target.position.distanceTo(ped.position);
    const shouldAim = dist <= aimDist;

    if (shouldAim) {
        if (obj.lastMode !== 'guardAim') {
            obj.lastMode = 'guardAim';
            try { ped.clearTasks(); } catch (e) {}
            try { ped.taskStandStill(1200); } catch (e) {}
        }
        try { ped.taskAimGunAtEntity(target.handle, 1800, false); } catch (e) {}
        return;
    }

    if (obj.lastMode !== 'guardRun') {
        obj.lastMode = 'guardRun';
        try { ped.clearTasks(); } catch (e) {}
    }
    try { ped.taskGoToCoordAnyMeans(target.position.x, target.position.y, target.position.z, speed, 0, false, 0, 0); } catch (e) {}
}

function runLeaderFrisk(obj, ped, target, extra) {
    if (!obj || !ped || !target) return;
    const friskDist = Number(extra && extra.friskDist) || 1.5;
    const runSpeed = Number(extra && extra.runSpeed) || 2.1;
    const dist = target.position.distanceTo(ped.position);
    const now = Date.now();

    if (dist <= friskDist) {
        obj.lastMode = 'leaderFrisk';
        if (!obj.friskUntil || now >= obj.friskUntil) {
            obj.friskUntil = now + 2600;
            try { ped.clearTasks(); } catch (e) {}
            try { ped.taskTurnToFaceCoord(target.position.x, target.position.y, target.position.z, 600); } catch (e) {}
            try {
                const dict = 'amb@prop_human_bum_bin@idle_b';
                if (!mp.game.streaming.hasAnimDictLoaded(dict)) {
                    mp.game.streaming.requestAnimDict(dict);
                    return;
                }
                ped.taskPlayAnim(dict, 'idle_d', 8.0, -8.0, 2500, 1, 0.0, false, false, false);
            } catch (e) {}
        }
        return;
    }

    obj.friskUntil = 0;
    if (obj.lastMode !== 'leaderMove') {
        obj.lastMode = 'leaderMove';
        try { ped.clearTasks(); } catch (e) {}
    }
    try { ped.taskGoToCoordAnyMeans(target.position.x, target.position.y, target.position.z, runSpeed, 0, false, 0, 0); } catch (e) {}
}

function applyCommand(nid, cmd, extraJson, force = false) {
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
    const payloadKey = JSON.stringify(extra || {});
    const now = Date.now();

    const sameCommand = obj.lastAppliedCommand === cmd;
    const sameTarget = obj.lastAppliedTargetRid === (Number.isInteger(rid) ? rid : null);
    const samePayload = obj.lastAppliedPayload === payloadKey;
    const inCooldown = now - (obj.lastAppliedAt || 0) < COMMAND_REISSUE_MS;
    if (!force && sameCommand && sameTarget && samePayload && inCooldown) return;

    if (cmd === 'guardEngage') {
        runGuardEngage(obj, ped, target, extra);
    } else if (cmd === 'leaderFrisk') {
        runLeaderFrisk(obj, ped, target, extra);
    } else if (cmd === 'idle') {
        try { ped.clearTasks(); } catch (e) {}
        try { ped.taskStandStill(1000); } catch (e) {}
    }

    obj.lastAppliedCommand = cmd;
    obj.lastAppliedTargetRid = Number.isInteger(rid) ? rid : null;
    obj.lastAppliedPayload = payloadKey;
    obj.lastAppliedAt = now;
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
        const obj = controlledNpcs.get(nid);
        if (obj) obj.needsRehydrate = true;
        ackController(nid, ver);
    },

    'npcattakzone:npc.executeCommand': (nid, cmd, extraJson) => {
        applyCommand(nid, cmd, extraJson, true);
    },

    render: () => {
        if (zoneState && Date.now() <= previewUntil) {
            drawPolygon(zoneState, [220, 45, 45, 185]);
        }

        if (isInsideZone) drawDebugText();
        if (debugMessage.text && Date.now() <= debugMessage.until) drawServerDebugMessage(debugMessage.text);

        const now = Date.now();
        let logicDebugText = null;
        controlledNpcs.forEach((obj, nid) => {
            const ped = obj.ped;
            if (!ped || !mp.peds.exists(ped)) return;
            drawNpcPedDebug(ped);

            const me = mp.players.local;
            const controllerRid = ped.getVariable('npcazControllerRid');
            if (controllerRid !== me.id) {
                syncObserverNpcTransform(obj, ped);
                return;
            }

            if (!obj.lastHeartbeatAt || now - obj.lastHeartbeatAt >= HEARTBEAT_MS) {
                obj.lastHeartbeatAt = now;
                const p = ped.position;
                const heading = Number((ped.heading || 0).toFixed(3));
                const payload = {
                    x: Number(p.x.toFixed(3)),
                    y: Number(p.y.toFixed(3)),
                    z: Number(p.z.toFixed(3)),
                    heading,
                };
                logHeartbeatDebug(
                    `send nid=${nid} meId=${me.id} controllerRid=${controllerRid} `
                    + `pedPos=${payload.x},${payload.y},${payload.z} heading=${heading}`
                );
                try { mp.events.callRemote('npcattakzone:npc.heartbeat', nid, JSON.stringify(payload)); } catch (e) {}
            }

            if (obj.needsRehydrate || (obj.recoveryAt && now >= obj.recoveryAt)) {
                obj.needsRehydrate = false;
                obj.recoveryAt = now + COMMAND_RECOVERY_MS;
                const cmd = ped.getVariable('npcazCommand');
                const extra = ped.getVariable('npcazCommandExtra') || {};
                if (cmd) applyCommand(nid, cmd, JSON.stringify(extra), true);
            }

            if (!logicDebugText) {
                const cmd = ped.getVariable('npcazCommand');
                if (cmd === 'guardEngage') logicDebugText = 'Охрана: бег >7м, при <=7м целится';
                else if (cmd === 'leaderFrisk') logicDebugText = 'Лидер: подходит на 1.5м и обыскивает';
            }

        });

        if (logicDebugText) drawNpcLogicDebugText(logicDebugText);
    },
});

mp.events.add('playerQuit', () => {
    controlledNpcs.clear();
    pendingAssign.clear();
    isInsideZone = false;
});
