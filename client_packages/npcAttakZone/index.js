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

const MOVE_PROGRESS_EPS = 0.06;
const MOVE_STUCK_AFTER_MS = 2400;
const MOVE_FOLLOW_REISSUE_MS = 900;
const MOVE_FALLBACK_REISSUE_MS = 1200;

const OBSERVER_VISUAL_REISSUE_MS = 1200;
const AIM_REISSUE_MS = 900;
const PASS_REQUEST_REISSUE_MS = 3000;

function logHeartbeatDebug(message) {
    const text = `[NpcAttakZone][heartbeat] ${message}`;
    try {
        if (mp.console && typeof mp.console.logInfo === "function") mp.console.logInfo(text);
        else if (typeof console !== "undefined" && typeof console.log === "function") console.log(text);
    } catch (e) {}
}

function parsePayload(value, fallback = null) {
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value == null ? fallback : value;
}

function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function distance3(a, b) {
    if (!a || !b) return 0;
    const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function round3(n) {
    return Number((Number(n) || 0).toFixed(3));
}

function vec3(x, y, z) {
    return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
}

function weaponNameToHash(name) {
    const weaponName = String(name || "WEAPON_CARBINERIFLE");
    try {
        return mp.game.joaat(weaponName);
    } catch (e) {
        return mp.game.joaat("WEAPON_CARBINERIFLE");
    }
}

function getPedReliableCoords(ped) {
    if (!ped || !mp.peds.exists(ped)) return vec3(0, 0, 0);
    try {
        if (typeof ped.getCoords === "function") {
            const pos = ped.getCoords(true);
            if (pos) return vec3(pos.x, pos.y, pos.z);
        }
    } catch (e) {}
    try {
        const nativePos = mp.game.entity.getEntityCoords(ped.handle, false);
        if (nativePos) return vec3(nativePos.x, nativePos.y, nativePos.z);
    } catch (e) {}
    try {
        const p = ped.position;
        if (p) return vec3(p.x, p.y, p.z);
    } catch (e) {}
    return vec3(0, 0, 0);
}

function getPedReliableHeading(ped) {
    if (!ped || !mp.peds.exists(ped)) return 0;
    try {
        const nativeHeading = mp.game.entity.getEntityHeading(ped.handle);
        if (!isNaN(Number(nativeHeading))) return Number(nativeHeading);
    } catch (e) {}
    try {
        if (!isNaN(Number(ped.heading))) return Number(ped.heading);
    } catch (e) {}
    return 0;
}

function getNpcLogicalPos(ped) {
    if (!ped || !mp.peds.exists(ped)) return vec3(0, 0, 0);

    const livePos = ped.getVariable("npcazLivePos");
    if (livePos && typeof livePos === "object") {
        return vec3(livePos.x, livePos.y, livePos.z);
    }

    try {
        const p = ped.position;
        if (p) return vec3(p.x, p.y, p.z);
    } catch (e) {}

    return vec3(0, 0, 0);
}

function getNpcTaskPos(ped) {
    if (!ped || !mp.peds.exists(ped)) return vec3(0, 0, 0);

    const nativePos = getPedReliableCoords(ped);
    if (nativePos && (nativePos.x || nativePos.y || nativePos.z)) return nativePos;

    return getNpcLogicalPos(ped);
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

        mp.game.graphics.drawLine(
            a.x, a.y, a.z + 0.05,
            b.x, b.y, b.z + 0.05,
            c[0], c[1], c[2], c[3]
        );

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
    mp.game.graphics.drawText("~r~NpcAttakZone~w~: игрок внутри зоны", [0.5, 0.83], {
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
        if (!found && ped && mp.peds.exists(ped) && ped.getVariable("npcazNpcId") === nid) {
            found = ped;
        }
    });
    return found;
}

function drawNpcPedDebug(obj, ped) {
    if (!ped || !mp.peds.exists(ped)) return;

    const syncedPos = ped.getVariable("npcazLivePos");
    const posObj = syncedPos && typeof syncedPos === "object"
        ? vec3(syncedPos.x, syncedPos.y, syncedPos.z)
        : getPedReliableCoords(ped);

    const screenPos = mp.game.graphics.world3dToScreen2d(posObj.x, posObj.y, posObj.z + 1.1);
    if (!screenPos) return;

    const targetRid = Number(ped.getVariable("npcazTargetRid"));
    const controllerRid = Number(ped.getVariable("npcazControllerRid"));
    const target = Number.isInteger(targetRid) ? findPlayerById(targetRid) : null;

    let dist = -1;
    if (target) dist = distance3(posObj, target.position);

    const text = [
        `NPC#${ped.getVariable("npcazNpcId")} role=${ped.getVariable("npcazRole") || "n/a"}`,
        `pos: ${posObj.x.toFixed(2)} ${posObj.y.toFixed(2)} ${posObj.z.toFixed(2)}`,
        `dist->target: ${dist >= 0 ? dist.toFixed(2) : "n/a"} rid=${targetRid}`,
        `controllerRid: ${controllerRid}`,
        obj ? `move=${obj.moveTask || "n/a"} fallback=${obj.lastStuckFallback ? "yes" : "no"} visual=${obj.lastVisualMode || "n/a"}` : "",
    ].join(" | ");

    mp.game.graphics.drawText(text, [screenPos.x, screenPos.y], {
        font: 4,
        color: [255, 255, 255, 220],
        scale: [0.26, 0.26],
        outline: true,
        centre: true,
    });
}

function ensureWeaponVisual(ped) {
    if (!ped || !mp.peds.exists(ped)) return false;
    const holdWeapon = !!ped.getVariable("npcazHoldWeapon");
    if (!holdWeapon) return false;

    const weaponName = ped.getVariable("npcazWeaponName") || "WEAPON_CARBINERIFLE";
    const hash = weaponNameToHash(weaponName);
    try { ped.giveWeapon(hash, 9999, true); } catch (e) {}
    try { ped.setWeapon(hash); } catch (e) {}
    try { ped.currentWeapon = hash; } catch (e) {}

    try {
        mp.game.invoke("0xADF692B254977C0C", ped.handle, hash, true);
    } catch (e) {}

    try {
        mp.game.invoke("0xBF0FD6E56C964FCB", ped.handle, false);
    } catch (e) {}

    return true;
}

function applyObserverCombatVisual(obj, ped) {
    if (!obj || !ped || !mp.peds.exists(ped)) return;

    const visualMode = String(ped.getVariable("npcazVisualMode") || "idle");
    const aimActive = !!ped.getVariable("npcazAimActive");
    const targetRid = Number(ped.getVariable("npcazTargetRid"));
    const target = Number.isInteger(targetRid) ? findPlayerById(targetRid) : null;
    const now = Date.now();

    ensureWeaponVisual(ped);

    if (visualMode === "combat" && aimActive && target) {
        ensureWeaponVisual(ped);

        if (
            obj.lastVisualMode !== "combatAim" ||
            now - (obj.lastObserverVisualAt || 0) >= OBSERVER_VISUAL_REISSUE_MS ||
            now - (obj.lastAimIssuedAt || 0) >= AIM_REISSUE_MS
        ) {
            try { ped.taskAimGunAtEntity(target.handle, 1500, false); } catch (e) {}
            obj.lastObserverVisualAt = now;
            obj.lastAimIssuedAt = now;
            obj.lastVisualMode = "combatAim";
        }
        return;
    }

    if (visualMode === "leaderFrisk") {
        obj.lastVisualMode = "leaderFrisk";
        ensureWeaponVisual(ped);
        return;
    }

    if (obj.lastVisualMode !== "idleVisual") {
        try { ped.taskStandStill(500); } catch (e) {}
        obj.lastVisualMode = "idleVisual";
        obj.lastObserverVisualAt = now;
    }
}

function syncObserverNpcTransform(obj, ped) {
    if (!obj || !ped || !mp.peds.exists(ped)) return;
    ensureWeaponVisual(ped);

    const livePos = ped.getVariable("npcazLivePos");
    if (!livePos || typeof livePos !== "object") return;

    const targetPos = vec3(livePos.x, livePos.y, livePos.z);
    const current = getPedReliableCoords(ped);

    const dx = targetPos.x - current.x;
    const dy = targetPos.y - current.y;
    const dz = targetPos.z - current.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 3.0) {
        try { ped.setCoordsNoOffset(targetPos.x, targetPos.y, targetPos.z, false, false, false); } catch (e) {}
    } else if (dist > 0.05) {
        const alpha = clamp01(0.22);
        const nx = current.x + dx * alpha;
        const ny = current.y + dy * alpha;
        const nz = current.z + dz * alpha;
        try { ped.setCoordsNoOffset(nx, ny, nz, false, false, false); } catch (e) {}
    }

    const liveHeading = Number(ped.getVariable("npcazLiveHeading"));
    if (!isNaN(liveHeading)) {
        try { ped.setHeading(liveHeading); } catch (e) {}
    }

    applyObserverCombatVisual(obj, ped);
}

