"use strict";

const LOW_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const MID_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const HEAVY_EFFECT_MS = 60 * 1000;
const LOW_SYMPTOM_CHANCE = 0.45;
const EFFECT_NAME = 'DrugsDrivingIn';
const BITE_SLOW_MS = 45 * 1000;
const BITE_SLOW_MULTIPLIER = 0.82;
const INFECTION_SPEED_PENALTY_MAX = 0.22;
const RUN_SPRINT_MULTIPLIER_NATIVE = '0x6DB47AA77FD94E09';

const COUGH_ANIM = {
    dict: 'timetable@gardener@smoking_joint',
    name: 'idle_cough',
    duration: 3200,
    flag: 48,
};

let infection = 0;
let lowTimer = null;
let midTimer = null;
let effectStopTimer = null;
let biteSlowUntil = 0;
let lastSpeedMultiplier = 1.0;

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

function playLocalAnim() {
    try {
        const player = mp.players.local;
        if (!player || player.vehicle) return;
        if (!loadAnimDict(COUGH_ANIM.dict)) return;
        player.taskPlayAnim(
            COUGH_ANIM.dict,
            COUGH_ANIM.name,
            8.0,
            -8.0,
            COUGH_ANIM.duration,
            COUGH_ANIM.flag,
            0.0,
            false,
            false,
            false
        );
    } catch {}
}

function stopHeavyEffect() {
    if (effectStopTimer) clearTimeout(effectStopTimer);
    effectStopTimer = null;
    try { mp.game.graphics.stopScreenEffect(EFFECT_NAME); } catch {}
    try { mp.game.cam.stopGameplayCamShaking(true); } catch {}
}

function playHeavySymptom() {
    stopHeavyEffect();
    try { mp.game.graphics.startScreenEffect(EFFECT_NAME, HEAVY_EFFECT_MS, false); } catch {}
    try { mp.game.cam.shakeGameplayCam('DRUNK_SHAKE', infection >= 50 ? 0.75 : 0.45); } catch {}
    playLocalAnim();
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
            playLocalAnim();
        }, LOW_SYMPTOM_INTERVAL_MS);
    }

    if (infection >= 25 && infection < 50) {
        midTimer = setInterval(() => {
            if (infection < 25 || infection >= 50) return;
            playHeavySymptom();
        }, MID_SYMPTOM_INTERVAL_MS);
    }
}

function setRunSprintMultiplier(multiplier) {
    try { mp.game.invoke(RUN_SPRINT_MULTIPLIER_NATIVE, mp.game.player.playerId(), multiplier); } catch {}
}

function getInfectionSpeedMultiplier() {
    const levelPenalty = Math.min(INFECTION_SPEED_PENALTY_MAX, (Math.max(0, infection - 25) / 75) * INFECTION_SPEED_PENALTY_MAX);
    const bitePenalty = Date.now() < biteSlowUntil ? (1 - BITE_SLOW_MULTIPLIER) : 0;
    return Math.max(0.65, 1 - levelPenalty - bitePenalty);
}

mp.events.add('render', () => {
    const multiplier = getInfectionSpeedMultiplier();
    if (Math.abs(multiplier - lastSpeedMultiplier) < 0.01) return;
    lastSpeedMultiplier = multiplier;
    setRunSprintMultiplier(multiplier);
});

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
        if (infection <= 0) stopHeavyEffect();
    },
    'infection.symptom': (type, value) => {
        infection = Math.max(0, Math.min(100, Number(value) || infection || 0));
        mp.events.call('hud.setData', { infection });
        if (type === 'bite') {
            biteSlowUntil = Math.max(biteSlowUntil, Date.now() + BITE_SLOW_MS);
            playLocalAnim();
            if (infection >= 25) playHeavySymptom();
            return;
        }
        if (type === 'zone') {
            if (infection >= 25 && Math.random() < 0.18) playHeavySymptom();
            else if (infection >= 10 && Math.random() < 0.25) playLocalAnim();
            return;
        }
        if (type === 'damage' || infection >= 25) playHeavySymptom();
    },
    'characterInit.done': () => {
        refreshSymptomTimers();
    },
});
