"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;

const OWNER_REFRESH_MS = 1200;
let lastOwnerTickAt = 0;

const guardRuntime = new Map(); // pedRemoteId -> { cmd, targetId, at, lastExecAt, returnPos, weaponHash, role }

function nowMs() { return Date.now(); }

function clog(text) {
    try { console.log(`[GUARD-CHECKPOINT][CLIENT] ${text}`); } catch {}
}

function playSound(soundName, soundSet) {
    try { mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true); } catch {}
}

function getPedRemoteId(ped) {
    return Number(ped && (ped.remoteId != null ? ped.remoteId : ped.id));
}

function isControllerPed(ped) {
    if (!ped || !ped.getVariable || !mp.players.local) return false;
    const rid = Number(ped.getVariable("controllerRid"));
    return Number.isFinite(rid) && rid === Number(mp.players.local.remoteId);
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

function ensurePedWeapon(ped, weaponHash) {
    if (!ped || !weaponHash) return;
    try { ped.giveWeapon(weaponHash, 9999, true); } catch {}
    try { ped.setCurrentWeapon(weaponHash); } catch {}
    try { ped.setAmmo(weaponHash, 9999); } catch {}
    try { ped.setAmmoInClip(weaponHash, 9999); } catch {}
    try { ped.setInfiniteAmmo(true, weaponHash); } catch {}
    try { ped.setInfiniteAmmoClip(true); } catch {}
}

function executeCommandForPed(ped, data, force = false, authoritative = true) {
    if (!ped || !ped.getVariable || !data) return;
    if (authoritative && !isControllerPed(ped)) return;

    const t = nowMs();
    if (!force && t - (data.lastExecAt || 0) < 250) return;

    const command = String(data.cmd || "idle");
    const target = getPlayerByServerId(data.targetId);

    if (Number(data.weaponHash) > 0) ensurePedWeapon(ped, Number(data.weaponHash));

    try {
        switch (command) {
            case "attack":
                if (!target) break;
                try { ped.clearTasks(); } catch {}
                try { mp.game.ai.taskCombatPed(ped.handle, target.handle, 0, 16); } catch {
                    try { ped.taskCombat(target.handle, 0, 16); } catch {}
                }
                try { ped.setKeepTask(true); } catch {}
                break;
            case "warning":
            case "checking":
                if (!target) break;
                try { ped.clearTasks(); } catch {}
                try { mp.game.ai.taskAimGunAtEntity(ped.handle, target.handle, OWNER_REFRESH_MS + 250, false); } catch {
                    try { ped.taskAimGunAt(target.handle, OWNER_REFRESH_MS + 250, false); } catch {}
                }
                try { ped.setKeepTask(true); } catch {}
                break;
            case "return": {
                const rp = data.returnPos || {
                    x: Number(ped.getVariable("guardReturnX")) || ped.position.x,
                    y: Number(ped.getVariable("guardReturnY")) || ped.position.y,
                    z: Number(ped.getVariable("guardReturnZ")) || ped.position.z,
                    heading: Number(ped.getVariable("guardReturnHeading")) || 0,
                };
                data.returnPos = rp;
                try { ped.taskGoStraightToCoord(rp.x, rp.y, rp.z, 2.2, -1, rp.heading || 0, 0.05); } catch {}
                break;
            }
            default:
                try { ped.clearTasks(); } catch {}
                try { ped.taskStandStill(1000); } catch {}
                try { ped.setKeepTask(false); } catch {}
                break;
        }
    } catch {}

    data.lastExecAt = t;
}

function sendControllerAck(postId, ver) {
    try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ver); } catch {}
}

function runCommandRefreshLoop() {
    const t = nowMs();
    if (t - lastOwnerTickAt < OWNER_REFRESH_MS) return;
    lastOwnerTickAt = t;

    const postsHeartbeat = new Map();

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !ped.getVariable) return;
            if (!ped.getVariable("guardPostId")) return;

            const pedId = getPedRemoteId(ped);
            const state = guardRuntime.get(pedId);
            if (!state) return;

            const isOwnerRole = state.role === "owner";
            const isController = isControllerPed(ped);
            if (isOwnerRole && isController) {
                executeCommandForPed(ped, state, false, true);
                const postId = String(ped.getVariable("guardPostId") || "");
                const ver = Number(ped.getVariable("ctrlVer")) || 0;
                if (postId) postsHeartbeat.set(postId, ver);
                return;
            }

            if (!isOwnerRole && !isController) {
                executeCommandForPed(ped, state, false, false);
            }
        } catch {}
    });

    postsHeartbeat.forEach((ver, postId) => {
        try { mp.events.callRemote("guardCheckpoint:controller.heartbeat", postId, ver); } catch {}
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

    "guardCheckpoint:controller:switch": (postId, ver) => {
        sendControllerAck(postId, ver);
        setTimeout(() => sendControllerAck(postId, ver), 300);
    },

    "guardCheckpoint:executeCommand": (payload) => {
        const dataPayload = payload && typeof payload === "object" ? payload : {};
        const postId = String(dataPayload.postId || "");
        const command = String(dataPayload.command || "idle");
        const targetId = Number(dataPayload.targetId);
        const commandVer = Number(dataPayload.cmdVer) || nowMs();
        const role = String(dataPayload.role || "observer");
        const units = Array.isArray(dataPayload.units) ? dataPayload.units : [];

        const hints = new Map();
        units.forEach((u) => {
            const pedId = Number(u && u.pedId);
            if (!Number.isFinite(pedId)) return;
            hints.set(pedId, u);
        });

        mp.peds.forEach((ped) => {
            try {
                if (!ped || !ped.getVariable) return;
                if (String(ped.getVariable("guardPostId") || "") !== postId) return;

                const pedId = getPedRemoteId(ped);
                if (!Number.isFinite(pedId)) return;
                const hint = hints.get(pedId) || {};
                const state = guardRuntime.get(pedId) || {};
                state.cmd = command;
                state.targetId = targetId;
                state.at = commandVer;
                state.role = role;
                state.weaponHash = Number(hint.weaponHash) || Number(ped.getVariable("guardWeaponHash")) || 0;
                const hRet = hint.returnPos || {};
                state.returnPos = {
                    x: Number(hRet.x) || Number(ped.getVariable("guardReturnX")) || ped.position.x,
                    y: Number(hRet.y) || Number(ped.getVariable("guardReturnY")) || ped.position.y,
                    z: Number(hRet.z) || Number(ped.getVariable("guardReturnZ")) || ped.position.z,
                    heading: Number(hRet.heading) || Number(ped.getVariable("guardReturnHeading")) || 0,
                };
                guardRuntime.set(pedId, state);

                const authoritative = role === "owner";
                executeCommandForPed(ped, state, true, authoritative);
            } catch {}
        });
    },

    "guardCheckpoint:debug": (text) => {
        clog(`server-debug: ${text}`);
    },
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const pedId = getPedRemoteId(entity);
    if (Number.isFinite(pedId)) guardRuntime.delete(pedId);
});

mp.events.add("render", () => {
    runCommandRefreshLoop();

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
