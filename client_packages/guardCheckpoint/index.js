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
const RETURN_REPLAY_MS = 900;
const RETURN_DEVIATION_DIST = 2.8;
const POSE_SMOOTH_FACTOR = 0.12;
const POSE_SNAP_DIST = 7.5;
const PENDING_RETRY_MS = 200;
const PENDING_TTL_MS = 2500;

let lastAiLoopAt = 0;

const pedAiCache = new Map(); // pedRemoteId -> runtime cache
const pendingByPed = new Map(); // pedRemoteId -> { targetId, expiresAt, lastTryAt }
const postRuntime = new Map(); // postId -> { lastAppliedSeq, behaviorSessionId, attackSessionId, ctrlVer, streamOwnerId, state }

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
                color: [50, 180, 255, 170],
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
                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);
                if (!isOwner) {
                    return;
                }
                const target = getPlayerByServerId(targetId);
                if (!target || !targetStable) {
                    queuePendingTarget(pedId, targetId);
                    return;
                }
                if (stateChanged || t - cache.lastShootAt >= SHOOT_REPLAY_MS) {
                    try { ped.taskCombat(target.handle, 0, 16); } catch {}
                    try { ped.setKeepTask(true); } catch {}
                    cache.lastShootAt = t;
                }
                return;
            }

            if (state === "warning_aim") {
                ensurePedWeapon(ped, cache.weaponHashHint || weaponHash);
                if (!isOwner) {
                    return;
                }
                const target = getPlayerByServerId(targetId);
                if (!target || !targetStable) {
                    queuePendingTarget(pedId, targetId);
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

function applyNpcCommandHints(packet) {
    if (!packet) return;
    const command = String(packet.command || "idle");
    const targetId = Number(packet.targetId);
    const units = packet.units || [];
    (units || []).forEach((u) => {
        const pedId = Number(u.pedId);
        if (!Number.isFinite(pedId)) return;
        const cache = getOrCreateCache(pedId);
        if (Number(u.weaponHash) > 0) cache.weaponHashHint = Number(u.weaponHash);
        if (command === "dead") {
            cache.lastState = "dead";
        }
        if (command === "respawn") {
            cache.lastState = "idle";
        }
        if (command === "return") {
            cache.returnPos = {
                x: Number(u.returnX != null ? u.returnX : u.x) || 0,
                y: Number(u.returnY != null ? u.returnY : u.y) || 0,
                z: Number(u.returnZ != null ? u.returnZ : u.z) || 0,
                heading: Number(u.returnHeading != null ? u.returnHeading : u.heading) || 0,
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
        const postId = String(packet.postId || "");
        const rt = getPostRuntime(postId);
        const seq = Number(packet.commandSeq) || 0;
        const behaviorSessionId = Number(packet.behaviorSessionId) || 0;
        const attackSessionId = Number(packet.attackSessionId) || 0;
        if (seq && seq <= (rt.lastAppliedSeq || 0)) {
            if (DEBUG_PROTOCOL) clog(`drop packet post=${postId} reason=seq-old seq=${seq} last=${rt.lastAppliedSeq}`);
            return;
        }
        if (attackSessionId && attackSessionId < (rt.attackSessionId || 0)) {
            if (DEBUG_PROTOCOL) clog(`drop packet post=${postId} reason=attack-session-old as=${attackSessionId} last=${rt.attackSessionId}`);
            return;
        }
        if (behaviorSessionId && behaviorSessionId < (rt.behaviorSessionId || 0)) {
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
});
