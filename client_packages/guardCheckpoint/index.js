"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;

const AI_LOOP_MS = 200;
const AIM_REPLAY_MS = 300;
const SHOOT_REPLAY_MS = 360;
const COMBAT_REPLAY_MS = 1200;
const RETURN_REPLAY_MS = 900;
const CLEAR_REPLAY_MS = 900;
const POSE_SMOOTH_FACTOR = 0.12;
const POSE_SNAP_DIST = 7.5;

let lastAiLoopAt = 0;
const pedRuntime = new Map(); // pedId -> { ctrlVer, stateVersion, state, targetId, returnPos, weaponHash }
const postRuntime = new Map(); // postId -> { ctrlVer, stateVersion, state, targetId, ownerId }

function nowMs() { return Date.now(); }
function getPedRemoteId(ped) { return Number(ped && (ped.remoteId != null ? ped.remoteId : ped.id)); }

function playSound(soundName, soundSet) {
    try { mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true); } catch {}
}

function getPlayerByServerId(serverId) {
    if (serverId == null || Number(serverId) < 0) return null;
    const id = Number(serverId);
    const byRemoteId = mp.players.atRemoteId(id);
    if (byRemoteId) return byRemoteId;
    let found = null;
    mp.players.forEach((p) => {
        if (found) return;
        if (Number(p.remoteId) === id || Number(p.id) === id) found = p;
    });
    return found;
}

function isLocalStreamOwnerForPed(ped) {
    if (!ped || !ped.getVariable || !mp.players.local) return false;
    return Number(ped.getVariable("streamOwnerId")) === Number(mp.players.local.remoteId);
}

function getOrCreateRuntime(ped) {
    const pedId = getPedRemoteId(ped);
    if (!Number.isFinite(pedId)) return null;
    if (!pedRuntime.has(pedId)) {
        pedRuntime.set(pedId, {
            ctrlVer: -1,
            stateVersion: -1,
            state: "idle",
            targetId: -1,
            appliedState: "",
            appliedStateVersion: -1,
            appliedCtrlVer: -1,
            entryAppliedAt: 0,
            returnPos: null,
            weaponHash: 0,
            lastAimAt: 0,
            lastShootAt: 0,
            lastCombatAt: 0,
            lastMoveAt: 0,
            lastClearAt: 0,
        });
    }
    return pedRuntime.get(pedId);
}

function smoothPedToAuthoritativePose(ped) {
    if (!ped || !ped.getVariable) return;
    const x = Number(ped.getVariable("guardPoseX"));
    const y = Number(ped.getVariable("guardPoseY"));
    const z = Number(ped.getVariable("guardPoseZ"));
    const h = Number(ped.getVariable("guardPoseHeading"));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    const p = ped.position;
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > POSE_SNAP_DIST) {
        try { ped.setCoordsNoOffset(x, y, z, false, false, false); } catch {}
    } else if (dist > 0.05) {
        try { ped.setCoordsNoOffset(p.x + dx * POSE_SMOOTH_FACTOR, p.y + dy * POSE_SMOOTH_FACTOR, p.z + dz * POSE_SMOOTH_FACTOR, false, false, false); } catch {}
    }
    if (Number.isFinite(h)) {
        try {
            const cur = Number(ped.getHeading ? ped.getHeading() : 0) || 0;
            const delta = ((h - cur + 540) % 360) - 180;
            ped.setHeading(cur + delta * 0.14);
        } catch {}
    }
}

function ensurePedWeapon(ped, weaponHash) {
    if (!ped || !weaponHash) return;
    try { ped.giveWeapon(weaponHash, 9999, true); } catch {}
    try { ped.setCurrentWeapon(weaponHash); } catch {}
    try { ped.setAmmo(weaponHash, 9999); } catch {}
    try { ped.setAmmoInClip(weaponHash, 9999); } catch {}
    try { ped.setInfiniteAmmo(true, weaponHash); } catch {}
    try { ped.setInfiniteAmmoClip(true); } catch {}
}

function getPedHandle(ped) {
    try { return ped && ped.handle; } catch {}
    return 0;
}

function setBlockingNonTemporaryEvents(ped, enabled) {
    const handle = getPedHandle(ped);
    if (!handle) return;
    try { mp.game.invoke("0x9F8AA94D6D97DBF4", handle, !!enabled); } catch {}
}

function setCurrentPedWeapon(ped, weaponHash) {
    const handle = getPedHandle(ped);
    if (!handle || !weaponHash) return;
    try { mp.game.weapon.setCurrentPedWeapon(handle, weaponHash, true); } catch {}
}

function clearTasksImmediate(ped) {
    const handle = getPedHandle(ped);
    if (handle) {
        try { mp.game.ai.clearPedTasksImmediately(handle); return; } catch {}
    }
    try { ped.clearTasksImmediately(); } catch {
        try { ped.clearTasks(); } catch {}
    }
}

function faceTarget(ped, target) {
    if (!ped || !target) return;
    const dx = Number(target.position.x) - Number(ped.position.x);
    const dy = Number(target.position.y) - Number(ped.position.y);
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    try { ped.setHeading(heading - 90.0); } catch {}
}