function resetMoveTracking(obj, ped, moveTask) {
    const pos = getNpcTaskPos(ped);
    obj.moveTask = moveTask;
    obj.lastMovePos = pos;
    obj.lastMoveProgressAt = Date.now();
    obj.stuckSince = 0;
    obj.lastMoveHadProgress = false;
    obj.lastStuckFallback = false;
}

function ensureNpcEntry(ped) {
    if (!ped || ped.type !== "ped") return null;
    const nid = ped.getVariable("npcazNpcId");
    if (typeof nid !== "number") return null;

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

            lastMovePos: null,
            lastMoveProgressAt: 0,
            stuckSince: 0,
            moveTask: "idle",
            lastMoveHadProgress: false,
            lastStuckFallback: false,
            lastMoveDebugAt: 0,
            lastFollowIssuedAt: 0,
            lastFallbackIssuedAt: 0,
            lastNativeHeartbeatPos: null,

            lastObserverVisualAt: 0,
            lastAimIssuedAt: 0,
            lastVisualMode: "idle",
            lastPassRequestAt: 0,
        });
    } else {
        const entry = controlledNpcs.get(nid);
        entry.ped = ped;
        entry.needsRehydrate = true;
    }

    try { ped.setBlockingOfNonTemporaryEvents(true); } catch (e) {}
    try { ped.setKeepTask(true); } catch (e) {}

    ensureWeaponVisual(ped);

    return controlledNpcs.get(nid);
}

