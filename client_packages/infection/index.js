"use strict";

const LOW_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const MID_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const HEAVY_EFFECT_MS = 30 * 1000;
const LOW_SYMPTOM_CHANCE = 0.45;
const EFFECT_NAME = 'DrugsDrivingIn';
const LOW_ANIM = { dict: 'move_m@_idles@shake_off', name: 'shakeoff_2', duration: 2500, flag: 48 };
const SEIZURE_ANIM = { dict: 'combat@damage@writhe', name: 'writhe_loop', duration: HEAVY_EFFECT_MS, flag: 1 };

let infection = 0;
let lowTimer = null;
let midTimer = null;
let effectStopTimer = null;

function loadAnimDict(dict) {
    try {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) return true;
        mp.game.streaming.requestAnimDict(dict);
        let i = 0;
        while (!mp.game.streaming.hasAnimDictLoaded(dict) && i++ < 80) mp.game.wait(0);
        return mp.game.streaming.hasAnimDictLoaded(dict);
    } catch {}
    return false;
}

function playLocalAnim(anim) {
    try {
        const player = mp.players.local;
        if (!player || player.vehicle) return;
        if (!loadAnimDict(anim.dict)) return;
        player.taskPlayAnim(anim.dict, anim.name, 8.0, -8.0, anim.duration, anim.flag, 0.0, false, false, false);
    } catch {}
}

function stopHeavyEffect() {
    try { mp.game.graphics.stopScreenEffect(EFFECT_NAME); } catch {}
    try { mp.game.cam.stopGameplayCamShaking(true); } catch {}
    if (effectStopTimer) clearTimeout(effectStopTimer);
    effectStopTimer = null;
}

function playHeavySymptom() {
    stopHeavyEffect();
    try { mp.game.graphics.startScreenEffect(EFFECT_NAME, HEAVY_EFFECT_MS, false); } catch {}
    try { mp.game.cam.shakeGameplayCam('DRUNK_SHAKE', infection >= 50 ? 0.75 : 0.45); } catch {}
    playLocalAnim(SEIZURE_ANIM);
    effectStopTimer = setTimeout(stopHeavyEffect, HEAVY_EFFECT_MS);
}

function clearSymptomTimers() {
    if (lowTimer) clearInterval(lowTimer);
    if (midTimer) clearInterval(midTimer);
    lowTimer = null;
    midTimer = null;
}

function refreshSymptomTimers() {
    clearSymptomTimers();

    if (infection >= 10 && infection < 25) {
        lowTimer = setInterval(() => {
            if (infection < 10 || infection >= 25) return;
            if (Math.random() > LOW_SYMPTOM_CHANCE) return;
            playLocalAnim(LOW_ANIM);
        }, LOW_SYMPTOM_INTERVAL_MS);
    }

    if (infection >= 25 && infection < 50) {
        midTimer = setInterval(() => {
            if (infection < 25 || infection >= 50) return;
            playHeavySymptom();
        }, MID_SYMPTOM_INTERVAL_MS);
    }
}

mp.events.add({
    'infection.update': (value) => {
        const next = Math.max(0, Math.min(100, Number(value) || 0));
        const prev = infection;
        if (next === infection) return;
        infection = next;
        mp.events.call('hud.setData', { infection });
        refreshSymptomTimers();
        if (infection >= 25 && prev < 25) playHeavySymptom();
        else if (infection >= 50 && prev < 50) playHeavySymptom();
    },
    'infection.symptom': (type, value) => {
        infection = Math.max(0, Math.min(100, Number(value) || infection || 0));
        mp.events.call('hud.setData', { infection });
        if (type === 'damage' || infection >= 25) playHeavySymptom();
    },
    'characterInit.done': () => {
        refreshSymptomTimers();
    },
});
