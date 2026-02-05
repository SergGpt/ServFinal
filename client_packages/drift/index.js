"use strict";

const defaultConfig = {
    vehicles: {},
    smoke: {
        drift: {
            dict: "core",
            name: "exp_grd_tire_smoke",
            scaleMin: 0.35,
            scaleMax: 1.1,
        },
        burnout: {
            dict: "core",
            name: "exp_grd_tire_smoke",
            scaleMin: 0.5,
            scaleMax: 1.3,
        },
    },
    speedMin: 9,
    angleMin: 15,
    burnoutSpeedMax: 4,
    syncIntervalMs: 250,
    smokeIntervalMs: 100,
    reduceGrip: true,
};

const state = {
    config: { ...defaultConfig },
    driftVehiclesConfigByHash: new Map(),
    lastSyncAt: 0,
    lastSent: { active: false, mode: null, scale: 0 },
    smokeByVehicle: new Map(),
    lastVehicle: null,
};

const wheelBones = ["wheel_lf", "wheel_rf", "wheel_lr", "wheel_rr"];

mp.events.add("drift.config", (config) => {
    state.config = {
        ...defaultConfig,
        ...config,
        smoke: {
            ...defaultConfig.smoke,
            ...(config?.smoke || {}),
        },
    };

    state.driftVehiclesConfigByHash.clear();
    const vehiclesConfig = state.config.vehicles || {};
    Object.keys(vehiclesConfig).forEach((model) => {
        const hash = mp.game.joaat(model);
        state.driftVehiclesConfigByHash.set(hash, vehiclesConfig[model] || {});
    });
});

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getVehicleKey(vehicle) {
    return vehicle?.remoteId ?? vehicle?.id ?? vehicle?.handle;
}

function getVehicleDriftConfig(vehicle) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) return null;
    return state.driftVehiclesConfigByHash.get(vehicle.model) || null;
}

function isEligibleVehicle(vehicle) {
    return Boolean(getVehicleDriftConfig(vehicle));
}

function getSlipAngle(vehicle) {
    const velocity = mp.game.entity.getEntityVelocity(vehicle.handle);
    const speed = Math.sqrt((velocity.x ** 2) + (velocity.y ** 2));
    if (speed < 0.1) return 0;

    const heading = mp.game.entity.getEntityHeading(vehicle.handle) * (Math.PI / 180);
    const forward = { x: Math.sin(heading), y: Math.cos(heading) };
    const dot = (forward.x * velocity.x + forward.y * velocity.y) / speed;
    const angle = Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);

    return angle;
}

function detectMode(vehicle, speed, vehicleConfig = {}) {
    const isAccel = mp.game.controls.isControlPressed(0, 71);
    const isBrake = mp.game.controls.isControlPressed(0, 72);
    const isHandbrake = mp.game.controls.isControlPressed(0, 76);
    if (speed <= (vehicleConfig.burnoutSpeedMax ?? state.config.burnoutSpeedMax) && isAccel && (isBrake || isHandbrake)) {
        return "burnout";
    }

    const angle = getSlipAngle(vehicle);
    if (speed >= (vehicleConfig.speedMin ?? state.config.speedMin) && angle >= (vehicleConfig.angleMin ?? state.config.angleMin)) {
        return "drift";
    }

    return null;
}

function getScaleForSpeed(mode, speed, vehicleConfig = {}) {
    const smokeConfig = state.config.smoke[mode];
    if (!smokeConfig) return 1;
    const maxSpeed = (vehicleConfig.speedMin ?? state.config.speedMin) * 2;
    const normalized = clamp(speed / Math.max(maxSpeed, 1), 0, 1);
    const scaleMin = vehicleConfig.smokeScaleMin ?? smokeConfig.scaleMin;
    const scaleMax = vehicleConfig.smokeScaleMax ?? smokeConfig.scaleMax;
    return scaleMin + ((scaleMax - scaleMin) * normalized);
}

function applyReduceGrip(vehicle, shouldApply) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) return;
    vehicle.setReduceGrip(shouldApply);
}

function ensureAssetLoaded(dict) {
    if (mp.game.streaming.hasNamedPtfxAssetLoaded(dict)) return true;
    mp.game.streaming.requestNamedPtfxAsset(dict);
    return false;
}

