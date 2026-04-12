"use strict";

let activeWarning = null;
let lastSoundAt = 0;
let lastRenderDebugAt = 0;
let activeStopZone = null;
let statusText = null;
let statusUntil = 0;
const DEBUG_AIM_LINES = false;

function clog(text) {
    try {
        console.log(`[GUARD-CHECKPOINT][CLIENT] ${text}`);
    } catch {}
}

function playSound(soundName, soundSet) {
    try {
        mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true);
    } catch (e) {
        // silent
    }
}

function getPlayerByServerId(serverId) {
    if (serverId == null || serverId < 0) return null;
    const byRemoteId = mp.players.atRemoteId(Number(serverId));
    if (byRemoteId) return byRemoteId;

    let found = null;
    mp.players.forEach((p) => {
        if (found) return;
        if (Number(p.remoteId) === Number(serverId) || Number(p.id) === Number(serverId)) found = p;
    });
    return found;
}

function applyNpcCommand(command, targetId, units) {
    const target = targetId >= 0 ? getPlayerByServerId(targetId) : null;
    (units || []).forEach((u) => {
        const ped = mp.peds.atRemoteId(u.pedId);
        if (!ped) return;
        try {
            if (u.weaponHash) {
                try { ped.giveWeapon(u.weaponHash, 9999, true); } catch (e) {}
                try { ped.setCurrentWeapon(u.weaponHash); } catch (e) {}
                try { ped.setAmmo(u.weaponHash, 9999); } catch (e) {}
                try { ped.setAmmoInClip(u.weaponHash, 9999); } catch (e) {}
                try { ped.setInfiniteAmmo(true, u.weaponHash); } catch (e) {}
                try { ped.setInfiniteAmmoClip(true); } catch (e) {}
            }
            if (command === "aim" && target) {
                ped.clearTasks();
                ped.taskAimGunAt(target.handle, 1200, false);
            } else if (command === "fire" && target) {
                ped.taskCombat(target.handle, 0, 16);
                try { ped.setKeepTask(true); } catch (e) {}
            } else if (command === "return") {
                ped.clearTasks();
                ped.taskGoStraightToCoord(u.x, u.y, u.z, 2.2, -1, u.heading, 0.05);
            }
        } catch (e) {}
    });
}

mp.events.add({
    "guardCheckpoint:warning:start": (data) => {
        clog(`warning:start post=${data.postId} target=${data.targetId} owner=${data.ownerId} text="${data.text}"`);
        activeWarning = {
            postId: data.postId,
            text: data.text || "Остановитесь",
            soundName: data.soundName || "5s",
            soundSet: data.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
        };
        activeStopZone = data.stopZone || null;

        const now = Date.now();
        if (!lastSoundAt || now - lastSoundAt > 1000) {
            playSound(activeWarning.soundName, activeWarning.soundSet);
            lastSoundAt = now;
        }
    },

    "guardCheckpoint:warning:stop": (postId) => {
        clog(`warning:stop post=${postId}`);
        if (!activeWarning) return;
        if (postId && activeWarning.postId && postId !== activeWarning.postId) return;
        activeWarning = null;
        activeStopZone = null;
    },

    "guardCheckpoint:debug": (text) => {
        clog(`server-debug: ${text}`);
    },

    "guardCheckpoint:status:text": (postId, text, durationMs) => {
        statusText = String(text || "");
        statusUntil = Date.now() + Math.max(1000, Number(durationMs) || 3000);
        clog(`status post=${postId} text="${statusText}"`);
    },

    "guardCheckpoint:npcCommand": (postId, command, targetId, units, streamOwnerId) => {
        const localId = mp.players.local ? Number(mp.players.local.remoteId) : null;
        const ownerId = streamOwnerId == null ? null : Number(streamOwnerId);
        const isStreamOwner = ownerId != null && localId === ownerId;
        clog(`npcCommand post=${postId} cmd=${command} target=${targetId} units=${(units || []).length} owner=${ownerId} local=${localId} run=${isStreamOwner}`);
        if (!isStreamOwner) return;
        applyNpcCommand(command, targetId, units);
    },
});

mp.events.add("entityStreamIn", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const postId = entity.getVariable ? entity.getVariable("guardPostId") : null;
    if (!postId) return;
    clog(`ped stream IN post=${postId} npc=${entity.getVariable("guardNpcId")} role=${entity.getVariable("guardRole")} state=${entity.getVariable("guardState")}`);
});

mp.events.add("entityStreamOut", (entity) => {
    if (!entity || entity.type !== "ped") return;
    const postId = entity.getVariable ? entity.getVariable("guardPostId") : null;
    if (!postId) return;
    clog(`ped stream OUT post=${postId} npc=${entity.getVariable("guardNpcId")} role=${entity.getVariable("guardRole")} state=${entity.getVariable("guardState")}`);
});

mp.events.add("render", () => {
    if (statusText && Date.now() < statusUntil) {
        mp.game.graphics.drawText(statusText, [0.5, 0.84], {
            font: 4,
            color: [120, 255, 120, 230],
            scale: [0.45, 0.45],
            centre: true,
            outline: true,
        });
    } else if (statusText && Date.now() >= statusUntil) {
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
            } catch (e) {}
        });
    }

    if (!activeWarning) return;
    if (Date.now() - lastRenderDebugAt > 2000) {
        lastRenderDebugAt = Date.now();
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
    } else if (type === "polygon" && Array.isArray(activeStopZone.points)) {
        activeStopZone.points.forEach((p) => {
            mp.game.graphics.drawMarker(
                1,
                p.x,
                p.y,
                p.z - 1.0,
                0,
                0,
                0,
                0,
                0,
                0,
                0.8,
                0.8,
                0.6,
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
        });
    }
});
