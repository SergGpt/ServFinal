"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;
let lastRenderDebugAt = 0;

const DEBUG_AIM_LINES = false;
const AI_LOOP_MS = 200;
const AIM_REPLAY_MS = 320;
const SHOOT_REPLAY_MS = 360;
const CLEAR_REPLAY_MS = 900;
const TARGET_SWITCH_DEBOUNCE_MS = 180;
const RETURN_REPLAY_MS = 900;
const RETURN_DEVIATION_DIST = 2.8;
const POSE_SMOOTH_FACTOR = 0.12;
const POSE_SNAP_DIST = 7.5;
const PENDING_RETRY_MS = 200;
const PENDING_TTL_MS = 2500;

let lastAiLoopAt = 0;

const pedAiCache = new Map(); // pedRemoteId -> runtime cache
const pendingByPed = new Map(); // pedRemoteId -> { targetId, expiresAt, lastTryAt }

function clog(text) {
    try {
        console.log(`[GUARD-CHECKPOINT][CLIENT] ${text}`);
    } catch {}
}

function playSound(soundName, soundSet) {
    try {
        mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true);
    } catch {}
}

function nowMs() {
    return Date.now();
}


function sendControllerAck(postId, ver) {
    try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ver); } catch {}
}

function getPedRemoteId(ped) {
    return Number(ped && (ped.remoteId != null ? ped.remoteId : ped.id));
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
    const ownerId = Number(ped.getVariable("streamOwnerId"));
    const localId = Number(mp.players.local.remoteId);
    return Number.isFinite(ownerId) && Number.isFinite(localId) && ownerId === localId;
}

function smoothPedToAuthoritativePose(ped) {
    if (!ped || !ped.getVariable) return;
    const x = Number(ped.getVariable("guardPoseX"));
    const y = Number(ped.getVariable("guardPoseY"));
    const z = Number(ped.getVariable("guardPoseZ"));
    const h = Number(ped.getVariable("guardPoseHeading"));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    const px = ped.position.x;
    const py = ped.position.y;
    const pz = ped.position.z;
    const dx = x - px;
    const dy = y - py;
    const dz = z - pz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > POSE_SNAP_DIST) {
        try { ped.setCoordsNoOffset(x, y, z, false, false, false); } catch {}
    } else if (dist > 0.05) {
        try { ped.setCoordsNoOffset(px + dx * POSE_SMOOTH_FACTOR, py + dy * POSE_SMOOTH_FACTOR, pz + dz * POSE_SMOOTH_FACTOR, false, false, false); } catch {}
    }

    if (Number.isFinite(h)) {
        try {
            const cur = Number(ped.getHeading ? ped.getHeading() : 0) || 0;
            let delta = ((h - cur + 540) % 360) - 180;
            const next = cur + delta * 0.14;
            ped.setHeading(next);
        } catch {}
    }
}


function smoothObserverPedsEachFrame() {
    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            if (!ped.getVariable("guardPostId")) return;
            if (isLocalStreamOwnerForPed(ped)) return;
            smoothPedToAuthoritativePose(ped);
        } catch {}
    });
}

function getGuardTargetId(ped) {
    if (!ped || !ped.getVariable) return -1;
    const raw = ped.getVariable("guardTarget");
    if (Number.isFinite(Number(raw))) return Number(raw);
    const rawLegacy = ped.getVariable("guardTargetId");
    if (Number.isFinite(Number(rawLegacy))) return Number(rawLegacy);
    return -1;
}