function runGuardEngage(obj, ped, target, extra) {
    if (!obj || !ped || !target) return;
    ensureWeaponVisual(ped);

    const weaponHash = weaponNameToHash(ped.getVariable("npcazWeaponName") || "WEAPON_CARBINERIFLE");
    try { ped.giveWeapon(weaponHash, 9999, true); } catch (e) {}
    try { ped.setWeapon(weaponHash); } catch (e) {}
    try { ped.currentWeapon = weaponHash; } catch (e) {}
    try { mp.game.invoke("0xADF692B254977C0C", ped.handle, weaponHash, true); } catch (e) {}

    const speed = Number(extra && extra.runSpeed) || 3.2;
    const aimDist = Number(extra && extra.aimDist) || 7.0;

    const pedPos = getNpcTaskPos(ped);
    const targetPos = vec3(target.position.x, target.position.y, target.position.z);
    const dist = distance3(pedPos, targetPos);
    const shouldAim = dist <= aimDist;
    const now = Date.now();

    if (shouldAim) {
        ensureWeaponVisual(ped);
        try { ped.giveWeapon(weaponHash, 9999, true); } catch (e) {}
        try { ped.setWeapon(weaponHash); } catch (e) {}
        try { ped.currentWeapon = weaponHash; } catch (e) {}
        try { mp.game.invoke("0xADF692B254977C0C", ped.handle, weaponHash, true); } catch (e) {}

        if (obj.lastMode !== "guardAim") {
            obj.lastMode = "guardAim";
            try { ped.clearTasks(); } catch (e) {}
            try { ped.taskStandStill(1200); } catch (e) {}
            resetMoveTracking(obj, ped, "aim");
        }

        obj.moveTask = "aim";
        obj.lastStuckFallback = false;
        obj.stuckSince = 0;
        obj.lastMovePos = getNpcTaskPos(ped);
        obj.lastMoveProgressAt = now;

        const forceFire = !!ped.getVariable("npcazForceFire");
        if (forceFire) {
            try { ped.taskShootAtEntity(target.handle, 1200, 0xC6EE6B4C); } catch (e) {}
        } else {
            try { ped.taskAimGunAtEntity(target.handle, 1800, false); } catch (e) {}
            try { ped.taskAimGunAtCoord(target.position.x, target.position.y, target.position.z, 1800, false, false); } catch (e) {}
        }
        return;
    }

    const pos = getNpcTaskPos(ped);

    if (!obj.lastMovePos) {
        obj.lastMovePos = pos;
        obj.lastMoveProgressAt = now;
    }

    const stepDist = distance3(pos, obj.lastMovePos);
    const hasProgress = stepDist >= MOVE_PROGRESS_EPS;
    obj.lastMoveHadProgress = hasProgress;

    if (hasProgress) {
        obj.lastMoveProgressAt = now;
        obj.stuckSince = 0;
    } else if (!obj.stuckSince && now - (obj.lastMoveProgressAt || 0) >= MOVE_STUCK_AFTER_MS) {
        obj.stuckSince = now;
    }

    obj.lastMovePos = pos;

    const noProgressForMs = now - (obj.lastMoveProgressAt || 0);
    const isStuck = noProgressForMs >= MOVE_STUCK_AFTER_MS;
    let fallbackTriggered = false;

    if (!isStuck) {
        if (
            obj.lastMode !== "guardRun" ||
            obj.moveTask !== "followEntity" ||
            now - (obj.lastFollowIssuedAt || 0) >= MOVE_FOLLOW_REISSUE_MS
        ) {
            obj.lastMode = "guardRun";
            obj.moveTask = "followEntity";
            obj.lastStuckFallback = false;
            obj.lastFollowIssuedAt = now;

            try { ped.clearTasks(); } catch (e) {}

            try {
                ped.taskFollowToOffsetOfEntity(target.handle, 0.0, 0.0, 0.0, speed, -1, 1.2, true);
            } catch (e) {
                fallbackTriggered = true;
            }
        }
    } else {
        fallbackTriggered = true;
    }

    if (fallbackTriggered) {
        if (
            obj.moveTask !== "goStraightFallback" ||
            now - (obj.lastFallbackIssuedAt || 0) >= MOVE_FALLBACK_REISSUE_MS
        ) {
            try { ped.clearTasks(); } catch (e) {}
            try {
                ped.taskGoStraightToCoord(
                    target.position.x,
                    target.position.y,
                    target.position.z,
                    speed,
                    2500,
                    Number(target.heading || 0),
                    0.35
                );
            } catch (e) {}

            obj.moveTask = "goStraightFallback";
            obj.lastFallbackIssuedAt = now;
            obj.lastStuckFallback = true;
            if (!obj.stuckSince) obj.stuckSince = now;
        }
    }

    const nid = ped.getVariable("npcazNpcId");
    if (!obj.lastMoveDebugAt || now - obj.lastMoveDebugAt >= 1000) {
        obj.lastMoveDebugAt = now;
        logHeartbeatDebug(
            `move nid=${nid} task=${obj.moveTask} progress=${hasProgress} `
            + `stepDist=${stepDist.toFixed(3)} noProgressForMs=${noProgressForMs} `
            + `stuck=${isStuck} fallback=${obj.lastStuckFallback}`
        );
    }
}

