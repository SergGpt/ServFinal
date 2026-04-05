"use strict";

const config = require('./config');
const notifications = call('notifications');
let workshops = [];

const defaultSettings = {
    driveBiasFront: 0.0,
    steeringLock: 0.72,
    tractionCurveMax: 2.35,
    tractionCurveMin: 2.0,
    lowSpeedTractionLossMult: 0.85,
    initialDriveForce: 0.22,
    driveInertia: 0.95,
    brakeBiasFront: 0.58,
    suspensionCompDamp: 1.0,
    suspensionReboundDamp: 1.2,
    comShiftY: 0.0,
    comShiftZ: -0.08,
};

const builtinPresets = {
    'Street Drift': {
        driveBiasFront: 0.0, steeringLock: 0.72, tractionCurveMax: 2.35, tractionCurveMin: 2.0,
        lowSpeedTractionLossMult: 0.85, initialDriveForce: 0.22, driveInertia: 0.95,
        brakeBiasFront: 0.58, suspensionCompDamp: 1.0, suspensionReboundDamp: 1.2, comShiftY: 0.0, comShiftZ: -0.08,
    },
    'Balance Drift': {
        driveBiasFront: 0.0, steeringLock: 0.92, tractionCurveMax: 1.9, tractionCurveMin: 1.35,
        lowSpeedTractionLossMult: 1.2, initialDriveForce: 0.3, driveInertia: 1.1,
        brakeBiasFront: 0.45, suspensionCompDamp: 1.3, suspensionReboundDamp: 1.7, comShiftY: 0.2, comShiftZ: -0.2,
    },
    'Pro Drift': {
        driveBiasFront: 0.0, steeringLock: 1.02, tractionCurveMax: 1.8, tractionCurveMin: 1.2,
        lowSpeedTractionLossMult: 1.45, initialDriveForce: 0.35, driveInertia: 1.2,
        brakeBiasFront: 0.42, suspensionCompDamp: 1.45, suspensionReboundDamp: 1.9, comShiftY: 0.24, comShiftZ: -0.24,
    },
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getStepPrecision(step) {
    const str = String(step || '');
    const dot = str.indexOf('.');
    return dot === -1 ? 0 : (str.length - dot - 1);
}

function roundToStep(value, step) {
    const numericStep = Number(step);
    if (!Number.isFinite(numericStep) || numericStep <= 0) return value;
    const rounded = Math.round(value / numericStep) * numericStep;
    const precision = getStepPrecision(numericStep);
    return Number(rounded.toFixed(Math.min(precision, 6)));
}

function sanitizeSettings(payload = {}) {
    const sanitized = { ...defaultSettings };
    const limits = config.sliderLimits;
    const steps = config.sliderSteps || {};
    const normalizedPayload = { ...(payload || {}) };

    // Backward compatibility for old DB/UI payloads.
    if (normalizedPayload.tractionCurveMin == null && normalizedPayload.rearGrip != null) {
        const rearGrip = Number(normalizedPayload.rearGrip);
        if (Number.isFinite(rearGrip)) {
            const mapped = clamp(rearGrip, 0.9, 2.3);
            normalizedPayload.tractionCurveMin = mapped;
            normalizedPayload.tractionCurveMax = clamp(mapped + 0.45, 1.4, 3.0);
        }
    }
    if (normalizedPayload.tractionCurveMin == null && normalizedPayload.dirtPower != null) {
        const dirtPower = clamp(Number(normalizedPayload.dirtPower) || 0, 0, 1);
        normalizedPayload.tractionCurveMin = clamp(1.75 - (dirtPower * 0.6), 0.9, 2.3);
        normalizedPayload.tractionCurveMax = clamp(2.25 - (dirtPower * 0.5), 1.4, 3.0);
        normalizedPayload.lowSpeedTractionLossMult = clamp(0.9 + dirtPower, 0.7, 2.2);
    }
    if (normalizedPayload.tractionCurveMin == null && normalizedPayload.slipStrength != null) {
        const slip = clamp((Number(normalizedPayload.slipStrength) || 0) / 100, 0, 1);
        normalizedPayload.tractionCurveMin = clamp(1.75 - (slip * 0.65), 0.9, 2.3);
        normalizedPayload.tractionCurveMax = clamp(2.3 - (slip * 0.5), 1.4, 3.0);
        normalizedPayload.lowSpeedTractionLossMult = clamp(0.9 + (slip * 0.9), 0.7, 2.2);
        normalizedPayload.steeringLock = clamp(0.78 + (slip * 0.26), 0.55, 1.25);
    }

    Object.keys(defaultSettings).forEach((key) => {
        const value = Number(normalizedPayload[key]);
        const [min, max] = limits[key] || [defaultSettings[key], defaultSettings[key]];
        if (!Number.isFinite(value)) {
            sanitized[key] = clamp(defaultSettings[key], min, max);
            return;
        }
        sanitized[key] = roundToStep(clamp(value, min, max), steps[key]);
    });

    return sanitized;
}

function normalizePresetName(name) {
    const value = String(name || '').trim().slice(0, 32);
    if (!value) return null;
    return value;
}

function parseJson(raw, fallback) {
    try {
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch (_) {
        return fallback;
    }
}

function canUseVehicle(vehicle, player) {
    if (!vehicle || !mp.vehicles.exists(vehicle)) return { ok: false, reason: 'Транспорт не найден' };
    if (vehicle.key !== 'private') return { ok: false, reason: 'Доступно только для личного транспорта' };
    if (!vehicle.sqlId || !vehicle.db) return { ok: false, reason: 'Транспорт недоступен' };
    if (!player || !player.character) return { ok: false, reason: 'Персонаж не загружен' };
    if (vehicle.owner !== player.character.id) return { ok: false, reason: 'Вы не владелец транспорта' };
    if (vehicle.isBeingTuned) return { ok: false, reason: 'Транспорт уже обслуживается' };
    if ((vehicle.getOccupants() || []).length > 1) return { ok: false, reason: 'В транспорте есть пассажиры' };

    const modelName = (vehicle.modelName || '').toLowerCase();
    if (config.blockedModels.includes(modelName)) return { ok: false, reason: 'Эта модель не подходит для drift setup' };

    const vehType = vehicle.properties && vehicle.properties.vehType;
    if (!config.allowedVehicleTypes.includes(vehType)) return { ok: false, reason: 'Только для легковых автомобилей' };

    return { ok: true };
}

function getVehicleByPlayer(player) {
    if (!player || !player.character) return null;
    let vehicle = player.vehicle;
    if (!vehicle || !mp.vehicles.exists(vehicle)) {
        vehicle = mp.vehicles.toArray()
            .filter(v => v && mp.vehicles.exists(v) && v.key === 'private' && v.owner === player.character.id)
            .sort((a, b) => {
                const da = (a.position.x - player.position.x) ** 2 + (a.position.y - player.position.y) ** 2 + (a.position.z - player.position.z) ** 2;
                const db = (b.position.x - player.position.x) ** 2 + (b.position.y - player.position.y) ** 2 + (b.position.z - player.position.z) ** 2;
                return da - db;
            })[0];
        if (!vehicle) return null;
        const distanceSquared = (vehicle.position.x - player.position.x) ** 2 + (vehicle.position.y - player.position.y) ** 2 + (vehicle.position.z - player.position.z) ** 2;
        if (distanceSquared > 36) return null;
    }
    return vehicle;
}

async function getOrCreateSetup(vehicle) {
    const [setup] = await db.Models.VehicleDriftSetup.findOrCreate({
        where: { vehicleId: vehicle.sqlId },
        defaults: {
            vehicleId: vehicle.sqlId,
            installed: false,
            activePreset: 'Street Drift',
            settings: JSON.stringify(defaultSettings),
            presets: JSON.stringify([]),
        },
    });

    if (!setup.settings) setup.settings = JSON.stringify(defaultSettings);
    if (!setup.presets) setup.presets = JSON.stringify([]);
    return setup;
}

function getClientPayload(setup) {
    const settings = sanitizeSettings(parseJson(setup.settings, defaultSettings));
    const customPresets = Array.isArray(parseJson(setup.presets, [])) ? parseJson(setup.presets, []) : [];

    return {
        conversionInstalled: Boolean(setup.installed),
        conversionPrice: config.conversionPrice,
        defaultSettings,
        limits: config.sliderLimits,
        steps: config.sliderSteps,
        activePreset: setup.activePreset || 'Street Drift',
        settings,
        builtinPresets,
        customPresets,
        maxSavedPresets: config.maxSavedPresets,
    };
}

function getStats(settings) {
    const s = sanitizeSettings(settings);
    const gripDelta = clamp((s.tractionCurveMax - s.tractionCurveMin) / 1.6, 0, 1);
    const angleBias = clamp((s.steeringLock - 0.55) / 0.7, 0, 1);
    const powerBias = clamp((s.initialDriveForce - 0.12) / 0.48, 0, 1);
    const lowSpeedBias = clamp((s.lowSpeedTractionLossMult - 0.7) / 1.5, 0, 1);
    const stats = {
        initiation: 25 + (lowSpeedBias * 45) + (powerBias * 20),
        stability: 80 - (gripDelta * 26) + ((s.suspensionReboundDamp - 0.8) * 8),
        angle: 18 + (angleBias * 67),
        control: 72 - (gripDelta * 18) + ((s.brakeBiasFront - 0.35) * 35),
        aggressiveness: 20 + (powerBias * 35) + (gripDelta * 40),
    };

    Object.keys(stats).forEach((key) => {
        stats[key] = Math.round(clamp(stats[key], 0, 100));
    });
    return stats;
}

function notifyError(player, text) {
    notifications.error(player, text, 'Drift Setup');
}

function notifyInfo(player, text) {
    notifications.info(player, text, 'Drift Setup');
}

module.exports = {
    config,
    defaultSettings,
    builtinPresets,
    sanitizeSettings,
    normalizePresetName,
    canUseVehicle,
    getVehicleByPlayer,
    getOrCreateSetup,
    getClientPayload,
    getStats,
    notifyError,
    notifyInfo,
    async loadWorkshops() {
        workshops = await db.Models.DriftWorkshop.findAll();
        if (workshops.length === 0) {
            for (let i = 0; i < config.workshops.length; i++) {
                const point = config.workshops[i];
                const created = await db.Models.DriftWorkshop.create({
                    name: point.name,
                    x: point.position.x,
                    y: point.position.y,
                    z: point.position.z,
                    radius: point.radius || 3.0,
                });
                workshops.push(created);
            }
        }
        return workshops;
    },
    getWorkshops() {
        return workshops;
    },
    async createWorkshop(name, position, radius = 3.0) {
        const workshop = await db.Models.DriftWorkshop.create({
            name: String(name || 'Drift Workshop').slice(0, 64),
            x: position.x,
            y: position.y,
            z: position.z,
            radius: clamp(Number(radius) || 3.0, 1.5, 8.0),
        });
        workshops.push(workshop);
        return workshop;
    },
};
