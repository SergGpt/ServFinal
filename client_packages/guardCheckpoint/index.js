"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;

const OWNER_LOOP_MS = 120;
const POSE_UPLINK_MS = 110;
const POSE_BUFFER_DELAY_MS = 100;
const MAX_EXTRAP_MS = 260;
const TINY_DESYNC = 0.06;
const NORMAL_DESYNC = 0.9;
const MEDIUM_DESYNC = 2.4;
const HUGE_DESYNC = 7.5;

const ownerRuntime = new Map(); // pedId -> owner task cache
const observerRuntime = new Map(); // pedId -> pose cache
const commandByPost = new Map(); // postId -> transient fast-path hint (source of truth = entity vars)
const ownerPoseUplinkAt = new Map(); // postId -> ts

function nowMs() {
    return Date.now();
}

function playSound(soundName, soundSet) {
    try { mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true); } catch {}
}

function sendControllerAck(postId, ver) {
    try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ver); } catch {}
}

function getPedId(ped) {
    return Number(ped && (ped.remoteId != null ? ped.remoteId : ped.id));
}

function isOwner(ped) {
    if (!ped || !ped.getVariable || !mp.players.local) return false;
    const ownerId = Number(ped.getVariable("streamOwnerId"));
    const localId = Number(mp.players.local.remoteId);
    return Number.isFinite(ownerId) && Number.isFinite(localId) && ownerId === localId;
}

function getPlayerByServerId(id) {
    if (!Number.isFinite(Number(id)) || Number(id) < 0) return null;
    const byRemote = mp.players.atRemoteId(Number(id));
    if (byRemote) return byRemote;
    let found = null;
    mp.players.forEach((p) => {
        if (found) return;
        if (Number(p.remoteId) === Number(id) || Number(p.id) === Number(id)) found = p;
    });
    return found;
}

function ensureWeapon(ped, weaponHash) {
    if (!ped || !weaponHash) return;
    try { ped.giveWeapon(weaponHash, 9999, true); } catch {}
    try { ped.setCurrentWeapon(weaponHash); } catch {}
    try { ped.setAmmo(weaponHash, 9999); } catch {}
    try { ped.setAmmoInClip(weaponHash, 9999); } catch {}
    try { ped.setInfiniteAmmo(true, weaponHash); } catch {}
    try { ped.setInfiniteAmmoClip(true); } catch {}
}

function shortestAngleDelta(from, to) {
    return ((to - from + 540) % 360) - 180;
}

function updateObserverPoseCache(ped) {
    const pedId = getPedId(ped);
    if (!Number.isFinite(pedId)) return;

    const x = Number(ped.getVariable("guardPoseX"));
    const y = Number(ped.getVariable("guardPoseY"));
    const z = Number(ped.getVariable("guardPoseZ"));
    const heading = Number(ped.getVariable("guardPoseHeading"));
    const updatedAt = Number(ped.getVariable("guardPoseUpdatedAt")) || nowMs();
    const velX = Number(ped.getVariable("guardVelX")) || 0;
    const velY = Number(ped.getVariable("guardVelY")) || 0;
    const velZ = Number(ped.getVariable("guardVelZ")) || 0;
    const moveState = String(ped.getVariable("guardMoveState") || "stationary");

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    const prev = observerRuntime.get(pedId);
    if (!prev) {
        observerRuntime.set(pedId, {
            prevPose: { x, y, z, heading, updatedAt, velX, velY, velZ, moveState },
            currPose: { x, y, z, heading, updatedAt, velX, velY, velZ, moveState },
            lastAppliedAt: nowMs(),
        });
        return;
    }

    if (Number(prev.currPose.updatedAt) === Number(updatedAt)) return;

    prev.prevPose = { ...prev.currPose };
    prev.currPose = { x, y, z, heading, updatedAt, velX, velY, velZ, moveState };
}