function runLeaderFrisk(obj, ped, target, extra) {
    if (!obj || !ped || !target) return;
    ensureWeaponVisual(ped);

    const friskDist = Number(extra && extra.friskDist) || 1.5;
    const runSpeed = Number(extra && extra.runSpeed) || 2.1;
    const targetVehicle = target.vehicle && mp.vehicles.exists(target.vehicle) ? target.vehicle : null;
    const isTargetInVehicle = !!targetVehicle;
    const approachDist = isTargetInVehicle ? Math.max(friskDist, 4.5) : friskDist;

    const pedPos = getNpcTaskPos(ped);
    const targetPos = isTargetInVehicle
        ? vec3(targetVehicle.position.x, targetVehicle.position.y, targetVehicle.position.z)
        : vec3(target.position.x, target.position.y, target.position.z);
    const dist = distance3(pedPos, targetPos);
    const now = Date.now();

    const weaponHash = mp.game.joaat("WEAPON_CARBINERIFLE");
    try { ped.setWeapon(weaponHash); } catch (e) {}
    try { ped.currentWeapon = weaponHash; } catch (e) {}

    if (!isTargetInVehicle && dist <= friskDist) {
        obj.lastMode = "leaderFrisk";
        obj.moveTask = "frisk";
        obj.lastStuckFallback = false;
        obj.lastMovePos = pedPos;
        obj.lastMoveProgressAt = now;
        obj.stuckSince = 0;

        if (!obj.friskUntil || now >= obj.friskUntil) {
            obj.friskUntil = now + 2600;
            try { ped.clearTasks(); } catch (e) {}
            try { ped.taskTurnToFaceCoord(target.position.x, target.position.y, target.position.z, 600); } catch (e) {}
            try { ped.taskStandStill(1200); } catch (e) {}
        }

        if (!obj.lastPassRequestAt || now - obj.lastPassRequestAt >= PASS_REQUEST_REISSUE_MS) {
            obj.lastPassRequestAt = now;
            try { mp.events.callRemote("npcattakzone.pass.ready", ped.getVariable("npcazNpcId"), target.remoteId); } catch (e) {}
        }
        return;
    }

    obj.friskUntil = 0;
    const shouldReissueFollow = (
        obj.lastMode !== "leaderMove"
        || obj.moveTask !== "leaderFollow"
        || now - (obj.lastFollowIssuedAt || 0) >= MOVE_FOLLOW_REISSUE_MS
    );

    if (shouldReissueFollow) {
        obj.lastMode = "leaderMove";
        resetMoveTracking(obj, ped, "leaderFollow");
        obj.lastFollowIssuedAt = now;

        try { ped.clearTasks(); } catch (e) {}
        try {
            const followHandle = isTargetInVehicle ? targetVehicle.handle : target.handle;
            ped.taskFollowToOffsetOfEntity(followHandle, 0.0, 0.0, 0.0, runSpeed, -1, approachDist, true);
        } catch (e) {
            try {
                ped.taskGoStraightToCoord(
                    targetPos.x,
                    targetPos.y,
                    targetPos.z,
                    runSpeed,
                    2500,
                    Number(target.heading || 0),
                    0.35
                );
            } catch (err) {}
            obj.moveTask = "leaderFallback";
            obj.lastFallbackIssuedAt = now;
        }
    }
}