function logGuard(text) {
    try { console.log(`[GUARD-CHECKPOINT][CLIENT] ${text}`); } catch {}
}

function readStateFromPed(ped, rt) {
    const ctrlVer = Number(ped.getVariable("ctrlVer"));
    const stateVersion = Number(ped.getVariable("guardStateVersion"));
    const state = String(ped.getVariable("guardState") || "idle");
    const targetId = Number(ped.getVariable("guardTarget"));

    if (Number.isFinite(ctrlVer) && ctrlVer < rt.ctrlVer) return false;
    if (Number.isFinite(ctrlVer) && ctrlVer > rt.ctrlVer) {
        rt.ctrlVer = ctrlVer;
        rt.stateVersion = -1;
    }

    if (Number.isFinite(stateVersion) && stateVersion < rt.stateVersion) return false;
    if (Number.isFinite(stateVersion)) rt.stateVersion = stateVersion;

    rt.state = state;
    rt.targetId = Number.isFinite(targetId) ? targetId : -1;
    rt.weaponHash = Number(ped.getVariable("guardWeaponHash")) || rt.weaponHash || 0;
    rt.returnPos = {
        x: Number(ped.getVariable("guardReturnX")) || ped.position.x,
        y: Number(ped.getVariable("guardReturnY")) || ped.position.y,
        z: Number(ped.getVariable("guardReturnZ")) || ped.position.z,
        heading: Number(ped.getVariable("guardReturnHeading")) || 0,
    };
    return true;
}

function hasStateEntryChange(rt) {
    return rt.appliedState !== rt.state
        || rt.appliedStateVersion !== rt.stateVersion
        || rt.appliedCtrlVer !== rt.ctrlVer;
}

function markStateApplied(rt) {
    rt.appliedState = rt.state;
    rt.appliedStateVersion = rt.stateVersion;
    rt.appliedCtrlVer = rt.ctrlVer;
    rt.entryAppliedAt = nowMs();
}

function applyStateEntry(ped, rt) {
    if (!hasStateEntryChange(rt)) return;

    const target = getPlayerByServerId(rt.targetId);
    if ((rt.state === "attack" || rt.state === "warning" || rt.state === "checking") && !target) {
        logGuard(`state-entry skipped state=${rt.state} ped=${getPedRemoteId(ped)} target=${rt.targetId} reason=no-target`);
        return;
    }

    if (rt.state === "attack") {
        try { ped.freezePosition(false); } catch {}
        clearTasksImmediate(ped);
        setBlockingNonTemporaryEvents(ped, false);
        ensurePedWeapon(ped, rt.weaponHash);
        setCurrentPedWeapon(ped, rt.weaponHash);
        faceTarget(ped, target);
        try { mp.game.ai.taskCombatPed(ped.handle, target.handle, 0, 16); } catch {}
        try { ped.setKeepTask(true); } catch {}
        markStateApplied(rt);
        return;
    }

    if (rt.state === "warning" || rt.state === "checking") {
        try { ped.freezePosition(false); } catch {}
        clearTasksImmediate(ped);
        setBlockingNonTemporaryEvents(ped, false);
        ensurePedWeapon(ped, rt.weaponHash);
        setCurrentPedWeapon(ped, rt.weaponHash);
        faceTarget(ped, target);
        try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 200, false); } catch {}
        try { ped.setKeepTask(true); } catch {}
        markStateApplied(rt);
        return;
    }

    if (rt.state === "return") {
        try { ped.freezePosition(false); } catch {}
        clearTasksImmediate(ped);
        const rp = rt.returnPos;
        if (rp) {
            try { ped.taskGoStraightToCoord(rp.x, rp.y, rp.z, 2.2, -1, rp.heading || 0, 0.05); } catch {}
        }
        markStateApplied(rt);
        return;
    }

    // idle + fallback
    clearTasksImmediate(ped);
    try { ped.freezePosition(true); } catch {}
    try { ped.setKeepTask(false); } catch {}
    markStateApplied(rt);
}