function renderObserverPose(ped) {
    const pedId = getPedId(ped);
    if (!Number.isFinite(pedId)) return;
    const rt = observerRuntime.get(pedId);
    if (!rt || !rt.currPose) return;

    const t = nowMs();
    const from = rt.prevPose || rt.currPose;
    const to = rt.currPose;

    const interval = Math.max(50, Number(to.updatedAt) - Number(from.updatedAt || to.updatedAt));
    const renderAt = t - POSE_BUFFER_DELAY_MS;
    let alpha = (renderAt - Number(from.updatedAt || renderAt)) / interval;
    alpha = Math.max(0, Math.min(1.3, alpha));

    let tx = from.x + (to.x - from.x) * Math.min(1, alpha);
    let ty = from.y + (to.y - from.y) * Math.min(1, alpha);
    let tz = from.z + (to.z - from.z) * Math.min(1, alpha);

    if (alpha > 1.0) {
        const extraMs = Math.min(MAX_EXTRAP_MS, (alpha - 1.0) * interval);
        tx += to.velX * (extraMs / 1000);
        ty += to.velY * (extraMs / 1000);
        tz += to.velZ * (extraMs / 1000);
    }

    const px = ped.position.x;
    const py = ped.position.y;
    const pz = ped.position.z;
    const dx = tx - px;
    const dy = ty - py;
    const dz = tz - pz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= HUGE_DESYNC) {
        try { ped.setCoordsNoOffset(tx, ty, tz, false, false, false); } catch {}
    } else if (dist >= MEDIUM_DESYNC) {
        try { ped.setCoordsNoOffset(px + dx * 0.55, py + dy * 0.55, pz + dz * 0.55, false, false, false); } catch {}
    } else if (dist >= NORMAL_DESYNC) {
        try { ped.setCoordsNoOffset(px + dx * 0.26, py + dy * 0.26, pz + dz * 0.26, false, false, false); } catch {}
    } else if (dist > TINY_DESYNC) {
        try { ped.setCoordsNoOffset(px + dx * 0.12, py + dy * 0.12, pz + dz * 0.12, false, false, false); } catch {}
    }

    const curHeading = Number(ped.getHeading ? ped.getHeading() : 0) || 0;
    const targetHeading = Number(to.heading) || curHeading;
    const hDelta = shortestAngleDelta(curHeading, targetHeading);
    const hFactor = dist >= MEDIUM_DESYNC ? 0.42 : 0.2;
    if (Math.abs(hDelta) > 0.2) {
        try { ped.setHeading(curHeading + hDelta * hFactor); } catch {}
    }
}

function applyOwnerCommand(ped, cmd, cache, now) {
    if (!ped || !cmd) return;
    const unit = (cmd.units || []).find((u) => Number(u.pedId) === Number(getPedId(ped)));
    if (unit && Number(unit.weaponHash) > 0) cache.weaponHash = Number(unit.weaponHash);

    const state = String(cmd.command || "idle");
    const targetId = Number(cmd.targetId);
    const stateChanged = cache.lastState !== state || cache.lastTargetId !== targetId || Number(cache.lastCtrlVer) !== Number(cmd.ctrlVer);

    if (state === "idle") {
        if (stateChanged && now - cache.lastClearAt > 700) {
            try { ped.clearTasks(); } catch {}
            try { ped.setKeepTask(false); } catch {}
            cache.lastClearAt = now;
        }
    } else if (state === "warning_aim") {
        const target = getPlayerByServerId(targetId);
        if (!target) return;
        ensureWeapon(ped, cache.weaponHash);
        if (stateChanged || now - cache.lastAimAt > 320) {
            try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, 600, false); } catch {
                try { ped.taskAimGunAt(target.handle, 600, false); } catch {}
            }
            cache.lastAimAt = now;
        }
    } else if (state === "attack") {
        const target = getPlayerByServerId(targetId);
        if (!target) return;
        ensureWeapon(ped, cache.weaponHash);
        if (stateChanged || now - cache.lastAimAt > 320) {
            try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, 520, false); } catch {}
            cache.lastAimAt = now;
        }
        if (stateChanged || now - cache.lastShootAt > 360) {
            try {
                mp.game.ai.taskShootAtEntity(ped.handle, target.handle, 520, mp.game.joaat("FIRING_PATTERN_FULL_AUTO"));
            } catch {
                try { ped.taskCombat(target.handle, 0, 16); } catch {}
            }
            try { ped.setKeepTask(true); } catch {}
            cache.lastShootAt = now;
        }
    } else if (state === "return") {
        const returnPos = unit ? {
            x: Number(unit.returnX || unit.x) || ped.position.x,
            y: Number(unit.returnY || unit.y) || ped.position.y,
            z: Number(unit.returnZ || unit.z) || ped.position.z,
            heading: Number(unit.returnHeading || unit.heading) || 0,
        } : null;
        if (!returnPos) return;

        const dx = returnPos.x - ped.position.x;
        const dy = returnPos.y - ped.position.y;
        const dz = returnPos.z - ped.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const progressed = dist < (cache.lastReturnDist || Number.MAX_SAFE_INTEGER) - 0.1;
        if (progressed) cache.lastReturnProgressAt = now;
        cache.lastReturnDist = dist;

        const stalled = now - (cache.lastReturnProgressAt || 0) > 1200;
        if (stateChanged || dist > 2.8 || stalled || now - cache.lastMoveAt > 1200) {
            try { ped.taskGoStraightToCoord(returnPos.x, returnPos.y, returnPos.z, 2.2, -1, returnPos.heading, 0.05); } catch {}
            cache.lastMoveAt = now;
        }
    }

    cache.lastState = state;
    cache.lastTargetId = targetId;
    cache.lastCtrlVer = Number(cmd.ctrlVer || 0);
}