function getGuardWeaponHash(ped, hint = null) {
    if (hint && Number(hint) > 0) return Number(hint);
    if (!ped || !ped.getVariable) return 0;
    const raw = Number(ped.getVariable("guardWeaponHash"));
    return Number.isFinite(raw) ? raw : 0;
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

function getOrCreateCache(pedId) {
    if (!pedAiCache.has(pedId)) {
        pedAiCache.set(pedId, {
            lastState: "",
            lastTargetId: -1,
            lastAimAt: 0,
            lastShootAt: 0,
            lastClearAt: 0,
            lastMoveAt: 0,
            targetChangedAt: 0,
            returnPos: null,
            weaponHashHint: 0,
        });
    }
    return pedAiCache.get(pedId);
}


function restorePedBehaviorFromState(ped) {
    if (!ped || !ped.getVariable) return;
    const postId = ped.getVariable("guardPostId");
    if (!postId) return;

    const pedId = getPedRemoteId(ped);
    if (Number.isFinite(pedId)) {
        pedAiCache.delete(pedId);
        pendingByPed.delete(pedId);
    }

    // force immediate replay after stream-in
    lastAiLoopAt = 0;
    runGuardAiLoop();
}

function queuePendingTarget(pedId, targetId) {
    pendingByPed.set(pedId, {
        targetId,
        expiresAt: nowMs() + PENDING_TTL_MS,
        lastTryAt: 0,
    });
}

function processPendingTargets() {
    const t = nowMs();
    for (const [pedId, item] of pendingByPed.entries()) {
        if (!item || t > item.expiresAt) {
            pendingByPed.delete(pedId);
            continue;
        }
        if (t - item.lastTryAt < PENDING_RETRY_MS) continue;
        item.lastTryAt = t;

        const ped = mp.peds.atRemoteId(pedId);
        if (!ped || !ped.getVariable) continue;

        const state = String(ped.getVariable("guardState") || "idle");
        if (state !== "attack" && state !== "warning_aim") {
            pendingByPed.delete(pedId);
            continue;
        }

        const target = getPlayerByServerId(item.targetId);
        if (!target) continue;

        // target появился — цикл AI подхватит выполнение
        pendingByPed.delete(pedId);
    }
}

function runGuardAiLoop() {
    const t = nowMs();
    if (t - lastAiLoopAt < AI_LOOP_MS) return;
    lastAiLoopAt = t;

    processPendingTargets();

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            const postId = ped.getVariable("guardPostId");
            if (!postId) return;

            const pedId = getPedRemoteId(ped);
            if (!Number.isFinite(pedId)) return;

            const cache = getOrCreateCache(pedId);
            const state = String(ped.getVariable("guardState") || "idle");
            const targetId = getGuardTargetId(ped);
            const isOwner = isLocalStreamOwnerForPed(ped);
            const weaponHash = getGuardWeaponHash(ped, cache.weaponHashHint);
            if (weaponHash > 0) cache.weaponHashHint = weaponHash;

            const prevState = cache.lastState;
            const prevTargetId = cache.lastTargetId;
            const stateChanged = prevState !== state || prevTargetId !== targetId;
            if (prevTargetId !== targetId) cache.targetChangedAt = t;
            cache.lastState = state;
            cache.lastTargetId = targetId;

            const targetStable = targetId < 0 || (t - cache.targetChangedAt) >= TARGET_SWITCH_DEBOUNCE_MS;

            if (state === "attack") {
                if (!isOwner) {
                    smoothPedToAuthoritativePose(ped);
                    return;
                }

                const target = getPlayerByServerId(targetId);
                if (!target || !targetStable) {
                    queuePendingTarget(pedId, targetId);
                    return;
                }

                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);

                if (stateChanged || t - cache.lastAimAt >= AIM_REPLAY_MS) {
                    try {
                        mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 200, false);
                    } catch {
                        try { ped.taskAimGunAt(target.handle, AIM_REPLAY_MS + 200, false); } catch {}
                    }
                    cache.lastAimAt = t;
                }

                if (stateChanged || t - cache.lastShootAt >= SHOOT_REPLAY_MS) {
                    try {
                        mp.game.ai.taskShootAtEntity(ped.handle, target.handle, SHOOT_REPLAY_MS + 250, mp.game.joaat("FIRING_PATTERN_FULL_AUTO"));
                    } catch {
                        // На некоторых билдах taskShootAtEntity нестабилен для synced ped — держим безопасный fallback.
                        try { ped.taskCombat(target.handle, 0, 16); } catch {}
                    }
                    try { ped.setKeepTask(true); } catch {}
                    cache.lastShootAt = t;
                }
                return;
            }

            if (state === "warning_aim") {
                if (!isOwner) {
                    smoothPedToAuthoritativePose(ped);
                    return;
                }
                const target = getPlayerByServerId(targetId);
                if (!target || !targetStable) {
                    queuePendingTarget(pedId, targetId);
                    return;
                }

                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);

                if (stateChanged || t - cache.lastAimAt >= AIM_REPLAY_MS) {
                    try {
                        mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 200, false);
                    } catch {
                        try { ped.taskAimGunAt(target.handle, AIM_REPLAY_MS + 200, false); } catch {}
                    }
                    cache.lastAimAt = t;
                }
                return;
            }

            if (state === "return") {
                const rp = cache.returnPos || {
                    x: Number(ped.getVariable("guardReturnX")) || ped.position.x,
                    y: Number(ped.getVariable("guardReturnY")) || ped.position.y,
                    z: Number(ped.getVariable("guardReturnZ")) || ped.position.z,
                    heading: Number(ped.getVariable("guardReturnHeading")) || 0,
                };
                cache.returnPos = rp;
                if (!isOwner) {
                    smoothPedToAuthoritativePose(ped);
                    return;
                }
                const dx = ped.position.x - rp.x;
                const dy = ped.position.y - rp.y;
                const dz = ped.position.z - rp.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (stateChanged || dist > RETURN_DEVIATION_DIST || t - cache.lastMoveAt >= RETURN_REPLAY_MS) {
                    try { ped.taskGoStraightToCoord(rp.x, rp.y, rp.z, 2.2, -1, rp.heading || 0, 0.05); } catch {}
                    cache.lastMoveAt = t;
                }
                return;
            }

            if (!isOwner) {
                smoothPedToAuthoritativePose(ped);
                return;
            }
            if (stateChanged || t - cache.lastClearAt >= CLEAR_REPLAY_MS) {
                try { ped.clearTasks(); } catch {}
                try { ped.setKeepTask(false); } catch {}
                cache.lastClearAt = t;
            }
        } catch {}
    });
}