function runOwnerExecution(ped, rt, t) {
    applyStateEntry(ped, rt);
    if (hasStateEntryChange(rt)) return; // entry not applied (e.g. missing target), skip replay

    const target = getPlayerByServerId(rt.targetId);

    if (rt.state === "attack") {
        if (!target) {
            logGuard(`attack replay skipped ped=${getPedRemoteId(ped)} target=${rt.targetId} reason=no-target`);
            return;
        }
        ensurePedWeapon(ped, rt.weaponHash);
        setCurrentPedWeapon(ped, rt.weaponHash);
        faceTarget(ped, target);
        if (t - rt.lastCombatAt >= COMBAT_REPLAY_MS) {
            try { mp.game.ai.taskCombatPed(ped.handle, target.handle, 0, 16); } catch {}
            rt.lastCombatAt = t;
        }
        if (t - rt.lastAimAt >= AIM_REPLAY_MS) {
            try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 200, false); } catch {}
            rt.lastAimAt = t;
        }
        if (t - rt.lastShootAt >= SHOOT_REPLAY_MS) {
            try { mp.game.ai.taskShootAtEntity(ped.handle, target.handle, SHOOT_REPLAY_MS + 200, mp.game.joaat("FIRING_PATTERN_FULL_AUTO")); } catch {}
            rt.lastShootAt = t;
        }
        return;
    }

    if (rt.state === "warning" || rt.state === "checking") {
        if (!target) {
            logGuard(`${rt.state} replay skipped ped=${getPedRemoteId(ped)} target=${rt.targetId} reason=no-target`);
            return;
        }
        ensurePedWeapon(ped, rt.weaponHash);
        setCurrentPedWeapon(ped, rt.weaponHash);
        faceTarget(ped, target);
        if (t - rt.lastAimAt >= AIM_REPLAY_MS) {
            try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 200, false); } catch {}
            rt.lastAimAt = t;
        }
        return;
    }

    if (rt.state === "return") {
        const rp = rt.returnPos;
        if (!rp) return;
        if (t - rt.lastMoveAt >= RETURN_REPLAY_MS) {
            try { ped.taskGoStraightToCoord(rp.x, rp.y, rp.z, 2.2, -1, rp.heading || 0, 0.05); } catch {}
            rt.lastMoveAt = t;
        }
        return;
    }

    if (t - rt.lastClearAt >= CLEAR_REPLAY_MS) { clearTasksImmediate(ped); rt.lastClearAt = t; }
}

function runGuardAiLoop() {
    const t = nowMs();
    if (t - lastAiLoopAt < AI_LOOP_MS) return;
    lastAiLoopAt = t;

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            if (!ped.getVariable("guardPostId")) return;

            const rt = getOrCreateRuntime(ped);
            if (!rt) return;
            if (!readStateFromPed(ped, rt)) return;

            if (!isLocalStreamOwnerForPed(ped)) {
                smoothPedToAuthoritativePose(ped);
                return;
            }
            runOwnerExecution(ped, rt, t);
        } catch {}
    });
}

mp.events.add({
    "guardCheckpoint:warning:start": (data) => {
        activeWarning = { postId: data.postId, text: data.text || "Остановитесь", soundName: data.soundName || "5s", soundSet: data.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET" };
        activeStopZone = data.stopZone || null;
        const t = nowMs();
        if (!lastSoundAt || t - lastSoundAt > 1000) {
            playSound(activeWarning.soundName, activeWarning.soundSet);
            lastSoundAt = t;
        }
    },
    "guardCheckpoint:warning:stop": (postId) => {
        if (activeWarning && (!postId || postId === activeWarning.postId)) {
            activeWarning = null;
            activeStopZone = null;
        }
    },
    "guardCheckpoint:status:text": (postId, text, durationMs) => {
        statusText = String(text || "");
        statusUntil = nowMs() + Math.max(1000, Number(durationMs) || 3000);
    },
    "guardCheckpoint:stateSync": (postId, state, targetId, stateVersion, ctrlVer, ownerId) => {
        const key = String(postId);
        const current = postRuntime.get(key) || { stateVersion: -1, ctrlVer: -1 };
        if (Number(ctrlVer) < Number(current.ctrlVer || -1)) return;
        if (Number(ctrlVer) === Number(current.ctrlVer || -1) && Number(stateVersion) < Number(current.stateVersion || -1)) return;
        postRuntime.set(key, { state, targetId: Number(targetId), stateVersion: Number(stateVersion), ctrlVer: Number(ctrlVer), ownerId: Number(ownerId) });
    },
    "guardCheckpoint:controller:switch": (postId, ctrlVer, stateVersion) => {
        const key = String(postId);
        const cur = postRuntime.get(key) || { stateVersion: -1, ctrlVer: -1 };
        if (Number(ctrlVer) < Number(cur.ctrlVer || -1)) return;
        postRuntime.set(key, { ...cur, ctrlVer: Number(ctrlVer), stateVersion: Number(stateVersion || cur.stateVersion || 0) });
        try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ctrlVer); } catch {}
    },
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const pedId = getPedRemoteId(entity);
    if (Number.isFinite(pedId)) pedRuntime.delete(pedId);
});

mp.events.add("render", () => {
    runGuardAiLoop();

    if (statusText && nowMs() < statusUntil) {
        mp.game.graphics.drawText(statusText, [0.5, 0.84], { font: 4, color: [120, 255, 120, 230], scale: [0.45, 0.45], centre: true, outline: true });
    } else if (statusText && nowMs() >= statusUntil) {
        statusText = null;
    }

    if (!activeWarning) return;
    mp.game.graphics.drawText(activeWarning.text, [0.5, 0.88], { font: 4, color: [255, 80, 80, 230], scale: [0.55, 0.55], centre: true, outline: true });

    if (!activeStopZone) return;
    if (String(activeStopZone.type || "sphere") === "sphere" && activeStopZone.center) {
        const c = activeStopZone.center;
        mp.game.graphics.drawMarker(1, c.x, c.y, c.z - 1.0, 0, 0, 0, 0, 0, 0, activeStopZone.radius * 2.0, activeStopZone.radius * 2.0, 0.8, 50, 180, 255, 120, false, false, 2, false, null, null, false);
    }
});
