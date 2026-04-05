"use strict";

const config = require('./config');
const notifications = call('notifications');
let workshops = [];

const defaultSettings = {
    steeringAngle: 39,
    rearGrip: 0.86,
    handbrakePower: 1.0,
    driveBias: 1.0,
    suspensionRaise: 0.0,
    suspensionForce: 2.1,
};

const builtinPresets = {
    'Street Drift': {
        ...defaultSettings,
        steeringAngle: 38,
        rearGrip: 0.9,
        handbrakePower: 1.0,
        driveBias: 0.95,
    },
    'Pro Drift': {
        ...defaultSettings,
        steeringAngle: 44,
        rearGrip: 0.8,
        handbrakePower: 1.15,
        driveBias: 1.0,
        suspensionForce: 2.25,
    },
    'Big Angle': {
        ...defaultSettings,
        steeringAngle: 47,
        rearGrip: 0.76,
        handbrakePower: 1.25,
        driveBias: 1.0,
        suspensionForce: 2.35,
    },
    'Fast Entry': {
        ...defaultSettings,
        steeringAngle: 42,
        rearGrip: 0.82,
        handbrakePower: 1.1,
        driveBias: 0.9,
    },
    'Wet Setup': {
        ...defaultSettings,
        steeringAngle: 40,
        rearGrip: 0.74,
        handbrakePower: 1.05,
        suspensionRaise: 0.01,
        suspensionForce: 2.3,
    },
    'Tandem Setup': {
        ...defaultSettings,
        steeringAngle: 41,
        rearGrip: 0.88,
        handbrakePower: 0.95,
        driveBias: 0.85,
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

    Object.keys(defaultSettings).forEach((key) => {
        const value = Number(payload[key]);
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
    const stats = {
        initiation: ((1 - s.rearGrip) * 160) + (s.handbrakePower * 28) + (s.driveBias * 8),
        stability: (s.rearGrip * 100) + ((2.8 - s.suspensionForce) * 8),
        angle: ((s.steeringAngle - 32) * 7.2),
        control: (s.rearGrip * 55) + ((48 - s.steeringAngle) * 3.3) + ((s.suspensionForce - 1.6) * 7),
        aggressiveness: ((1 - s.rearGrip) * 170) + ((s.handbrakePower - 0.8) * 45) + (s.driveBias * 10),
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
