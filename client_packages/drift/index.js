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

function resolveSetup(setup = {}) {
    const source = setup || {};
    const pct = (key) => clamp(safeNumber(source[key], 0), 0, 100) / 100;
    const steerPct = pct('steeringLock');
    const trMaxPct = pct('tractionCurveMax');
    const trMinPct = pct('tractionCurveMin');
    const lowPct = pct('lowSpeedTractionLossMult');
    const forcePct = pct('initialDriveForce');
    const inertiaPct = pct('driveInertia');
    const brakePct = pct('brakeBiasFront');
    const compPct = pct('suspensionCompDamp');
    const rebPct = pct('suspensionReboundDamp');
    const comYPct = pct('comShiftY');
    const comZPct = pct('comShiftZ');
    const frontBiasPct = pct('driveBiasFront');
    return {
        driveBiasFront: clamp(frontBiasPct * 0.2, 0.0, 0.2),
        steeringLock: clamp(0.72 + (steerPct * 0.53), 0.72, 1.25),
        tractionCurveMax: clamp(2.35 - (trMaxPct * 0.95), 1.4, 2.35),
        tractionCurveMin: clamp(2.0 - (trMinPct * 1.1), 0.9, 2.0),
        lowSpeedTractionLossMult: clamp(0.85 + (lowPct * 1.35), 0.85, 2.2),
        initialDriveForce: clamp(0.22 + (forcePct * 0.38), 0.22, 0.6),
        driveInertia: clamp(0.95 + (inertiaPct * 0.85), 0.95, 1.8),
        brakeBiasFront: clamp(0.58 - (brakePct * 0.23), 0.35, 0.58),
        suspensionCompDamp: clamp(1.0 + (compPct * 1.2), 1.0, 2.2),
        suspensionReboundDamp: clamp(1.2 + (rebPct * 1.4), 1.2, 2.6),
        comShiftY: clamp(comYPct * 0.4, 0.0, 0.4),
        comShiftZ: clamp(-0.08 - (comZPct * 0.27), -0.35, -0.08),
        rearSlipLevel: clamp(((trMaxPct + trMinPct) / 2), 0, 1),
    };
}

function setHandlingSafe(vehicle, field, value) {
    try {
        vehicle.setHandling(field, value);
        return true;
    } catch (_) {
        return false;
    }
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

    const s = resolveSetup(setup);
    if (!Object.keys(setup).length || Object.values(setup).every(v => Number(v) === 0)) {
        vehicle.setEnginePowerMultiplier(0);
        vehicle.setEngineTorqueMultiplier(1);
        vehicle.setReduceGrip(false);
        return;
    }

    // Применяем только числовые handling-настройки, без FLAG_DRIFT_TYRES,
    // чтобы после покупки авто не превращалось в "мыло" до ручной настройки.
    setHandlingSafe(vehicle, 'fDriveBiasFront', s.driveBiasFront);
    setHandlingSafe(vehicle, 'fSteeringLock', s.steeringLock);
    setHandlingSafe(vehicle, 'fTractionCurveMax', s.tractionCurveMax);
    setHandlingSafe(vehicle, 'fTractionCurveMin', s.tractionCurveMin);
    setHandlingSafe(vehicle, 'fLowSpeedTractionLossMult', s.lowSpeedTractionLossMult);
    setHandlingSafe(vehicle, 'fInitialDriveForce', s.initialDriveForce);
    setHandlingSafe(vehicle, 'fDriveInertia', s.driveInertia);
    setHandlingSafe(vehicle, 'fBrakeBiasFront', s.brakeBiasFront);
    setHandlingSafe(vehicle, 'fSuspensionCompDamp', s.suspensionCompDamp);
    setHandlingSafe(vehicle, 'fSuspensionReboundDamp', s.suspensionReboundDamp);
    setHandlingSafe(vehicle, 'vecCentreOfMassOffset', new mp.Vector3(0.0, s.comShiftY, s.comShiftZ));

    // Slight global helper so drift remains smooth even on desynced surfaces.
    const gripAssist = s.rearSlipLevel;
    vehicle.setEnginePowerMultiplier(clamp(gripAssist * 0.25, 0, 0.5));
    vehicle.setEngineTorqueMultiplier(clamp(1 + (s.driveInertia - 1.0) * 0.05, 0.95, 1.1));
    vehicle.setReduceGrip(false);
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

    const setup = resolveSetup(s);
    const steerIntent = Math.abs(steer) > 0;
    const canInitiate = speed > 18 && steerIntent && throttle;
    const handbrakeKick = handbrake && speed > 10;
    const driftIntent = Boolean(canInitiate || handbrakeKick);
    const slipDrift = speed > 28 && slipRatio > 0.2;
    if (driftIntent || slipDrift) state.driftHoldUntil = Date.now() + 1400;
    const holdDrift = Date.now() < state.driftHoldUntil;

    // Эффект скольжения как на рыхлой поверхности:
    // - основа мягкая,
    // - срыв приходит от входа (руль+газ/ручник),
    // - при отпускании газа угол не "отрубается" мгновенно.
    const rearSlipBias = setup.rearSlipLevel;
    const basePower = rearSlipBias * 0.28;
    const intentBonus = (driftIntent || holdDrift) ? (0.12 + rearSlipBias * 0.28) : 0;
    const slipDamp = slipRatio * (0.25 + (1 - rearSlipBias) * 0.22);
    let dynamicPower = basePower + intentBonus - slipDamp;

    // Не даем машине резко "тормозить двигателем" в заносе — сохраняем инерцию.
    if (throttle) dynamicPower = Math.max(dynamicPower, 0.26);
    else if (holdDrift) dynamicPower = Math.max(dynamicPower, 0.2);
    else dynamicPower = Math.max(dynamicPower, 0.1);
    dynamicPower = clamp(dynamicPower, 0.06, 1.35);

    vehicle.setEnginePowerMultiplier(dynamicPower);
    vehicle.setEngineTorqueMultiplier(clamp(1 + dynamicPower / 90, 1.0, 1.07));

    // "Задняя ось больше, передняя немного":
    // в RAGE MP прямого раздельного API по осям нет, поэтому реализуем мягкую аппроксимацию:
    // reduceGrip включается только в моменты drift intent/hold и достаточно выраженного slip.
    // За счёт этого перед остаётся относительно стабильным, а срыв ощущается в основном по корме.
    const reduceGrip = Boolean(
        (handbrake && speed > 8) ||
        ((driftIntent || holdDrift) && speed > 20 && slipRatio > (0.34 - rearSlipBias * 0.12)) ||
        (throttle && speed > 34 && slipRatio > (0.52 - rearSlipBias * 0.14))
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
        resetVehicleModifiers();
    }
});

mp.events.add('drift.setup.sync', (payload) => {
    if (!payload) return;
    state.currentVehicleSetup = {
        ...(state.currentVehicleSetup || {}),
        ...payload,
    };
    if (payload.driftEnabled && payload.settings) applyVehicleSetup(payload.settings);
    if (payload.driftEnabled === false) resetVehicleModifiers();
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
            mp.events.callRemote('drift.setup.apply', JSON.stringify(payload || {}));
            if (payload) applyVehicleSetup(payload);
            return;
        case 'reset':
            mp.events.callRemote('drift.setup.reset');
            return;
        case 'savePreset':
            if (!payload) return;
            mp.events.callRemote('drift.preset.save', payload.name, JSON.stringify(payload.settings || {}));
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
