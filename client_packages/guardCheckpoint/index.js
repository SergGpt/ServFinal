"use strict";

let activeWarning = null;
let activeStopZone = null;
let lastSoundAt = 0;
let statusText = null;
let statusUntil = 0;

const REFRESH_MS = 500;
let lastRefreshAt = 0;

const runtimeByNpc = new Map(); // npcId -> runtime

function nowMs() { return Date.now(); }

function playSound(soundName, soundSet) {
    try { mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true); } catch {}
}

function getPedRemoteId(ped) {
    return Number(ped && (ped.remoteId != null ? ped.remoteId : ped.id));
}

function isControllerPedByRid(controllerRid) {
    if (!mp.players.local) return false;
    return Number(controllerRid) === Number(mp.players.local.remoteId);
}

function findPedByNpcId(npcId) {
    let found = null;
    mp.peds.forEach((ped) => {
        if (found) return;
        try {
            if (!ped || !ped.getVariable) return;
            if (String(ped.getVariable("guardNpcId") || "") === String(npcId)) found = ped;
        } catch {}
    });
    return found;
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

function executeNpcRuntime(rt, force = false) {
    if (!rt) return;
    const ped = (Number(rt.pedId) >= 0 ? mp.peds.atRemoteId(Number(rt.pedId)) : null) || findPedByNpcId(rt.npcId);
    if (!ped || !ped.getVariable) return;

    const isOwnerRole = String(rt.role) === "owner";
    const isController = isControllerPedByRid(rt.controllerRid);
    const authoritative = isOwnerRole && isController;
    const observer = !isOwnerRole && !isController;
    if (!authoritative && !observer) return;

    const t = nowMs();
    if (!force && t - (Number(rt.lastExecAt) || 0) < REFRESH_MS) return;

    const command = String(rt.command || "idle");
    const target = getPlayerByServerId(rt.targetId);

    if (Number(rt.weaponHash) > 0) ensurePedWeapon(ped, Number(rt.weaponHash));

    if (command === "dead" || rt.dead || rt.alive === false) {
        try { ped.clearTasksImmediately(); } catch {}
        try { ped.setKeepTask(false); } catch {}
        try { ped.setHealth(0); } catch {}
        try { mp.game.ped.setPedToRagdoll(ped.handle, 5000, 5000, 0, false, false, false); } catch {}
        rt.lastExecAt = t;
        return;
    }

    switch (command) {
        case "followTarget": {
            if (!target) break;
            const targetPos = target.position;
            try { ped.taskFollowToOffsetOfEntity(target.handle, 0, 0, 0, Number(rt.speed) || 1.7, 2000, Number(rt.stopDistance) || 1.6, true); } catch {}
            try { ped.taskGoToCoordAnyMeans(targetPos.x, targetPos.y, targetPos.z, Number(rt.speed) || 1.7, 0, false, 0, 0.0); } catch {}
            try { ped.setKeepTask(true); } catch {}
            break;
        }
        case "attackTarget": {
            if (!target) break;
            try { ped.clearTasks(); } catch {}
            try { mp.game.ai.taskCombatPed(ped.handle, target.handle, 0, 16); } catch {
                try { ped.taskCombat(target.handle, 0, 16); } catch {}
            }
            try { ped.setKeepTask(true); } catch {}
            break;
        }
        case "returnPost": {
            const rp = rt.returnPost || {};
            try { ped.taskGoStraightToCoord(Number(rp.x) || ped.position.x, Number(rp.y) || ped.position.y, Number(rp.z) || ped.position.z, 2.2, -1, Number(rp.heading) || 0, 0.05); } catch {}
            try { ped.setKeepTask(true); } catch {}
            break;
        }
        default:
            try { ped.clearTasks(); } catch {}
            try { ped.taskStandStill(1000); } catch {}
            try { ped.setKeepTask(false); } catch {}
            break;
    }

    rt.lastExecAt = t;
    rt.pedId = getPedRemoteId(ped);
}

function sendControllerAck(postId, ver) {
    try { mp.events.callRemote("guardCheckpoint:controller.ack", postId, ver); } catch {}
}

function sendOwnerHeartbeats() {
    const posts = new Map();
    runtimeByNpc.forEach((rt) => {
        if (!rt) return;
        if (String(rt.role) !== "owner") return;
        if (!isControllerPedByRid(rt.controllerRid)) return;
        posts.set(String(rt.postId), Number(rt.ctrlVer) || 0);
    });

    posts.forEach((ver, postId) => {
        try { mp.events.callRemote("guardCheckpoint:controller.heartbeat", postId, ver); } catch {}
    });
}

function runRuntimeRefresh() {
    const t = nowMs();
    if (t - lastRefreshAt < REFRESH_MS) return;
    lastRefreshAt = t;

    runtimeByNpc.forEach((rt) => executeNpcRuntime(rt, false));
    sendOwnerHeartbeats();
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

    "guardCheckpoint:executeCommand": (payload) => {
        const p = payload && typeof payload === "object" ? payload : {};
        const postId = String(p.postId || "");
        const role = String(p.role || "observer");
        const controllerRid = Number(p.controllerRid) || -1;
        const ctrlVer = Number(p.ctrlVer) || 0;
        const cmdVer = Number(p.cmdVer) || nowMs();
        const units = Array.isArray(p.units) ? p.units : [];

        units.forEach((u) => {
            const npcId = String(u && u.npcId || "");
            if (!npcId) return;
            const rt = runtimeByNpc.get(npcId) || {};
            rt.postId = postId;
            rt.role = role;
            rt.controllerRid = controllerRid;
            rt.ctrlVer = ctrlVer;
            rt.cmdVer = cmdVer;
            rt.pedId = Number(u.pedId);
            rt.npcId = npcId;
            rt.command = String(u.command || p.command || "idle");
            rt.targetId = Number(u.targetId);
            rt.weaponHash = Number(u.weaponHash) || 0;
            rt.returnPost = u.returnPost || null;
            rt.alive = !!u.alive;
            rt.dead = !!u.dead;
            rt.deathTs = Number(u.deathTs) || 0;
            rt.speed = Number(u.speed) || 1.7;
            rt.stopDistance = Number(u.stopDistance) || 1.6;
            runtimeByNpc.set(npcId, rt);
            executeNpcRuntime(rt, true);
        });
    },
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const rid = getPedRemoteId(entity);
    runtimeByNpc.forEach((rt, npcId) => {
        if (Number(rt.pedId) === Number(rid)) rt.pedId = -1;
    });
});

mp.events.add("render", () => {
    runRuntimeRefresh();

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
