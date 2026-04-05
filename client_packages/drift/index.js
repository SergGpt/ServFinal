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

function applyVehicleSetup(setup) {
    const vehicle = getCurrentVehicle();
    if (!vehicle || !setup) return;

    const s = setup;
    const rearGrip = safeNumber(s.rearGrip, 0.86);
    const steeringAngle = safeNumber(s.steeringAngle, 39);
    const handbrakePower = safeNumber(s.handbrakePower, 1);

    vehicle.setEnginePowerMultiplier((1 - rearGrip) * 55);
    const setHandlingSafe = (field, value) => {
        try {
            vehicle.setHandling(field, value);
        } catch (_) {
            // ignore rare per-model handling exceptions
        }
    };

    setHandlingSafe('fSteeringLock', clamp(steeringAngle, 32, 48));
    setHandlingSafe('fTractionCurveMin', clamp(rearGrip, 0.72, 1.0));
    setHandlingSafe('fBrakeForce', clamp(handbrakePower * 0.85, 0.45, 1.4));
    setHandlingSafe('fHandBrakeForce', clamp(handbrakePower * 1.1, 0.8, 2.0));
    setHandlingSafe('fLowSpeedTractionLossMult', clamp(1.15 + ((1 - rearGrip) * 0.9), 1.0, 1.45));

    vehicle.setReduceGrip(rearGrip < 0.95);
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
