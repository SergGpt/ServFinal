"use strict";

const LOW_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const MID_SYMPTOM_INTERVAL_MS = 5 * 60 * 1000;
const HEAVY_EFFECT_MS = 30 * 1000;
const LOW_SYMPTOM_CHANCE = 0.45;
const EFFECT_NAME = 'DrugsDrivingIn';
const TIMECYCLE_NAME = 'drug_flying_base';
const TIMECYCLE_TICK_MS = 250;
const BITE_SLOW_MS = 45 * 1000;
const BITE_SLOW_MULTIPLIER = 0.82;
const INFECTION_SPEED_PENALTY_MAX = 0.22;
const RUN_SPRINT_MULTIPLIER_NATIVE = '0x6DB47AA77FD94E09';

const SYMPTOM_ANIMS = {
    mild: [
        { dict: 'move_m@_idles@shake_off', name: 'shakeoff_2', duration: 2500, flag: 48 },
        { dict: 'timetable@gardener@smoking_joint', name: 'idle_cough', duration: 3200, flag: 48 },
    ],
    heavy: [
        { dict: 'missprologueig_5@cough', name: 'walk', duration: 4500, flag: 49 },
        { dict: 'move_characters@trevor@cough_run', name: 'cough_run', duration: 4200, flag: 49 },
        { dict: 'weapons@pistol@injured', name: 'breathe_stand_add', duration: 5000, flag: 48 },
        { dict: 'move_m@_idles@shake_off', name: 'shakeoff_2', duration: 2800, flag: 48 },
    ],
};

let infection = 0;
let lowTimer = null;
let midTimer = null;
let effectStopTimer = null;
let effectFadeTimer = null;
let effectActiveUntil = 0;
let effectStrength = 0;
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

function pickAnim(type) {
    const list = SYMPTOM_ANIMS[type] || SYMPTOM_ANIMS.mild;
    return list[(Math.random() * list.length) | 0];
}

function playLocalAnim(type) {
    try {
        const player = mp.players.local;
        if (!player || player.vehicle) return;
        const anim = typeof type === 'string' ? pickAnim(type) : type;
        if (!anim || !loadAnimDict(anim.dict)) return;
        player.taskPlayAnim(anim.dict, anim.name, 8.0, -8.0, anim.duration, anim.flag, 0.0, false, false, false);
    } catch {}
}

function clearEffectFadeTimer() {
    if (effectFadeTimer) clearInterval(effectFadeTimer);
    effectFadeTimer = null;
}

function setTimecycleStrength(value) {
    effectStrength = Math.max(0, Math.min(1, value));
    try {
        if (effectStrength <= 0) {
            mp.game.graphics.clearTimecycleModifier();
            return;
        }
        mp.game.graphics.setTimecycleModifier(TIMECYCLE_NAME);
        mp.game.graphics.setTimecycleModifierStrength(effectStrength);
    } catch {}
}

function fadeTimecycleTo(target, duration, done = null) {
    clearEffectFadeTimer();
    const from = effectStrength;
    const to = Math.max(0, Math.min(1, target));
    const startedAt = Date.now();

    effectFadeTimer = setInterval(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / Math.max(1, duration));
        setTimecycleStrength(from + ((to - from) * progress));
        if (progress >= 1) {
            clearEffectFadeTimer();
            if (done) done();
        }
    }, TIMECYCLE_TICK_MS);
}

function stopHeavyEffect(smooth = true) {
    if (effectStopTimer) clearTimeout(effectStopTimer);
    effectStopTimer = null;
    effectActiveUntil = 0;

    const finish = () => {
        try { mp.game.graphics.stopScreenEffect(EFFECT_NAME); } catch {}
        try { mp.game.cam.stopGameplayCamShaking(true); } catch {}
    };

    if (smooth) fadeTimecycleTo(0, 3500, finish);
    else {
        clearEffectFadeTimer();
        setTimecycleStrength(0);
        finish();
    }
}

function playHeavySymptom(reason = 'symptom') {
    if (Date.now() < effectActiveUntil - 5000) return;

    if (effectStopTimer) clearTimeout(effectStopTimer);
    effectActiveUntil = Date.now() + HEAVY_EFFECT_MS;
    try { mp.game.graphics.startScreenEffect(EFFECT_NAME, HEAVY_EFFECT_MS + 5000, false); } catch {}
    try { mp.game.cam.shakeGameplayCam('DRUNK_SHAKE', infection >= 50 ? 0.58 : 0.36); } catch {}
    fadeTimecycleTo(infection >= 50 ? 0.75 : 0.5, 2500);
    playLocalAnim('heavy');
    effectStopTimer = setTimeout(() => stopHeavyEffect(true), HEAVY_EFFECT_MS);
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
            playLocalAnim('mild');
        }, LOW_SYMPTOM_INTERVAL_MS);
    }

    if (infection >= 25 && infection < 50) {
        midTimer = setInterval(() => {
            if (infection < 25 || infection >= 50) return;
            playHeavySymptom('mid');
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
        if (infection >= 25 && prev < 25) playHeavySymptom('threshold25');
        else if (infection >= 50 && prev < 50) playHeavySymptom('threshold50');
        if (infection <= 0) stopHeavyEffect(true);
    },
    'infection.symptom': (type, value) => {
        infection = Math.max(0, Math.min(100, Number(value) || infection || 0));
        mp.events.call('hud.setData', { infection });
        if (type === 'bite') {
            biteSlowUntil = Math.max(biteSlowUntil, Date.now() + BITE_SLOW_MS);
            playLocalAnim('heavy');
            if (infection >= 25) playHeavySymptom('bite');
            return;
        }
        if (type === 'zone') {
            if (infection >= 25 && Math.random() < 0.18) playHeavySymptom('zone');
            else if (infection >= 10 && Math.random() < 0.25) playLocalAnim('mild');
            return;
        }
        if (type === 'damage' || infection >= 25) playHeavySymptom(type || 'damage');
    },
    'characterInit.done': () => {
        refreshSymptomTimers();
    },
});