function applyNpcCommandHints(command, targetId, units) {
    (units || []).forEach((u) => {
        const pedId = Number(u.pedId);
        if (!Number.isFinite(pedId)) return;
        const cache = getOrCreateCache(pedId);
        if (Number(u.weaponHash) > 0) cache.weaponHashHint = Number(u.weaponHash);
        if (command === "return") {
            cache.returnPos = {
                x: Number(u.x) || 0,
                y: Number(u.y) || 0,
                z: Number(u.z) || 0,
                heading: Number(u.heading) || 0,
            };
        }

        if (command === "aim" || command === "fire") {
            queuePendingTarget(pedId, Number(targetId));
        }
    });
}

mp.events.add({
    "guardCheckpoint:warning:start": (data) => {
        activeWarning = {
            postId: data.postId,
            text: data.text || "Остановитесь",
            soundName: data.soundName || "5s",
            soundSet: data.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
        };
        activeStopZone = data.stopZone || null;

        const t = nowMs();
        if (!lastSoundAt || t - lastSoundAt > 1000) {
            playSound(activeWarning.soundName, activeWarning.soundSet);
            lastSoundAt = t;
        }
    },

    "guardCheckpoint:warning:stop": (postId) => {
        if (!activeWarning) return;
        if (postId && activeWarning.postId && postId !== activeWarning.postId) return;
        activeWarning = null;
        activeStopZone = null;
    },

    "guardCheckpoint:status:text": (postId, text, durationMs) => {
        statusText = String(text || "");
        statusUntil = nowMs() + Math.max(1000, Number(durationMs) || 3000);
        clog(`status post=${postId} text="${statusText}"`);
    },

    "guardCheckpoint:npcCommand": (postId, command, targetId, units) => {
        // npcCommand используется как hint/ускоритель. Основной визуал — AI loop по guardState.
        clog(`npcCommand post=${postId} cmd=${command} target=${targetId} units=${(units || []).length}`);
        applyNpcCommandHints(command, targetId, units);
    },

    "guardCheckpoint:controller:switch": (postId, ver) => {
        sendControllerAck(postId, ver);
        setTimeout(() => sendControllerAck(postId, ver), 300);
    },

    "guardCheckpoint:debug": (text) => {
        clog(`server-debug: ${text}`);
    },
});

mp.events.add("entityStreamIn", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const postId = entity.getVariable ? entity.getVariable("guardPostId") : null;
    if (!postId) return;
    restorePedBehaviorFromState(entity);
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const postId = entity.getVariable ? entity.getVariable("guardPostId") : null;
    if (!postId) return;
    const pedId = getPedRemoteId(entity);
    if (Number.isFinite(pedId)) {
        pendingByPed.delete(pedId);
        pedAiCache.delete(pedId);
    }
});

mp.events.add("render", () => {
    runGuardAiLoop();
    smoothObserverPedsEachFrame();

    if (statusText && nowMs() < statusUntil) {
        mp.game.graphics.drawText(statusText, [0.5, 0.84], {
            font: 4,
            color: [120, 255, 120, 230],
            scale: [0.45, 0.45],
            centre: true,
            outline: true,
        });
    } else if (statusText && nowMs() >= statusUntil) {
        statusText = null;
    }

    if (DEBUG_AIM_LINES) {
        mp.peds.forEach((ped) => {
            try {
                if (!ped || !ped.getVariable) return;
                const postId = ped.getVariable("guardPostId");
                if (!postId) return;
                const state = String(ped.getVariable("guardState") || "");
                if (state !== "warning_aim" && state !== "attack") return;
                const p = ped.position;
                const me = mp.players.local.position;
                mp.game.graphics.drawLine(
                    p.x,
                    p.y,
                    p.z + 1.0,
                    me.x,
                    me.y,
                    me.z + 0.7,
                    state === "attack" ? 255 : 255,
                    state === "attack" ? 80 : 220,
                    state === "attack" ? 80 : 80,
                    220
                );
            } catch {}
        });
    }

    if (!activeWarning) return;
    if (nowMs() - lastRenderDebugAt > 2000) {
        lastRenderDebugAt = nowMs();
        clog(`render warning post=${activeWarning.postId} text="${activeWarning.text}"`);
    }

    mp.game.graphics.drawText(activeWarning.text, [0.5, 0.88], {
        font: 4,
        color: [255, 80, 80, 230],
        scale: [0.55, 0.55],
        centre: true,
        outline: true,
    });

    if (!activeStopZone) return;
    const type = String(activeStopZone.type || "sphere");
    if (type === "sphere" && activeStopZone.center) {
        const c = activeStopZone.center;
        mp.game.graphics.drawMarker(
            1,
            c.x,
            c.y,
            c.z - 1.0,
            0,
            0,
            0,
            0,
            0,
            0,
            activeStopZone.radius * 2.0,
            activeStopZone.radius * 2.0,
            0.8,
            50,
            180,
            255,
            120,
            false,
            false,
            2,
            false,
            null,
            null,
            false
        );
    }
});
