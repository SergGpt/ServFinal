"use strict";

let atmosphere = null;
let atmosphereFxTimer = null;
let atmosphereSoundTimer = null;
let cookingFxTimer = null;

function requestPtfx(asset) {
    mp.game.streaming.requestNamedPtfxAsset(asset);
    if (typeof mp.game.graphics.useParticleFxAssetNextCall === "function") {
        mp.game.graphics.useParticleFxAssetNextCall(asset);
    } else if (typeof mp.game.graphics.setPtfxAssetNextCall === "function") {
        mp.game.graphics.setPtfxAssetNextCall(asset);
    }
}

function spawnFx(effectName, pos, scale) {
    try {
        requestPtfx("core");
        mp.game.graphics.startParticleFxNonLoopedAtCoord(
            effectName,
            pos.x,
            pos.y,
            pos.z,
            0.0,
            0.0,
            0.0,
            scale,
            false,
            false,
            false
        );
    } catch (e) {}
}

function playWorldSound(soundName, soundSet, pos) {
    try {
        if (typeof mp.game.audio.playSoundFromCoord === 'function') {
            mp.game.audio.playSoundFromCoord(-1, soundName, pos.x, pos.y, pos.z, soundSet, false, 10, false);
        } else {
            mp.game.audio.playSoundFrontend(-1, soundName, soundSet, true);
        }
    } catch (e) {}
}

function clearAtmosphereTimers() {
    if (atmosphereFxTimer != null) clearInterval(atmosphereFxTimer);
    if (atmosphereSoundTimer != null) clearInterval(atmosphereSoundTimer);
    atmosphereFxTimer = null;
    atmosphereSoundTimer = null;
}

function clearCookingFx() {
    if (cookingFxTimer != null) clearInterval(cookingFxTimer);
    cookingFxTimer = null;
}

mp.crafting = {
    inside: false,
    point: null,
    atmosphere: null,

    setInside(flag, point) {
        this.inside = flag;
        this.point = flag ? point : null;
        if (!flag) this.close();
    },

    open(data) {
        mp.gui.cursor.show(true, true);
        mp.busy.add('crafting', true);
        mp.callCEFR('crafting.open', [data]);
    },

    close() {
        mp.gui.cursor.show(false, false);
        mp.busy.remove('crafting');
        mp.callCEFR('crafting.close', []);
    },

    progress(durationMs, point) {
        mp.callCEFR('crafting.progress', [durationMs]);
        this.startCookingFx(durationMs, point || this.atmosphere);
    },

    done(recipeId) {
        clearCookingFx();
        mp.callCEFR('crafting.done', [recipeId]);
    },

    startAtmosphere(point) {
        this.atmosphere = point;
        atmosphere = point;
        clearAtmosphereTimers();
        if (!point) return;

        const base = new mp.Vector3(point.x, point.y, point.z);
        atmosphereFxTimer = setInterval(() => {
            spawnFx('ent_amb_smoke_general', new mp.Vector3(base.x - 1.2, base.y - 0.15, base.z + 0.15), 0.45);
            if (Math.random() > 0.58) spawnFx('ent_amb_elec_crackle', new mp.Vector3(base.x + 0.35, base.y - 1.05, base.z + 0.55), 0.28);
            if (Math.random() > 0.7) spawnFx('ent_ray_pro1_sparks', new mp.Vector3(base.x + 1.35, base.y + 0.54, base.z + 0.35), 0.18);
        }, 1300);

        atmosphereSoundTimer = setInterval(() => {
            if (Math.random() > 0.45) playWorldSound('Fire', 'DLC_HEISTS_GENERIC_SOUNDS', base);
            if (Math.random() > 0.72) playWorldSound('Generator', 'DLC_HEISTS_GENERIC_SOUNDS', base);
        }, 3600);
    },

    stopAtmosphere() {
        clearAtmosphereTimers();
        clearCookingFx();
        atmosphere = null;
        this.atmosphere = null;
    },

    startCookingFx(durationMs = 4500, point) {
        clearCookingFx();
        if (!point) return;

        const base = new mp.Vector3(point.x, point.y, point.z);
        const endAt = Date.now() + durationMs;
        cookingFxTimer = setInterval(() => {
            if (Date.now() >= endAt) return clearCookingFx();
            spawnFx('ent_amb_smoke_foundry', new mp.Vector3(base.x - 0.28, base.y + 0.06, base.z + 0.72), 0.35);
            if (Math.random() > 0.5) spawnFx('ent_ray_pro1_sparks', new mp.Vector3(base.x - 0.55, base.y - 0.42, base.z + 0.44), 0.16);
            if (Math.random() > 0.62) playWorldSound('Beep_Red', 'DLC_HEIST_HACKING_SNAKE_SOUNDS', base);
        }, 450);
    }
};

mp.keys.bind(69, true, () => {
    if (!mp.crafting.inside) return;
    if (mp.busy.includes('crafting')) return;
    mp.events.callRemote('crafting.open');
});

mp.events.add('crafting.enter', (flag, point) => mp.crafting.setInside(flag, point));
mp.events.add('crafting.open', (data) => mp.crafting.open(data));
mp.events.add('crafting.close', () => mp.crafting.close());
mp.events.add('crafting.progress', (durationMs, point) => mp.crafting.progress(durationMs, point));
mp.events.add('crafting.done', (recipeId) => mp.crafting.done(recipeId));
mp.events.add('crafting.atmosphere.start', (point) => mp.crafting.startAtmosphere(point));
mp.events.add('crafting.atmosphere.stop', () => mp.crafting.stopAtmosphere());

mp.events.add('render', () => {
    if (!atmosphere) return;
    const color = atmosphere.color || [255, 178, 82];
    const flicker = 0.72 + Math.sin(Date.now() / 180) * 0.16 + Math.random() * 0.08;
    try {
        mp.game.graphics.drawLightWithRange(
            atmosphere.x - 0.9,
            atmosphere.y - 0.25,
            atmosphere.z + 0.75,
            color[0],
            color[1],
            color[2],
            5.5,
            flicker
        );
        mp.game.graphics.drawLightWithRange(
            atmosphere.x + 0.1,
            atmosphere.y - 1.15,
            atmosphere.z + 1.25,
            178,
            152,
            82,
            3.4,
            flicker * 0.55
        );
    } catch (e) {}
});
