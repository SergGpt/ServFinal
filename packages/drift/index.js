"use strict";

const config = require('./config');
const notifications = call('notifications');
let workshops = [];

const defaultSettings = {
    wheelOverpower: 0,
    rearGripLoss: 0,
    steeringAngle: 0,
};

const builtinPresets = {
    'Street Drift': {
        wheelOverpower: 24, rearGripLoss: 18, steeringAngle: 20,
    },
    'Balance Drift': {
        wheelOverpower: 45, rearGripLoss: 36, steeringAngle: 42,
    },
    'Pro Drift': {
        wheelOverpower: 72, rearGripLoss: 60, steeringAngle: 75,
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
    if (normalizedPayload.rearGripLoss == null && normalizedPayload.rearGrip != null) {
        const rearGrip = Number(normalizedPayload.rearGrip);
        if (Number.isFinite(rearGrip)) {
            normalizedPayload.rearGripLoss = clamp((1 - rearGrip) * 260, 0, 100);
        }
    }
    if (normalizedPayload.rearGripLoss == null && normalizedPayload.dirtPower != null) {
        const dirtPower = clamp(Number(normalizedPayload.dirtPower) || 0, 0, 1);
        const mapped = dirtPower * 100;
        normalizedPayload.rearGripLoss = mapped;
        normalizedPayload.wheelOverpower = mapped;
    }
    if (normalizedPayload.rearGripLoss == null && normalizedPayload.slipStrength != null) {
        const slip = clamp((Number(normalizedPayload.slipStrength) || 0) / 100, 0, 1);
        const mapped = slip * 100;
        normalizedPayload.rearGripLoss = mapped;
        normalizedPayload.wheelOverpower = mapped;
        normalizedPayload.steeringAngle = mapped;
    }

    // Compatibility with previous multi-parameter % model.
    if (normalizedPayload.wheelOverpower == null && normalizedPayload.initialDriveForce != null) {
        normalizedPayload.wheelOverpower = clamp(Number(normalizedPayload.initialDriveForce), 0, 100);
    }
    if (normalizedPayload.rearGripLoss == null && normalizedPayload.tractionCurveMin != null) {
        normalizedPayload.rearGripLoss = clamp(Number(normalizedPayload.tractionCurveMin), 0, 100);
    }
    if (normalizedPayload.steeringAngle == null && normalizedPayload.steeringLock != null) {
        normalizedPayload.steeringAngle = clamp(Number(normalizedPayload.steeringLock), 0, 100);
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
            activePreset: 'Stock',
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
        activePreset: setup.activePreset || 'Stock',
        driftEnabled: Boolean(setup.installed && setup.activePreset && setup.activePreset !== 'Stock'),
        settings,
        builtinPresets,
        customPresets,
        maxSavedPresets: config.maxSavedPresets,
    };
}

function getStats(settings) {
    const s = sanitizeSettings(settings);
    const powerBias = clamp(s.wheelOverpower / 100, 0, 1);
    const gripDelta = clamp(s.rearGripLoss / 100, 0, 1);
    const angleBias = clamp(s.steeringAngle / 100, 0, 1);
    const stats = {
        initiation: 20 + (powerBias * 50) + (gripDelta * 20),
        stability: 92 - (gripDelta * 45),
        angle: 15 + (powerBias * 20) + (gripDelta * 20) + (angleBias * 45),
        control: 86 - (powerBias * 20) - (gripDelta * 18) + (angleBias * 10),
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
