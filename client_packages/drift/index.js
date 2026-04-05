"use strict";

const LOCAL_KEY = 0x45;
const busyName = 'driftSetup';

const state = {
    isNearWorkshop: false,
    uiOpen: false,
    currentVehicleSetup: null,
    appliedVehicleId: null,
    activeSetup: null,
    driftHoldUntil: 0,
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function getCurrentVehicle() {
    const player = mp.players.local;
    if (!player || !player.vehicle) return null;
    const vehicle = player.vehicle;
    if (vehicle.getPedInSeat(-1) !== player.handle) return null;
    return vehicle;
}

function resetVehicleModifiers() {
    const vehicle = getCurrentVehicle();
    state.activeSetup = null;
    state.driftHoldUntil = 0;
    if (!vehicle) return;
    vehicle.setEnginePowerMultiplier(0);
    vehicle.setEngineTorqueMultiplier(1);
    vehicle.setReduceGrip(false);
}

function applyVehicleSetup(setup) {
    state.activeSetup = setup || null;
    const vehicle = getCurrentVehicle();
    if (!vehicle || !setup) return;

    const s = setup;
    const rearGrip = safeNumber(s.rearGrip, 0.86);
    const entryAggression = safeNumber(s.steeringAngle, 39);
    const handbrakePower = safeNumber(s.handbrakePower, 1);
    const driveBias = safeNumber(s.driveBias, 1.0);
    const suspensionRaise = safeNumber(s.suspensionRaise, 0.0);
    const suspensionForce = safeNumber(s.suspensionForce, 2.1);

    // База под стиль "JDM/Mark II": минимум вмешательства в руль, только легче сорвать заднюю ось.
    const gripDelta = clamp(0.86 - rearGrip, -0.12, 0.14);
    const powerBoost = (gripDelta * 6.8) + ((entryAggression - 39) * 0.07) + ((handbrakePower - 1) * 1.25) + ((driveBias - 0.5) * 0.75);
    vehicle.setEnginePowerMultiplier(clamp(powerBoost, -2, 15));
    vehicle.setEngineTorqueMultiplier(clamp(1 + (powerBoost / 35), 0.95, 1.25));
    vehicle.setReduceGrip(false);
    try { vehicle.setHandling('fSuspensionRaise', clamp(suspensionRaise, -0.03, 0.03)); } catch (_) {}
    try { vehicle.setHandling('fSuspensionForce', clamp(suspensionForce, 1.6, 2.8)); } catch (_) {}
}

function updateDriftPhysics() {
    if (!state.activeSetup) return;
    const vehicle = getCurrentVehicle();
    if (!vehicle) return;

    const s = state.activeSetup;
    const speed = vehicle.getSpeed() * 3.6;
    const velocityLocal = vehicle.getSpeedVector(true);
    const lateral = Math.abs(velocityLocal.x);
    const slipRatio = clamp(lateral / Math.max(Math.abs(velocityLocal.y), 0.1), 0, 1.4);

    const steerLeft = mp.game.controls.isControlPressed(0, 63) ? 1 : 0;
    const steerRight = mp.game.controls.isControlPressed(0, 64) ? 1 : 0;
    const steer = steerLeft - steerRight;
    const throttle = mp.game.controls.isControlPressed(0, 71);
    const handbrake = mp.game.controls.isControlPressed(0, 76);

    const rearGrip = safeNumber(s.rearGrip, 0.86);
    const entryAggression = safeNumber(s.steeringAngle, 39);
    const handbrakePower = safeNumber(s.handbrakePower, 1);
    const driveBias = safeNumber(s.driveBias, 1.0);
    const suspensionForce = safeNumber(s.suspensionForce, 2.1);

    const steerIntent = Math.abs(steer) > 0;
    const canInitiate = speed > 18 && steerIntent && throttle;
    const handbrakeKick = handbrake && speed > 10;
    const driftIntent = Boolean(canInitiate || handbrakeKick);
    const slipDrift = speed > 28 && slipRatio > 0.2;
    if (driftIntent || slipDrift) state.driftHoldUntil = Date.now() + 1400;
    const holdDrift = Date.now() < state.driftHoldUntil;

    const gripDelta = clamp(0.86 - rearGrip, -0.12, 0.14);
    const basePower = (gripDelta * 6.8) + ((entryAggression - 39) * 0.07) + ((driveBias - 0.5) * 0.75);
    const intentBonus = (driftIntent || holdDrift) ? (1.45 + (handbrakePower - 1) * 1.1) : 0;
    const suspensionAssist = (suspensionForce - 2.1) * 0.4;
    const slipDamp = slipRatio * (1.45 - suspensionAssist);
    let dynamicPower = basePower + intentBonus - slipDamp;

    // Не даем машине резко "тормозить двигателем" в заносе — сохраняем инерцию.
    if (throttle) dynamicPower = Math.max(dynamicPower, 0.25);
    else if (holdDrift) dynamicPower = Math.max(dynamicPower, 0.18);
    else dynamicPower = Math.max(dynamicPower, 0.1);
    dynamicPower = clamp(dynamicPower, 0.1, 12);

    vehicle.setEnginePowerMultiplier(dynamicPower);
    vehicle.setEngineTorqueMultiplier(clamp(1 + dynamicPower / 32, 1.0, 1.3));

    const reduceGrip = Boolean(
        (handbrake && speed > 8) ||
        (holdDrift && speed > 20) ||
        (throttle && slipRatio > (0.24 + ((rearGrip - 0.72) * 0.06)) && speed > 32)
    );
    vehicle.setReduceGrip(reduceGrip);
}

function setUiState(enabled) {
    state.uiOpen = enabled;
    if (enabled) {
        mp.busy.add(busyName, true);
        mp.events.call('hud.enable', false);
        mp.game.ui.displayRadar(false);
    } else {
        mp.busy.remove(busyName);
        mp.events.call('hud.enable', true);
        mp.game.ui.displayRadar(true);
    }
}

mp.keys.bind(LOCAL_KEY, true, () => {
    if (mp.busy.includes() && !mp.busy.includes(busyName)) return;
    if (!state.isNearWorkshop || state.uiOpen) return;
    mp.events.callRemote('drift.workshop.interact');
});

mp.events.add('drift.workshop.enter', () => {
    state.isNearWorkshop = true;
});

mp.events.add('drift.workshop.exit', () => {
    state.isNearWorkshop = false;
    if (!state.uiOpen) mp.events.call('prompt.hide');
});

mp.events.add('drift.ui.open', (payload) => {
    state.currentVehicleSetup = payload;
    setUiState(true);
    mp.callCEFV(`driftSetup.open(${JSON.stringify(payload)})`);
});

mp.events.add('drift.setup.purchase.ans', (success, payload) => {
    if (!state.uiOpen) return;
    if (success && payload) {
        state.currentVehicleSetup = { ...state.currentVehicleSetup, ...payload };
        mp.callCEFV(`driftSetup.onConversionPurchased(${JSON.stringify(payload)})`);
        applyVehicleSetup(payload.settings);
    }
});

mp.events.add('drift.setup.sync', (payload) => {
    if (!payload) return;
    state.currentVehicleSetup = {
        ...(state.currentVehicleSetup || {}),
        ...payload,
    };
    if (payload.settings) applyVehicleSetup(payload.settings);
    if (state.uiOpen) mp.callCEFV(`driftSetup.onServerSync(${JSON.stringify(payload)})`);
});

mp.events.add('drift.preset.list', (list) => {
    if (!state.uiOpen) return;
    mp.callCEFV(`driftSetup.customPresets = ${JSON.stringify(list || [])}`);
});

mp.events.add('drift.vehicle.state', (payload) => {
    if (!payload) return resetVehicleModifiers();
    state.appliedVehicleId = payload.vehicleId;
    state.currentVehicleSetup = payload;
    applyVehicleSetup(payload.settings);
});

mp.events.add('playerExitVehicle', () => {
    resetVehicleModifiers();
    state.appliedVehicleId = null;
});

if (mp.timer && typeof mp.timer.addInterval === 'function') {
    mp.timer.addInterval(updateDriftPhysics, 120);
} else {
    setInterval(updateDriftPhysics, 120);
}

mp.events.add('drift.setup.action', (action, payloadRaw) => {
    if (!action) return;

    let payload = null;
    if (typeof payloadRaw === 'string' && payloadRaw.length > 0) {
        try { payload = JSON.parse(payloadRaw); } catch (_) { payload = null; }
    }

    switch (action) {
        case 'close':
            setUiState(false);
            mp.callCEFV('driftSetup.close()');
            mp.events.callRemote('drift.ui.close');
            return;
        case 'purchase':
            mp.events.callRemote('drift.setup.purchase');
            return;
        case 'apply':
            mp.events.callRemote('drift.setup.apply', payload || {});
            if (payload) applyVehicleSetup(payload);
            return;
        case 'reset':
            mp.events.callRemote('drift.setup.reset');
            return;
        case 'savePreset':
            if (!payload) return;
            mp.events.callRemote('drift.preset.save', payload.name, payload.settings || {});
            return;
        case 'loadPreset':
            if (!payload) return;
            mp.events.callRemote('drift.preset.load', payload.name);
            return;
        case 'renamePreset':
            if (!payload) return;
            mp.events.callRemote('drift.preset.rename', payload.oldName, payload.newName);
            return;
        case 'deletePreset':
            if (!payload) return;
            mp.events.callRemote('drift.preset.delete', payload.name);
            return;
        case 'preview':
            if (payload) applyVehicleSetup(payload);
            return;
        default:
            return;
    }
});
