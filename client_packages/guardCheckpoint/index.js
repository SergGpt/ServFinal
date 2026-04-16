"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;
let lastRenderDebugAt = 0;
let activeCheckpoint = null;
let activeBlip = null;

const DEBUG_AIM_LINES = false;
const DEBUG_PROTOCOL = false;
const AI_LOOP_MS = 200;
const AIM_REPLAY_MS = 320;
const SHOOT_REPLAY_MS = 360;
const CLEAR_REPLAY_MS = 900;
const TARGET_SWITCH_DEBOUNCE_MS = 180;
const RETURN_REPLAY_MS = 260;
const APPROACH_REPLAY_MS = 260;
const RETURN_DEVIATION_DIST = 2.8;
const disableClearForApproaching = true;
const POSE_SMOOTH_FACTOR = 0.12;
const POSE_SNAP_DIST = 7.5;
const PENDING_RETRY_MS = 200;
const PENDING_TTL_MS = 2500;

let lastAiLoopAt = 0;

const pedAiCache = new Map(); // pedRemoteId -> runtime cache
const pendingByPed = new Map(); // pedRemoteId -> { targetId, expiresAt, lastTryAt }
const postRuntime = new Map(); // postId -> { lastAppliedSeq, behaviorSessionId, attackSessionId, ctrlVer, streamOwnerId, state }
const visualDebugLines = [];

function chatLog(text) {
    try {
        console.log(text);
        if (mp.gui && mp.gui.chat && mp.gui.chat.push) {
            mp.gui.chat.push(text);
        } else {
            // fallback: вывод в консоль игры
            mp.console.logInfo(text);
        }
    } catch (e) {}
}

chatLog("[CLIENT] guardCheckpoint client script loaded");

function pushVisualLog(text) {
    const msg = String(text || "");
    visualDebugLines.push({ at: Date.now(), msg });
    if (visualDebugLines.length > 40) visualDebugLines.shift();
    chatLog(`[GC-DBG] ${msg}`);
}

function clog(text) {
    try {
        console.log(`[GUARD-CHECKPOINT][CLIENT] ${text}`);
    } catch {}
}

function clogChat(text) {
    const line = `[GUARD-CLIENT] ${text}`;
    try { console.log(line); } catch {}
    try { mp.gui.chat.push(line); } catch {}
}

function playSound(soundName, soundSet) {
    try {
        mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true);
    } catch {}
}

function clearStopPointVisuals() {
    try { if (activeCheckpoint && activeCheckpoint.destroy) activeCheckpoint.destroy(); } catch {}
    try { if (activeBlip && activeBlip.destroy) activeBlip.destroy(); } catch {}
    activeCheckpoint = null;
    activeBlip = null;
}

function showStopPointVisuals(stopZone) {
    clearStopPointVisuals();
    if (!stopZone || !stopZone.center) return;
    const c = stopZone.center;
    try {
        activeCheckpoint = mp.checkpoints.new(
            1,
            new mp.Vector3(c.x, c.y, c.z - 0.9),
            Number(stopZone.radius || 4.0),
            {
                color: [0, 210, 255, 220],
                visible: true,
                dimension: mp.players.local.dimension,
            }
        );
    } catch {}
    try {
        activeBlip = mp.blips.new(1, new mp.Vector3(c.x, c.y, c.z), {
            color: 3,
            shortRange: true,
            scale: 0.8,
            name: "Точка остановки",
            dimension: mp.players.local.dimension,
        });
    } catch {}
}

function nowMs() {
    return Date.now();
}

function getDebugStateStore() {
    try {
        if (typeof globalThis !== "undefined") return globalThis;
    } catch {}
    try {
        if (typeof global !== "undefined") return global;
    } catch {}
    return {};
}

function sendControllerAck(postId, ver) {
    try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ver); } catch {}
}

