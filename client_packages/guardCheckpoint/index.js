"use strict";

let activeWarning = null;
let lastSoundAt = 0;

function playSound(soundName, soundSet) {
    try {
        mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true);
    } catch (e) {
        // silent
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

        const now = Date.now();
        if (!lastSoundAt || now - lastSoundAt > 1000) {
            playSound(activeWarning.soundName, activeWarning.soundSet);
            lastSoundAt = now;
        }
    },

    "guardCheckpoint:warning:stop": (postId) => {
        if (!activeWarning) return;
        if (postId && activeWarning.postId && postId !== activeWarning.postId) return;
        activeWarning = null;
    },
});

mp.events.add("render", () => {
    if (!activeWarning) return;
    const now = Date.now();
    if (now - lastSoundAt > 3500) {
        playSound(activeWarning.soundName, activeWarning.soundSet);
        lastSoundAt = now;
    }

    mp.game.graphics.drawText(activeWarning.text, [0.5, 0.88], {
        font: 4,
        color: [255, 80, 80, 230],
        scale: [0.55, 0.55],
        centre: true,
        outline: true,
    });
});
