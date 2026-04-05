"use strict";

const config = require('./config');
const notifications = call('notifications');
let workshops = [];

const defaultSettings = {
    suspensionFrontStiffness: 1.0,
    suspensionRearStiffness: 1.0,
    suspensionFrontHeight: 0.0,
    suspensionRearHeight: 0.0,
    steeringAngle: 40,
    steeringResponse: 1.0,
    counterSteerAssist: 0.35,
    frontGrip: 0.95,
    rearGrip: 0.78,
    slipFactor: 1.0,
    torqueResponse: 1.0,
    finalDriveBias: 1.0,
    differentialLock: 0.55,
    brakeBias: 0.6,
    handbrakePower: 1.0,
    handbrakeResponse: 1.0,
    frontRearBalance: 0,
    bodyRotationHelp: 0.45,
    stabilityBias: 0.45,
    driftAssist: 1,
    beginnerAssist: 0.15,
    throttleSmoothing: 0.35,
};

const builtinPresets = {
    'Street Drift': {
        ...defaultSettings,
        steeringAngle: 42,
        rearGrip: 0.82,
        slipFactor: 1.05,
        driftAssist: 0.85,
        beginnerAssist: 0.2,
    },
    'Pro Drift': {
        ...defaultSettings,
        steeringAngle: 50,
        rearGrip: 0.72,
        slipFactor: 1.2,
        torqueResponse: 1.18,
        driftAssist: 0.55,
        beginnerAssist: 0.05,
    },
    'Big Angle': {
        ...defaultSettings,
        steeringAngle: 56,
        steeringResponse: 1.25,
        rearGrip: 0.68,
        bodyRotationHelp: 0.85,
        stabilityBias: 0.25,
    },
    'Fast Entry': {
        ...defaultSettings,
        frontGrip: 1.08,
        rearGrip: 0.77,
        brakeBias: 0.67,
        torqueResponse: 1.2,
        handbrakePower: 1.1,
    },
    'Wet Setup': {
        ...defaultSettings,
        frontGrip: 0.85,
        rearGrip: 0.63,
        slipFactor: 1.25,
        steeringResponse: 1.1,
        beginnerAssist: 0.35,
    },
    'Tandem Setup': {
        ...defaultSettings,
        steeringAngle: 48,
        rearGrip: 0.8,
        finalDriveBias: 0.92,
        differentialLock: 0.75,
        stabilityBias: 0.58,
    },
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function sanitizeSettings(payload = {}) {
    const sanitized = { ...defaultSettings };
    const limits = config.sliderLimits;

    Object.keys(defaultSettings).forEach((key) => {
        const value = Number(payload[key]);
        const [min, max] = limits[key] || [defaultSettings[key], defaultSettings[key]];
        if (!Number.isFinite(value)) {
            sanitized[key] = clamp(defaultSettings[key], min, max);
            return;
        }
        sanitized[key] = clamp(value, min, max);
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
        initiation: ((1 - s.rearGrip) * 42) + (s.handbrakePower * 22) + (s.slipFactor * 25),
        stability: (s.frontGrip * 36) + ((1 - s.slipFactor) * 20) + (s.stabilityBias * 44),
        angle: ((s.steeringAngle - 28) * 2.2) + (s.bodyRotationHelp * 28),
        control: (s.steeringResponse * 30) + (s.counterSteerAssist * 25) + (s.driftAssist * 25),
        aggressiveness: (s.torqueResponse * 35) + (s.differentialLock * 25) + ((1 - s.rearGrip) * 40),
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
