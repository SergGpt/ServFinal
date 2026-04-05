"use strict";

const LOCAL_KEY = 0x45;
const busyName = 'driftSetup';

const state = {
    isNearWorkshop: false,
    uiOpen: false,
    currentVehicleSetup: null,
    appliedVehicleId: null,
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

function getBalanceFactor(settings) {
    const bias = safeNumber(settings.frontRearBalance, 0);
    return {
        front: clamp(1 + (bias * 0.25), 0.8, 1.2),
        rear: clamp(1 - (bias * 0.25), 0.8, 1.2),
    };
}

function applyVehicleSetup(setup) {
    const vehicle = getCurrentVehicle();
    if (!vehicle || !setup) return;

    const s = setup;
    const balance = getBalanceFactor(s);

    vehicle.setEnginePowerMultiplier((safeNumber(s.torqueResponse, 1) - 1) * 85);
    mp.game.vehicle.setVehicleHandlingFloat(
        vehicle.handle,
        'CHandlingData',
        'fBrakeForce',
        clamp(safeNumber(s.handbrakePower, 1) * 0.9, 0.25, 1.8),
    );

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fSteeringLock', safeNumber(s.steeringAngle, 40));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fSteeringCurve', clamp(safeNumber(s.steeringResponse, 1), 0.4, 2));

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fTractionCurveMax', clamp((safeNumber(s.frontGrip, 0.9) * balance.front), 0.55, 2));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fTractionCurveMin', clamp((safeNumber(s.rearGrip, 0.8) * balance.rear), 0.45, 1.7));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fLowSpeedTractionLossMult', clamp(safeNumber(s.slipFactor, 1), 0.5, 2.5));

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fSuspensionForce', clamp((safeNumber(s.suspensionFrontStiffness, 1) + safeNumber(s.suspensionRearStiffness, 1)) / 2, 0.5, 2));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fSuspensionRaise', clamp((safeNumber(s.suspensionFrontHeight, 0) + safeNumber(s.suspensionRearHeight, 0)) / 2, -0.12, 0.12));

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fInitialDriveForce', clamp(0.26 * safeNumber(s.finalDriveBias, 1) * safeNumber(s.torqueResponse, 1), 0.12, 0.5));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fDriveInertia', clamp(1.0 + ((safeNumber(s.differentialLock, 0.5) - 0.5) * 0.8), 0.65, 1.5));

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fBrakeBiasFront', clamp(safeNumber(s.brakeBias, 0.6), 0.3, 0.8));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fHandBrakeForce', clamp(safeNumber(s.handbrakePower, 1) * safeNumber(s.handbrakeResponse, 1), 0.5, 2.2));

    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fTractionBiasFront', clamp(0.48 + (safeNumber(s.stabilityBias, 0.5) - 0.5) * 0.14, 0.35, 0.63));
    mp.game.vehicle.setVehicleHandlingFloat(vehicle.handle, 'CHandlingData', 'fTractionSpringDeltaMax', clamp(0.12 + safeNumber(s.bodyRotationHelp, 0.5) * 0.25, 0.08, 0.42));

    vehicle.setReduceGrip(safeNumber(s.driftAssist, 1) > 0.05);
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
    if (!payload) return;
    state.appliedVehicleId = payload.vehicleId;
    applyVehicleSetup(payload.settings);
});

mp.events.add('playerExitVehicle', () => {
    state.appliedVehicleId = null;
});

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