function sendNpcDeadSignal(postId, pedId) {
    try { mp.events.callRemote("guardCheckpoint:npc.dead", postId, pedId); } catch {}
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
            const state = String(ped.getVariable("guardState") || "idle");
            if (state === "attack" || state === "return" || state === "approaching") return;
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
            lastDeadSignalAt: 0,
            lastBurstAt: 0,
            hasSeenAliveHealth: false,
            attackUntil: 0,
            hasReachedReturn: false,
        });
    }
    return pedAiCache.get(pedId);
}

function getPostRuntime(postId) {
    const key = String(postId || "");
    if (!postRuntime.has(key)) {
        postRuntime.set(key, {
            lastAppliedSeq: 0,
            behaviorSessionId: 0,
            attackSessionId: 0,
            ctrlVer: 0,
            streamOwnerId: -1,
            state: "idle",
        });
    }
    return postRuntime.get(key);
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

            const hp = Number(ped.getHealth ? ped.getHealth() : ped.health) || 0;
            if (hp > 0) cache.hasSeenAliveHealth = true;
            const dead = !!(ped.isDead && ped.isDead()) || hp <= 0;
            if (isOwner && cache.hasSeenAliveHealth && dead && t - (cache.lastDeadSignalAt || 0) > 1800) {
                sendNpcDeadSignal(postId, pedId);
                cache.lastDeadSignalAt = t;
            }

            const prevState = cache.lastState;
            const prevTargetId = cache.lastTargetId;
            const stateChanged = prevState !== state || prevTargetId !== targetId;
            if (prevTargetId !== targetId) cache.targetChangedAt = t;
            cache.lastState = state;
            cache.lastTargetId = targetId;

            const targetStable = targetId < 0 || (t - cache.targetChangedAt) >= TARGET_SWITCH_DEBOUNCE_MS;

            if (state === "attack") {
                const attackUntil = Number(cache.attackUntil) || 0;
                if (attackUntil > 0 && nowMs() > attackUntil) {
                    try { ped.clearTasks(); } catch {}
                    try { ped.setKeepTask(false); } catch {}
                    return;
                }

                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);
                const target = getPlayerByServerId(targetId);

                // Визуал (aim/shoot) нужен для всех клиентов, не только streamOwner.
                if (target && targetStable && (stateChanged || t - cache.lastAimAt >= AIM_REPLAY_MS)) {
                    try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, AIM_REPLAY_MS + 220, false); } catch {}
                    try { ped.taskAimGunAt(target.handle, AIM_REPLAY_MS + 220, false); } catch {}
                    cache.lastAimAt = t;
                }
                if (target && targetStable && (stateChanged || t - cache.lastShootAt >= SHOOT_REPLAY_MS)) {
                    const visualBurstMs = 100;
                    try {
                        mp.game.ai.taskShootAtEntity(
                            ped.handle,
                            target.handle,
                            visualBurstMs,
                            mp.game.joaat("FIRING_PATTERN_FULL_AUTO")
                        );
                    } catch {
                        try { ped.taskShootAt(target.handle, visualBurstMs, mp.game.joaat("FIRING_PATTERN_FULL_AUTO")); } catch {}
                    }
                    cache.lastShootAt = t;
                }

                // Управляющая логика нужна только у владельца стрима.
                if (!isOwner) return;
                if (!target || !targetStable) {
                    queuePendingTarget(pedId, targetId);
                    return;
                }
                try { ped.setKeepTask(true); } catch {}
                return;
            }

            if (state === "warning_aim") {
                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);
                const target = getPlayerByServerId(targetId);
                if (!target || !targetStable) {
                    if (isOwner) {
                        queuePendingTarget(pedId, targetId);
                    }
                    return;
                }
                if (stateChanged || t - cache.lastAimAt >= AIM_REPLAY_MS) {
                    try { ped.taskAimGunAt(target.handle, AIM_REPLAY_MS + 200, false); } catch {}
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
                const dx = ped.position.x - rp.x;
                const dy = ped.position.y - rp.y;
                const dz = ped.position.z - rp.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (cache.hasReachedReturn || dist <= 1.5) {
                    try { ped.clearTasks(); } catch {}
                    try { ped.setHeading(rp.heading || 0); } catch {}
                    cache.hasReachedReturn = true;
                    return;
                }
                if (!isOwner) return;
                if (stateChanged || dist > RETURN_DEVIATION_DIST || t - cache.lastMoveAt >= RETURN_REPLAY_MS) {
                    try { ped.taskGoStraightToCoord(rp.x, rp.y, rp.z, 2.2, -1, rp.heading || 0, 0.05); } catch {}
                    cache.lastMoveAt = t;
                }
                return;
            }

            if (state === "approaching") {
                if (isOwner) {
                    try { ped.setKeepTask(true); } catch {}
                    const gp = cache.gotoPos;
                    if (gp && Number.isFinite(gp.x) && Number.isFinite(gp.y) && Number.isFinite(gp.z) && (stateChanged || t - cache.lastMoveAt >= APPROACH_REPLAY_MS)) {
                        try { ped.taskGoToCoordAnyMeans(gp.x, gp.y, gp.z, 1.2, 0, gp.range || 5.0, 1, 0.5); } catch {}
                        cache.lastMoveAt = t;
                    }
                }
                return;
            }

            if (!isOwner) {
                smoothPedToAuthoritativePose(ped);
                return;
            }
            if (state !== "attack" && state !== "return") {
                if (disableClearForApproaching && state === "approaching") return;
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

function applyNpcCommandHints(packet) {
    if (!packet) return;
    clog(`client: applyNpcCommandHints start cmd=${packet.command} post=${packet.postId}`);
    pushVisualLog(`applyHints cmd=${packet.command} post=${packet.postId}`);
    const command = String(packet.command || "idle");
    const targetId = Number(packet.targetId);
    const units = packet.units || [];
    (units || []).forEach((u) => {
        const pedId = Number(u.pedId);
        if (!Number.isFinite(pedId)) return;
        const cache = getOrCreateCache(pedId);
        const ped = mp.peds.atRemoteId(pedId);
        if (Number(u.weaponHash) > 0) cache.weaponHashHint = Number(u.weaponHash);
        if (command === "dead") {
            cache.lastState = "dead";
            cache.hasReachedReturn = false;
        }
        if (command === "respawn") {
            cache.lastState = "idle";
            cache.hasReachedReturn = false;
        }
        if (command === "idle" || command === "return" || command === "dead") {
            if (ped) {
                try { ped.clearTasks(); } catch {}
                try { ped.setKeepTask(false); } catch {}
            }
        }
        if (command === "goto") {
            clog(`client: goto processing for ped=${pedId}`);
            const ped = mp.peds.atRemoteId(pedId);

            // ДИАГНОСТИКА
            if (!ped) {
                clog(`client: goto ERROR - ped not found for id=${pedId}`);
                chatLog(`[ERROR] goto: ped ${pedId} not found`);
                return;
            }

            cache.hasReachedReturn = false;

            // Получаем координаты
            const gotoX = Number(u.gotoX != null ? u.gotoX : packet.gotoX);
            const gotoY = Number(u.gotoY != null ? u.gotoY : packet.gotoY);
            const gotoZ = Number(u.gotoZ != null ? u.gotoZ : packet.gotoZ);
            const gotoRange = Math.max(0.5, Number(u.gotoRange != null ? u.gotoRange : packet.gotoRange) || 5.0);
            cache.gotoPos = { x: gotoX, y: gotoY, z: gotoZ, range: gotoRange };

            if (!isLocalStreamOwnerForPed(ped)) {
                clog(`client: goto skip non-owner ped=${pedId}`);
                return;
            }

            // ДИАГНОСТИКА КООРДИНАТ
            if (!Number.isFinite(gotoX) || !Number.isFinite(gotoY) || !Number.isFinite(gotoZ)) {
                clog(`client: goto ERROR - invalid coordinates: ${gotoX},${gotoY},${gotoZ}`);
                chatLog(`[ERROR] goto: invalid coords for ped ${pedId}`);
                return;
            }

            // ДИАГНОСТИКА ПЕДА
            const pedPos = ped.position;
            const distToTarget = Math.sqrt(
                Math.pow(pedPos.x - gotoX, 2) +
                Math.pow(pedPos.y - gotoY, 2) +
                Math.pow(pedPos.z - gotoZ, 2)
            );

            clog(`client: goto ped=${pedId} pos=${pedPos.x},${pedPos.y},${pedPos.z} target=${gotoX},${gotoY},${gotoZ} dist=${distToTarget.toFixed(2)} range=${gotoRange}`);
            chatLog(`[GOTO] ped ${pedId} → target dist=${distToTarget.toFixed(1)}m need=${gotoRange}m`);

            // ПРОВЕРКА: если уже рядом
            if (distToTarget <= gotoRange) {
                clog("client: goto - already in range, skip movement");
                chatLog("[GOTO] already in range, skip");
                try {
                    const dbg = getDebugStateStore();
                    dbg.__lastGotoPed = pedId;
                    dbg.__lastGotoSuccess = true;
                    dbg.__lastGotoTime = Date.now();
                    if (typeof window !== "undefined") {
                        window.__lastGotoSuccess = true;
                    }
                } catch {}
                return;
            }

            // ВЫПОЛНЯЕМ ДВИЖЕНИЕ
            let success = false;
            try {
                ped.clearTasks();
                ped.setKeepTask(true);

                // Пробуем taskGoToCoordAnyMeans
                const result = ped.taskGoToCoordAnyMeans(gotoX, gotoY, gotoZ, 1.2, 0, gotoRange, 1, 0.5);
                success = result !== false;

                if (!success) {
                    // Fallback: taskGoToCoord
                    ped.taskGoToCoord(gotoX, gotoY, gotoZ, 1.2, -1);
                    success = true;
                }

                clog(`client: goto movement started success=${success}`);
                chatLog(`[GOTO] movement ${success ? "STARTED" : "FAILED"} for ped ${pedId}`);
            } catch (e) {
                clog(`client: goto exception: ${e.message}`);
                chatLog(`[ERROR] goto exception: ${e.message}`);
                success = false;
            }

            try {
                const dbg = getDebugStateStore();
                dbg.__lastGotoPed = pedId;
                dbg.__lastGotoSuccess = success;
                dbg.__lastGotoTime = Date.now();
                if (typeof window !== "undefined") {
                    window.__lastGotoSuccess = success;
                }
            } catch {}
            pushVisualLog(`goto ped=${pedId} success=${success} range=${gotoRange}`);
            return;
        }
        if (command === "return") {
            cache.returnPos = {
                x: Number(u.returnX != null ? u.returnX : u.x) || 0,
                y: Number(u.returnY != null ? u.returnY : u.y) || 0,
                z: Number(u.returnZ != null ? u.returnZ : u.z) || 0,
                heading: Number(u.returnHeading != null ? u.returnHeading : u.heading) || 0,
            };
            cache.hasReachedReturn = false;
            if (ped) {
                try { ped.taskGoStraightToCoord(cache.returnPos.x, cache.returnPos.y, cache.returnPos.z, 2.2, -1, cache.returnPos.heading || 0, 0.05); } catch {}
            }
        }
        if (command === "search") {
            if (ped) {
                const duration = Math.max(1000, Number(packet.searchDurationMs) || 5000);
                try { ped.clearTasks(); } catch {}
                try {
                    mp.game.streaming.requestAnimDict("amb@world_human_guard_patrol@male@idle_a");
                    ped.taskPlayAnim("amb@world_human_guard_patrol@male@idle_a", "idle_b", 8.0, -8.0, duration, 1, 0, false, false, false);
                } catch {}
            }
        }
        if (command === "fire" || command === "aim") {
            cache.attackUntil = Number(packet.attackUntil) || 0;
            cache.hasReachedReturn = false;
            if (command === "fire") {
                const target = getPlayerByServerId(targetId);
                if (ped && target) {
                    const burstMs = 100;
                    try { ped.taskShootAt(target.handle, burstMs, mp.game.joaat("FIRING_PATTERN_FULL_AUTO")); } catch {}
                    chatLog(`[CLIENT] force fire burst ped=${pedId} burst=${burstMs}`);
                    pushVisualLog(`fire ped=${pedId} target=${targetId} burst=${burstMs}`);
                }
            }
        }
        if (u.hasReachedReturn === true) {
            cache.hasReachedReturn = true;
            if (ped) {
                try { ped.clearTasks(); } catch {}
                try { ped.setKeepTask(false); } catch {}
            }
        }

        if (ped && (command === "return" || command === "idle" || command === "fire" || command === "attack" || command === "goto" || command === "search")) {
            let nextState = command;
            if (command === "fire") nextState = "attack";
            if (command === "goto") nextState = "approaching";
            try { ped.setVariable("guardState", nextState); } catch {}
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
            text: `${data.text || "Остановитесь"} | Зона остановки (широкая)`,
            soundName: data.soundName || "5s",
            soundSet: data.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
        };
        activeStopZone = data.stopZone || null;
        showStopPointVisuals(activeStopZone);

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
        clearStopPointVisuals();
    },

    "guardCheckpoint:status:text": (postId, text, durationMs) => {
        statusText = String(text || "");
        statusUntil = nowMs() + Math.max(1000, Number(durationMs) || 3000);
        clog(`status post=${postId} text="${statusText}"`);
    },

    "guardCheckpoint:npcCommand": (packetOrPostId, legacyCommand, legacyTargetId, legacyUnits, legacyOwnerId) => {
        clogChat("===== NPC COMMAND RECEIVED =====");
        try { console.log("[CLIENT] packet:", packetOrPostId); } catch {}
        try { console.log("[CLIENT] legacyCommand:", legacyCommand); } catch {}
        try { clogChat(`packet=${JSON.stringify(packetOrPostId)}`); } catch {}
        try { clogChat(`legacyCommand=${legacyCommand}`); } catch {}
        const preCmd = typeof packetOrPostId === "object" && packetOrPostId
            ? packetOrPostId.command
            : legacyCommand;
        const prePost = typeof packetOrPostId === "object" && packetOrPostId
            ? packetOrPostId.postId
            : packetOrPostId;
        clog(`client: npcCommand received cmd=${preCmd} post=${prePost}`);
        pushVisualLog(`npcCommand cmd=${preCmd} post=${prePost}`);
        try {
            const dbg = getDebugStateStore();
            dbg.__lastNpcCommand = String(preCmd || "unknown");
            dbg.__lastNpcCommandTime = Date.now();
        } catch {}

        let packet = null;
        if (typeof packetOrPostId === "object" && packetOrPostId) {
            packet = packetOrPostId;
        } else {
            packet = {
                postId: packetOrPostId,
                command: legacyCommand,
                targetId: legacyTargetId,
                units: legacyUnits || [],
                streamOwnerId: legacyOwnerId,
                commandSeq: 0,
                behaviorSessionId: 0,
                attackSessionId: 0,
                ctrlVer: 0,
            };
        }
        chatLog(`[CLIENT] npcCommand received cmd=${packet.command} post=${packet.postId} seq=${packet.commandSeq}`);
        if (packet.command === "goto" || packet.command === "fire") {
            chatLog(`[CLIENT] immediate apply for cmd=${packet.command} (skip stale checks)`);
            applyNpcCommandHints(packet);
            return;
        }
        const postId = String(packet.postId || "");
        const rt = getPostRuntime(postId);
        const seq = Number(packet.commandSeq) || 0;
        const lastAppliedSeq = Number(rt.lastAppliedSeq) || 0;
        clog(`client: npcCommand seq=${seq} last=${lastAppliedSeq}`);
        const behaviorSessionId = Number(packet.behaviorSessionId) || 0;
        const attackSessionId = Number(packet.attackSessionId) || 0;
        const isGoto = String(packet.command || "") === "goto";
        if (isGoto) {
            clog(`client: goto bypass stale-check (seq=${seq} last=${lastAppliedSeq})`);
        } else if (seq && seq <= lastAppliedSeq) {
            if (DEBUG_PROTOCOL) clog(`drop packet post=${postId} reason=seq-old seq=${seq} last=${rt.lastAppliedSeq}`);
            return;
        }
        if (!isGoto && attackSessionId && attackSessionId < (rt.attackSessionId || 0)) {
            if (DEBUG_PROTOCOL) clog(`drop packet post=${postId} reason=attack-session-old as=${attackSessionId} last=${rt.attackSessionId}`);
            return;
        }
        if (!isGoto && behaviorSessionId && behaviorSessionId < (rt.behaviorSessionId || 0)) {
            if (DEBUG_PROTOCOL) clog(`drop packet post=${postId} reason=behavior-session-old bs=${behaviorSessionId} last=${rt.behaviorSessionId}`);
            return;
        }

        rt.lastAppliedSeq = Math.max(rt.lastAppliedSeq || 0, seq);
        rt.behaviorSessionId = Math.max(rt.behaviorSessionId || 0, behaviorSessionId);
        rt.attackSessionId = Math.max(rt.attackSessionId || 0, attackSessionId);
        rt.streamOwnerId = Number(packet.streamOwnerId == null ? rt.streamOwnerId : packet.streamOwnerId);
        rt.ctrlVer = Number(packet.ctrlVer == null ? rt.ctrlVer : packet.ctrlVer);
        rt.state = String(packet.state || rt.state || "idle");

        clog(`npcCommand post=${postId} seq=${seq} cmd=${packet.command} target=${packet.targetId} units=${(packet.units || []).length}`);
        if (DEBUG_PROTOCOL) clog(`apply packet post=${postId} seq=${seq} bs=${behaviorSessionId} as=${attackSessionId} owner=${rt.streamOwnerId} ctrlVer=${rt.ctrlVer}`);
        applyNpcCommandHints(packet);
    },

    "guardCheckpoint:controller:switch": (postId, ver, state) => {
        const rt = getPostRuntime(postId);
        rt.ctrlVer = Number(ver) || 0;
        rt.state = String(state || rt.state || "idle");
        sendControllerAck(postId, ver);
        setTimeout(() => sendControllerAck(postId, ver), 300);
    },

    "guardCheckpoint:stateSnapshot": (snapshot) => {
        if (!snapshot || !snapshot.postId) return;
        const rt = getPostRuntime(snapshot.postId);
        rt.lastAppliedSeq = Number(snapshot.commandSeq) || 0;
        rt.behaviorSessionId = Number(snapshot.behaviorSessionId) || 0;
        rt.attackSessionId = Number(snapshot.attackSessionId) || 0;
        rt.ctrlVer = Number(snapshot.ctrlVer) || 0;
        rt.streamOwnerId = Number(snapshot.streamOwnerId) || -1;
        rt.state = String(snapshot.state || "idle");
        applyNpcCommandHints({
            postId: snapshot.postId,
            command: snapshot.state || "idle",
            targetId: snapshot.targetPlayerId == null ? -1 : snapshot.targetPlayerId,
            units: snapshot.units || [],
        });
    },

    "guardCheckpoint:attackBurst": (payload) => {
        if (!payload || !Array.isArray(payload.pedIds)) return;
        const target = getPlayerByServerId(payload.targetId);
        payload.pedIds.forEach((id) => {
            const pedId = Number(id);
            if (!Number.isFinite(pedId)) return;
            const cache = getOrCreateCache(pedId);
            cache.lastBurstAt = nowMs();
            if (target) cache.lastTargetId = Number(payload.targetId);
        });
    },

    "guardCheckpoint:debug": (text) => {
        clog(`server-debug: ${text}`);
    },
});

mp.events.add("outgoingDamage", (sourceEntity, targetEntity, sourcePlayer, weapon, boneIndex, damage) => {
    try {
        const src = sourceEntity;
        if (!src || !src.getVariable) return;
        const postId = src.getVariable("guardPostId");
        if (!postId) return;
        const targetRid = Number(targetEntity && (targetEntity.remoteId != null ? targetEntity.remoteId : targetEntity.id));
        const sourcePedRid = Number(src && (src.remoteId != null ? src.remoteId : src.id));
        if (!Number.isFinite(targetRid) || !Number.isFinite(sourcePedRid)) return true;
        mp.events.callRemote(
            "guardCheckpoint:syncDamage",
            postId,
            sourcePedRid,
            targetRid,
            Number(weapon) || 0,
            Number(boneIndex) || 0,
            Number(damage) || 0
        );
    } catch {}
    return true;
});

mp.events.add("incomingDamage", (sourceEntity) => {
    try {
        if (sourceEntity && sourceEntity.getVariable && sourceEntity.getVariable("guardPostId")) {
            return true;
        }
    } catch {}
    return undefined;
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

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            if (!ped.getVariable("guardPostId")) return;
            const pedId = getPedRemoteId(ped);
            if (!Number.isFinite(pedId)) return;
            const cache = pedAiCache.get(pedId);
            if (!cache || !cache.lastBurstAt) return;
            if (nowMs() - cache.lastBurstAt > 140) return;
            const target = getPlayerByServerId(cache.lastTargetId);
            if (!target) return;
            const p = ped.position;
            const tPos = target.position;
            mp.game.graphics.drawLine(
                p.x, p.y, p.z + 1.0,
                tPos.x, tPos.y, tPos.z + 0.7,
                255, 170, 70, 210
            );
        } catch {}
    });

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

    // ВИЗУАЛЬНЫЕ ЛОГИ НА ЭКРАНЕ
    const now = Date.now();
    const logLines = [];
    const dbg = getDebugStateStore();

    // Лог последней полученной команды
    if (dbg.__lastNpcCommand) {
        const age = now - dbg.__lastNpcCommandTime;
        if (age < 3000) {
            logLines.push(`~y~NPC CMD: ${dbg.__lastNpcCommand}`);
        }
    }

    // Лог движения goto
    if (dbg.__lastGotoPed && dbg.__lastGotoSuccess !== undefined) {
        const age = now - dbg.__lastGotoTime;
        if (age < 3000) {
            const status = dbg.__lastGotoSuccess ? "~g~SUCCESS" : "~r~FAIL";
            logLines.push(`~y~GOTO ped=${dbg.__lastGotoPed}: ${status}`);
        }
    }

    // Лог состояния поста
    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            const postId = ped.getVariable("guardPostId");
            if (!postId) return;
            const state = ped.getVariable("guardState");
            if (state && state !== "idle") {
                const dist = mp.players.local.position.distanceTo(ped.position);
                if (dist < 30) {
                    logLines.push(`~b~${postId}: ${state} ~w~dist=${dist.toFixed(1)}m`);
                }
            }
        } catch {}
    });

    // Отрисовка логов на экране
    if (logLines.length > 0) {
        let y = 0.05;
        logLines.forEach((line, idx) => {
            mp.game.graphics.drawText(line, [0.02, y + (idx * 0.035)], {
                font: 4,
                color: [255, 255, 255, 255],
                scale: [0.4, 0.4],
                outline: true,
            });
        });
    }

    // Доп. постоянный debug-лог последних событий скрипта (видно прямо на экране)
    const recentDebug = visualDebugLines.filter((x) => now - x.at < 10000).slice(-8);
    if (recentDebug.length > 0) {
        recentDebug.forEach((entry, idx) => {
            mp.game.graphics.drawText(`~w~[GC] ${entry.msg}`, [0.02, 0.42 + (idx * 0.022)], {
                font: 4,
                color: [255, 255, 255, 210],
                scale: [0.33, 0.33],
                outline: true,
            });
        });
    }
});