function readAuthoritativeCommandFromPed(ped) {
    if (!ped || !ped.getVariable) return null;
    const postId = String(ped.getVariable("guardPostId") || "");
    if (!postId) return null;

    const state = String(ped.getVariable("guardCommand") || ped.getVariable("guardState") || "idle");
    const targetId = Number(ped.getVariable("guardCommandTargetId"));
    const ctrlVer = Number(ped.getVariable("guardCommandCtrlVer"));
    const actionSeq = Number(ped.getVariable("guardCommandSeq"));
    const weaponHash = Number(ped.getVariable("guardWeaponHash")) || 0;

    return {
        postId,
        command: state,
        targetId: Number.isFinite(targetId) ? targetId : -1,
        ctrlVer: Number.isFinite(ctrlVer) ? ctrlVer : 0,
        actionSeq: Number.isFinite(actionSeq) ? actionSeq : 0,
        units: [{
            pedId: getPedId(ped),
            weaponHash,
            returnX: Number(ped.getVariable("guardReturnX")) || ped.position.x,
            returnY: Number(ped.getVariable("guardReturnY")) || ped.position.y,
            returnZ: Number(ped.getVariable("guardReturnZ")) || ped.position.z,
            returnHeading: Number(ped.getVariable("guardReturnHeading")) || 0,
        }],
    };
}

function executeOwnerCommandNow(ped) {
    if (!ped || !ped.getVariable || !isOwner(ped)) return;
    const cmd = readAuthoritativeCommandFromPed(ped);
    if (!cmd) return;
    const pedId = getPedId(ped);
    if (!Number.isFinite(pedId)) return;
    const now = nowMs();
    const cache = ownerRuntime.get(pedId) || {
        lastState: "",
        lastTargetId: -1,
        lastCtrlVer: -1,
        lastAimAt: 0,
        lastShootAt: 0,
        lastMoveAt: 0,
        lastClearAt: 0,
        lastReturnDist: Number.MAX_SAFE_INTEGER,
        lastReturnProgressAt: now,
        weaponHash: Number(ped.getVariable("guardWeaponHash")) || 0,
    };
    applyOwnerCommand(ped, cmd, cache, now);
    ownerRuntime.set(pedId, cache);
}

function sendOwnerPoseUplink() {
    const grouped = new Map(); // postId -> { ctrlVer, units[] }
    const now = nowMs();

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            const postId = String(ped.getVariable("guardPostId") || "");
            if (!postId || !isOwner(ped)) return;
            const cmd = readAuthoritativeCommandFromPed(ped);
            if (!cmd) return;

            const lastSentAt = Number(ownerPoseUplinkAt.get(postId)) || 0;
            if (now - lastSentAt < POSE_UPLINK_MS) return;

            const pedId = getPedId(ped);
            if (!Number.isFinite(pedId)) return;

            const cache = ownerRuntime.get(pedId) || {};
            const pos = ped.position;
            const heading = Number(ped.getHeading ? ped.getHeading() : 0) || 0;
            const prev = cache.lastPoseSample || { x: pos.x, y: pos.y, z: pos.z, at: now };
            const dt = Math.max(0.05, (now - Number(prev.at || now)) / 1000);
            const velX = (Number(pos.x) - Number(prev.x || pos.x)) / dt;
            const velY = (Number(pos.y) - Number(prev.y || pos.y)) / dt;
            const velZ = (Number(pos.z) - Number(prev.z || pos.z)) / dt;
            const speed = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
            const moveState = speed > 0.08 ? "moving" : "stationary";

            cache.lastPoseSample = { x: pos.x, y: pos.y, z: pos.z, at: now };
            ownerRuntime.set(pedId, cache);

            if (!grouped.has(postId)) {
                grouped.set(postId, { ctrlVer: Number(cmd.ctrlVer || 0), units: [] });
            }
            grouped.get(postId).units.push({
                pedId,
                x: Number(pos.x) || 0,
                y: Number(pos.y) || 0,
                z: Number(pos.z) || 0,
                heading,
                velX,
                velY,
                velZ,
                moveState,
                poseUpdatedAt: now,
            });
        } catch {}
    });

    for (const [postId, data] of grouped.entries()) {
        ownerPoseUplinkAt.set(postId, now);
        try { mp.events.callRemote("guardCheckpoint:controller.pose", postId, Number(data.ctrlVer || 0), JSON.stringify(data.units || [])); } catch {}
    }
}

