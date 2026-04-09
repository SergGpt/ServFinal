"use strict";

let activeWarning = null;
let lastSoundAt = 0;
let lastRenderDebugAt = 0;

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

mp.events.add({
    "guardCheckpoint:warning:start": (data) => {
        clog(`warning:start post=${data.postId} text="${data.text}"`);
        activeWarning = {
            postId: data.postId,
            text: data.text || "Остановитесь",
            soundName: data.soundName || "5s",
            soundSet: data.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
        };

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
    },

    "guardCheckpoint:debug": (text) => {
        clog(`server-debug: ${text}`);
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
    if (!activeWarning) return;
    const now = Date.now();
    if (now - lastSoundAt > 3500) {
        playSound(activeWarning.soundName, activeWarning.soundSet);
        lastSoundAt = now;
    }

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
});