function startSmoke(vehicle, mode, scale) {
    const smokeConfig = state.config.smoke[mode];
    if (!smokeConfig) return null;
    if (!ensureAssetLoaded(smokeConfig.dict)) return null;

    const handles = [];
    wheelBones.forEach((boneName) => {
        const boneIndex = vehicle.getBoneIndexByName(boneName);
        if (boneIndex === -1) return;
        mp.game.graphics.setPtfxAssetNextCall(smokeConfig.dict);
        const handle = mp.game.graphics.startParticleFxLoopedOnEntityBone(
            smokeConfig.name,
            vehicle.handle,
            0,
            0,
            0,
            0,
            0,
            0,
            boneIndex,
            scale,
            false,
            false,
            false,
        );
        handles.push(handle);
    });

    return handles;
}

function stopSmoke(vehicleKey) {
    const current = state.smokeByVehicle.get(vehicleKey);
    if (!current) return;
    current.handles.forEach((handle) => {
        mp.game.graphics.stopParticleFxLooped(handle, false);
    });
    state.smokeByVehicle.delete(vehicleKey);
}

function updateSmoke(vehicle, driftState) {
    const vehicleKey = getVehicleKey(vehicle);
    if (!driftState?.active) {
        stopSmoke(vehicleKey);
        return;
    }

    const mode = driftState.mode === "burnout" ? "burnout" : "drift";
    const scale = clamp(Number(driftState.scale) || 1, 0.1, 2);
    const existing = state.smokeByVehicle.get(vehicleKey);
    if (!existing || existing.mode !== mode) {
        stopSmoke(vehicleKey);
        const handles = startSmoke(vehicle, mode, scale);
        if (!handles || handles.length === 0) return;
        state.smokeByVehicle.set(vehicleKey, { mode, handles, scale });
        return;
    }

    if (Math.abs(existing.scale - scale) > 0.05) {
        existing.handles.forEach((handle) => {
            mp.game.graphics.setParticleFxLoopedScale(handle, scale);
        });
        existing.scale = scale;
    }
}

function syncStateIfNeeded(nextState) {
    const now = Date.now();
    const lastSent = state.lastSent;
    const scaleDiff = Math.abs((nextState.scale || 0) - (lastSent.scale || 0));
    if (
        nextState.active === lastSent.active &&
        nextState.mode === lastSent.mode &&
        scaleDiff < 0.05
    ) {
        return;
    }
    if (now - state.lastSyncAt < state.config.syncIntervalMs) return;

    mp.events.callRemote("drift.state.update", nextState.active, nextState.mode, nextState.scale);
    state.lastSent = { ...nextState };
    state.lastSyncAt = now;
}

function updateLocalState() {
    const player = mp.players.local;
    const vehicle = player.vehicle;
    if (!vehicle || vehicle.getPedInSeat(-1) !== player.handle) {
        if (state.lastVehicle) {
            applyReduceGrip(state.lastVehicle, false);
            state.lastVehicle = null;
        }
        syncStateIfNeeded({ active: false, mode: null, scale: 0 });
        return;
    }

    const vehicleConfig = getVehicleDriftConfig(vehicle) || {};
    const eligible = Boolean(vehicleConfig);
    if (state.lastVehicle && state.lastVehicle !== vehicle) {
        applyReduceGrip(state.lastVehicle, false);
    }
    state.lastVehicle = vehicle;
    applyReduceGrip(vehicle, eligible && (vehicleConfig.reduceGrip ?? state.config.reduceGrip));

    if (!eligible) {
        syncStateIfNeeded({ active: false, mode: null, scale: 0 });
        updateSmoke(vehicle, { active: false });
        return;
    }

    const speed = mp.game.entity.getEntitySpeed(vehicle.handle);
    const mode = detectMode(vehicle, speed, vehicleConfig);
    const active = Boolean(mode);
    const scale = active ? getScaleForSpeed(mode, speed, vehicleConfig) : 0;

    const nextState = { active, mode, scale };
    syncStateIfNeeded(nextState);
    updateSmoke(vehicle, nextState);
}

function updateRemoteSmoke() {
    const activeVehicles = new Set();
    mp.vehicles.forEachInStreamRange((vehicle) => {
        if (!vehicle || !mp.vehicles.exists(vehicle)) return;
        const vehicleKey = getVehicleKey(vehicle);
        activeVehicles.add(vehicleKey);
        if (vehicle === mp.players.local.vehicle) return;
        const driftState = vehicle.getVariable("drift:state");
        updateSmoke(vehicle, driftState);
    });

    for (const vehicleKey of state.smokeByVehicle.keys()) {
        if (!activeVehicles.has(vehicleKey)) {
            stopSmoke(vehicleKey);
        }
    }
}

mp.timer.addInterval(() => {
    try {
        updateLocalState();
        updateRemoteSmoke();
    } catch (err) {
        // защита от редких ошибок в стриме
    }
}, state.config.smokeIntervalMs);