function applyCommand(nid, cmd, extraJson, force = false) {
    nid = parseInt(nid);
    const obj = controlledNpcs.get(nid);
    if (!obj) return;

    const ped = obj.ped;
    if (!ped || !mp.peds.exists(ped)) return;

    const me = mp.players.local;
    const controllerRid = Number(ped.getVariable("npcazControllerRid"));
    if (controllerRid !== Number(me.id)) return;

    let extra = {};
    try { extra = extraJson ? JSON.parse(extraJson) : {}; } catch (e) {}

    const rid = typeof extra.rid === "number" ? extra.rid : Number(extra.rid);
    const target = Number.isInteger(rid) ? findPlayerById(rid) : null;
    const payloadKey = JSON.stringify(extra || {});
    const now = Date.now();

    const sameCommand = obj.lastAppliedCommand === cmd;
    const sameTarget = obj.lastAppliedTargetRid === (Number.isInteger(rid) ? rid : null);
    const samePayload = obj.lastAppliedPayload === payloadKey;
    const inCooldown = now - (obj.lastAppliedAt || 0) < COMMAND_REISSUE_MS;

    if (!force && sameCommand && sameTarget && samePayload && inCooldown) return;

    if (cmd === "guardEngage") {
        runGuardEngage(obj, ped, target, extra);
    } else if (cmd === "leaderFrisk") {
        runLeaderFrisk(obj, ped, target, extra);
    } else if (cmd === "idle") {
        try { ped.clearTasks(); } catch (e) {}
        try { ped.taskStandStill(1000); } catch (e) {}
        resetMoveTracking(obj, ped, "idle");
    }

    obj.lastAppliedCommand = cmd;
    obj.lastAppliedTargetRid = Number.isInteger(rid) ? rid : null;
    obj.lastAppliedPayload = payloadKey;
    obj.lastAppliedAt = now;
    obj.lastCommandAt = now;
}

function ackController(nid, ver) {
    try { mp.events.callRemote("npcattakzone:npc.ctrlAck", nid, ver); } catch (e) {}
}

const debugMessage = {
    text: null,
    until: 0,
};

mp.events.add("entityStreamIn", (ent) => {
    try {
        if (!ent || ent.type !== "ped") return;
        const obj = ensureNpcEntry(ent);
        if (!obj) return;

        const nid = ent.getVariable("npcazNpcId");
        const pending = pendingAssign.get(nid);
        if (pending) {
            ackController(nid, pending.ver);
            pendingAssign.delete(nid);
        }
    } catch (e) {}
});

mp.events.add("entityStreamOut", (ent) => {
    try {
        if (!ent || ent.type !== "ped") return;
        const nid = ent.getVariable("npcazNpcId");
        if (typeof nid === "number") controlledNpcs.delete(nid);
    } catch (e) {}
});