function processOwnerLoop() {
    const now = nowMs();
    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            const postId = ped.getVariable("guardPostId");
            if (!postId) return;
            if (!isOwner(ped)) return;

            const pedId = getPedId(ped);
            if (!Number.isFinite(pedId)) return;
            const authoritativeCmd = readAuthoritativeCommandFromPed(ped);
            if (!authoritativeCmd) return;
            const hinted = commandByPost.get(String(postId));
            const cmd = (hinted && Number(hinted.actionSeq || 0) >= Number(authoritativeCmd.actionSeq || 0))
                ? hinted
                : authoritativeCmd;
            if (!cmd) return;

            const cache = ownerRuntime.get(pedId) || {
                lastState: "",
                lastTargetId: -1,
                lastCtrlVer: -1,
                lastAimAt: 0,
                lastShootAt: 0,
                lastMoveAt: 0,
                lastClearAt: 0,
                lastReturnDist: Number.MAX_SAFE_INTEGER,
                lastReturnProgressAt: now,
                weaponHash: Number(ped.getVariable("guardWeaponHash")) || 0,
            };

            if (now - (cache.lastLoopAt || 0) < OWNER_LOOP_MS) {
                ownerRuntime.set(pedId, cache);
                return;
            }
            cache.lastLoopAt = now;

            applyOwnerCommand(ped, cmd, cache, now);
            ownerRuntime.set(pedId, cache);
        } catch {}
    });
}

function processObserverRender() {
    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            if (!ped.getVariable("guardPostId")) return;
            if (isOwner(ped)) return;
            updateObserverPoseCache(ped);
            const guardState = String(ped.getVariable("guardState") || "idle");
            if (guardState === "attack" || guardState === "warning_aim") {
                // В бою не делаем жёсткий chase, но поддерживаем heading + мягкий catch-up, чтобы анимация не "замирала".
                const pedId = getPedId(ped);
                const rt = observerRuntime.get(pedId);
                if (rt && rt.currPose) {
                    ensureWeapon(ped, Number(ped.getVariable("guardWeaponHash")) || 0);
                    const px = ped.position.x;
                    const py = ped.position.y;
                    const pz = ped.position.z;
                    const dx = rt.currPose.x - px;
                    const dy = rt.currPose.y - py;
                    const dz = rt.currPose.z - pz;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist >= HUGE_DESYNC) {
                        try { ped.setCoordsNoOffset(rt.currPose.x, rt.currPose.y, rt.currPose.z, false, false, false); } catch {}
                    } else if (dist >= NORMAL_DESYNC) {
                        try { ped.setCoordsNoOffset(px + dx * 0.4, py + dy * 0.4, pz + dz * 0.4, false, false, false); } catch {}
                    }

                    const curHeading = Number(ped.getHeading ? ped.getHeading() : 0) || 0;
                    const targetHeading = Number(rt.currPose.heading) || curHeading;
                    const hDelta = shortestAngleDelta(curHeading, targetHeading);
                    if (Math.abs(hDelta) > 0.15) {
                        try { ped.setHeading(curHeading + hDelta * 0.35); } catch {}
                    }
                }
            } else {
                ensureWeapon(ped, Number(ped.getVariable("guardWeaponHash")) || 0);
                renderObserverPose(ped);
            }
        } catch {}
    });
}

function clearPedCaches(entity) {
    if (!entity || entity.type !== "ped") return;
    if (!entity.getVariable || !entity.getVariable("guardPostId")) return;
    const pedId = getPedId(entity);
    if (Number.isFinite(pedId)) {
        ownerRuntime.delete(pedId);
        observerRuntime.delete(pedId);
    }
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
    },

    "guardCheckpoint:controller:switch": (postId, ver) => {
        sendControllerAck(postId, ver);
        setTimeout(() => sendControllerAck(postId, ver), 300);
    },

    "guardCheckpoint:controller:command": (payload) => {
        if (!payload || !payload.postId) return;
        commandByPost.set(String(payload.postId), payload);
    },
});

mp.events.add("entityStreamIn", (entity) => {
    if (!entity || entity.type !== "ped") return;
    if (!entity.getVariable || !entity.getVariable("guardPostId")) return;
    clearPedCaches(entity);
    updateObserverPoseCache(entity);
    executeOwnerCommandNow(entity);
});

mp.events.add("entityStreamOut", (entity) => {
    clearPedCaches(entity);
});

mp.events.addDataHandler("guardCommandSeq", (entity) => {
    if (!entity || entity.type !== "ped") return;
    if (!entity.getVariable || !entity.getVariable("guardPostId")) return;
    executeOwnerCommandNow(entity);
});

mp.events.add("render", () => {
    processOwnerLoop();
    sendOwnerPoseUplink();
    processObserverRender();

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

    if (!activeWarning) return;
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