mp.events.add({
    "npcattakzone.menu.show.request": () => {
        mp.events.callRemote("npcattakzone.menu.open");
    },

    "npcattakzone.menu.point.fromPlayer": () => {
        const p = mp.players.local.position;
        const payload = {
            x: round3(p.x),
            y: round3(p.y),
            z: round3(p.z),
        };
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].addPointFromPlayer(${JSON.stringify(payload)})`);
    },

    "npcattakzone.menu.show": (data) => {
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].init(${JSON.stringify(data || {})})`);
        mp.callCEFV("selectMenu.showByName('npcAttakZoneEditor')");
    },

    "npcattakzone.zone.preview": (zone) => {
        zone = parsePayload(zone, null);
        if (!zone) return;
        zoneState = zone;
        previewUntil = Date.now() + PREVIEW_MS;
    },

    "npcattakzone.zone.sync": (zone) => {
        zoneState = parsePayload(zone, null);
    },

    "npcattakzone.debug.state": (inside) => {
        const nextState = !!inside;
        if (nextState !== isInsideZone) {
            isInsideZone = nextState;
            if (isInsideZone) mp.notify.success("Вы вошли в NpcAttakZone", "NpcAttakZone");
            else mp.notify.info("Вы вышли из NpcAttakZone", "NpcAttakZone");
        }
    },

    "npcattakzone:debug.message": (msg) => {
        debugMessage.text = String(msg || "");
        debugMessage.until = Date.now() + 3000;
        mp.notify.info(debugMessage.text, "NpcAttakZone DEBUG");
    },

    "npcattakzone:npc.assignController": (nid, ver) => {
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

    "npcattakzone:npc.executeCommand": (nid, cmd, extraJson) => {
        applyCommand(nid, cmd, extraJson, true);
    },

    "npcattakzone.pass.show": () => {
        mp.callCEFV(`acceptWindow.name = 'npcaz_pass';`);
        mp.callCEFV(`acceptWindow.header = 'Показать пропуск';`);
        mp.callCEFV(`acceptWindow.text = 'Показать пропуск в заражённую зону?';`);
        mp.callCEFV(`acceptWindow.leftWord = 'Да (Y)';`);
        mp.callCEFV(`acceptWindow.rightWord = 'Нет (N)';`);
        mp.callCEFV(`acceptWindow.show = true;`);
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

            drawNpcPedDebug(obj, ped);

            const me = mp.players.local;
            const controllerRid = Number(ped.getVariable("npcazControllerRid"));

            if (controllerRid !== Number(me.id)) {
                syncObserverNpcTransform(obj, ped);
                return;
            }

            ensureWeaponVisual(ped);

            if (!obj.lastHeartbeatAt || now - obj.lastHeartbeatAt >= HEARTBEAT_MS) {
                obj.lastHeartbeatAt = now;

                const nativePos = getNpcTaskPos(ped);
                const heading = round3(getPedReliableHeading(ped));

                const payload = {
                    x: round3(nativePos.x),
                    y: round3(nativePos.y),
                    z: round3(nativePos.z),
                    heading,
                };

                const prev = obj.lastNativeHeartbeatPos;
                const delta = prev ? distance3(prev, payload) : 0;
                obj.lastNativeHeartbeatPos = { ...payload };

                logHeartbeatDebug(
                    `send nid=${nid} meId=${me.id} controllerRid=${controllerRid} `
                    + `pedPos=${payload.x},${payload.y},${payload.z} heading=${heading} `
                    + `delta=${delta.toFixed(3)}`
                );

                try {
                    mp.events.callRemote("npcattakzone:npc.heartbeat", nid, JSON.stringify(payload));
                } catch (e) {}
            }

            if (obj.needsRehydrate || (obj.recoveryAt && now >= obj.recoveryAt)) {
                obj.needsRehydrate = false;
                obj.recoveryAt = now + COMMAND_RECOVERY_MS;

                const cmd = ped.getVariable("npcazCommand");
                const extra = ped.getVariable("npcazCommandExtra") || {};
                if (cmd) applyCommand(nid, cmd, JSON.stringify(extra), true);
            }

            if (!logicDebugText) {
                const cmd = ped.getVariable("npcazCommand");
                if (cmd === "guardEngage") {
                    logicDebugText = `Охрана: ${obj.moveTask || "n/a"}, aim <=7м`;
                } else if (cmd === "leaderFrisk") {
                    logicDebugText = "Лидер: подходит на 1.5м и обыскивает";
                }
            }
        });

        if (logicDebugText) drawNpcLogicDebugText(logicDebugText);
    },
});

mp.events.add("playerQuit", () => {
    controlledNpcs.clear();
    pendingAssign.clear();
    isInsideZone = false;
});
