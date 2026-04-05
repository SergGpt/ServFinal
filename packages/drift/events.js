"use strict";

const drift = require('./index');
const money = call('money');

const workshopShapes = new Map();
const workshopRuntime = new Map();

function getWorkshopByShape(shape) {
    if (!shape || !shape.isDriftWorkshop) return null;
    return drift.getWorkshops().find(x => x.id === shape.driftWorkshopId) || null;
}

function createWorkshopRuntime(point) {
    const shape = mp.colshapes.newSphere(point.x, point.y, point.z, point.radius || 2.5);
    shape.isDriftWorkshop = true;
    shape.driftWorkshopId = point.id;
    workshopShapes.set(point.id, shape);

    let marker = null;
    let blip = null;
    if (drift.config.workshops[0] && drift.config.workshops[0].marker) {
        const markerCfg = drift.config.workshops[0].marker;
        marker = mp.markers.new(
            markerCfg.type || 1,
            new mp.Vector3(point.x, point.y, point.z - 1),
            markerCfg.scale || 1,
            {
                color: markerCfg.color || [255, 255, 255, 120],
                visible: true,
                dimension: 0,
            },
        );
    }

    if (drift.config.workshops[0] && drift.config.workshops[0].blip) {
        const blipCfg = drift.config.workshops[0].blip;
        blip = mp.blips.new(blipCfg.sprite || 72, new mp.Vector3(point.x, point.y, point.z), {
            name: point.name || blipCfg.name || 'Drift Workshop',
            color: blipCfg.color || 0,
            shortRange: blipCfg.shortRange !== false,
            scale: 0.8,
        });
    }
    workshopRuntime.set(point.id, { marker, blip, shape });
}

async function openUi(player, vehicle) {
    const validation = drift.canUseVehicle(vehicle, player);
    if (!validation.ok) {
        drift.notifyError(player, validation.reason);
        return;
    }

    const setup = await drift.getOrCreateSetup(vehicle);
    const payload = drift.getClientPayload(setup);
    payload.vehicleName = vehicle.properties ? vehicle.properties.name : vehicle.modelName;
    payload.vehicleId = vehicle.sqlId;
    payload.stats = drift.getStats(payload.settings);

    player.currentDriftVehicleId = vehicle.sqlId;
    player.call('drift.ui.open', [payload]);
}

async function resolvePlayerVehicle(player) {
    const vehicle = drift.getVehicleByPlayer(player);
    if (!vehicle) {
        drift.notifyError(player, 'Подойдите к личному транспорту или сядьте за руль');
        return null;
    }

    const validation = drift.canUseVehicle(vehicle, player);
    if (!validation.ok) {
        drift.notifyError(player, validation.reason);
        return null;
    }

    return vehicle;
}

function getCurrentUiVehicle(player) {
    if (!player.currentDriftVehicleId) return null;
    return mp.vehicles.toArray().find(v => v && mp.vehicles.exists(v) && v.sqlId === player.currentDriftVehicleId) || null;
}

function parseSettingsPayload(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    if (typeof raw === 'object') return raw;
    return {};
}

module.exports = {
    init: async () => {
        const workshops = await drift.loadWorkshops();
        workshops.forEach((point) => createWorkshopRuntime(point));
        inited(__dirname);
    },

    'playerEnterColshape': (player, shape) => {
        const workshop = getWorkshopByShape(shape);
        if (!workshop || !player.character) return;
        player.currentDriftWorkshopId = workshop.id;
        player.call('drift.workshop.enter', [workshop.id]);
        player.call('prompt.showByName', ['drift_workshop']);
    },

    'playerExitColshape': (player, shape) => {
        const workshop = getWorkshopByShape(shape);
        if (!workshop || !player.character) return;
        if (player.currentDriftWorkshopId === workshop.id) {
            delete player.currentDriftWorkshopId;
            player.call('drift.workshop.exit', [workshop.id]);
            player.call('prompt.hide');
        }
    },

    'drift.workshop.interact': async (player) => {
        if (!player.character) return;
        if (!player.currentDriftWorkshopId) return;

        const vehicle = await resolvePlayerVehicle(player);
        if (!vehicle) return;
        await openUi(player, vehicle);
    },

    'drift.ui.close': (player) => {
        delete player.currentDriftVehicleId;
    },
    'drift.workshop.create': async (player, name, radius) => {
        if (!player.character || player.character.admin < 6) return;
        const created = await drift.createWorkshop(name, player.position, radius);
        createWorkshopRuntime(created);
        player.call('chat.message.push', [`!{#a5ff5f}Drift workshop #${created.id} создан на вашей позиции`]);
    },

    'drift.setup.purchase': async (player) => {
        if (!player.character) return;
        const vehicle = await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        if (setup.installed) {
            drift.notifyInfo(player, 'Конверсия уже установлена');
            return player.call('drift.setup.purchase.ans', [true, drift.getClientPayload(setup)]);
        }

        const price = drift.config.conversionPrice;
        if (player.character.cash < price) return drift.notifyError(player, 'Недостаточно наличных для drift conversion');

        money.removeCash(player, price, async (result) => {
            if (!result) return drift.notifyError(player, 'Ошибка списания средств');

            setup.installed = true;
            setup.activePreset = 'Street Drift';
            setup.settings = JSON.stringify(drift.builtinPresets['Street Drift']);
            await setup.save();

            const payload = drift.getClientPayload(setup);
            payload.stats = drift.getStats(payload.settings);

            vehicle.setVariable('drift:installed', true);
            vehicle.setVariable('drift:settings', payload.settings);

            player.call('drift.setup.purchase.ans', [true, payload]);
            drift.notifyInfo(player, `Установлен Drift Conversion за $${price}`);
        }, `Drift conversion vehicle #${vehicle.sqlId}`);
    },

    'drift.setup.apply': async (player, settingsRaw) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        if (!setup.installed) return drift.notifyError(player, 'Сначала установите drift conversion');

        const sanitized = drift.sanitizeSettings(parseSettingsPayload(settingsRaw));
        setup.settings = JSON.stringify(sanitized);
        await setup.save();

        vehicle.setVariable('drift:installed', true);
        vehicle.setVariable('drift:settings', sanitized);

        player.call('drift.setup.sync', [{
            settings: sanitized,
            activePreset: setup.activePreset,
            customPresets: drift.getClientPayload(setup).customPresets,
            stats: drift.getStats(sanitized),
        }]);
    },

    'drift.setup.reset': async (player) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        if (!setup.installed) return drift.notifyError(player, 'Сначала установите drift conversion');

        const base = drift.builtinPresets['Street Drift'];
        setup.activePreset = 'Street Drift';
        setup.settings = JSON.stringify(base);
        await setup.save();

        vehicle.setVariable('drift:settings', base);

        player.call('drift.setup.sync', [{
            settings: base,
            activePreset: setup.activePreset,
            customPresets: drift.getClientPayload(setup).customPresets,
            stats: drift.getStats(base),
        }]);
    },

    'drift.preset.save': async (player, presetName, settingsRaw) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        if (!setup.installed) return drift.notifyError(player, 'Drift conversion не установлен');

        const normalizedName = drift.normalizePresetName(presetName);
        if (!normalizedName) return drift.notifyError(player, 'Некорректное название пресета');

        const sanitized = drift.sanitizeSettings(parseSettingsPayload(settingsRaw));
        const presets = drift.getClientPayload(setup).customPresets;
        const existing = presets.find(x => x.name.toLowerCase() === normalizedName.toLowerCase());

        if (!existing && presets.length >= drift.config.maxSavedPresets) {
            return drift.notifyError(player, `Можно сохранить не более ${drift.config.maxSavedPresets} пресетов`);
        }

        if (existing) existing.settings = sanitized;
        else presets.push({ name: normalizedName, settings: sanitized });

        setup.presets = JSON.stringify(presets);
        await setup.save();

        player.call('drift.preset.list', [presets]);
    },

    'drift.preset.load': async (player, presetName) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        if (!setup.installed) return drift.notifyError(player, 'Drift conversion не установлен');

        const payload = drift.getClientPayload(setup);
        const key = String(presetName || '').trim();
        const preset = drift.builtinPresets[key] || payload.customPresets.find(x => x.name === key)?.settings;
        if (!preset) return drift.notifyError(player, 'Пресет не найден');

        const sanitized = drift.sanitizeSettings(preset);
        setup.activePreset = key;
        setup.settings = JSON.stringify(sanitized);
        await setup.save();

        vehicle.setVariable('drift:settings', sanitized);

        player.call('drift.setup.sync', [{
            settings: sanitized,
            activePreset: key,
            customPresets: payload.customPresets,
            stats: drift.getStats(sanitized),
        }]);
    },

    'drift.preset.rename': async (player, oldName, newName) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        const normalizedName = drift.normalizePresetName(newName);
        if (!normalizedName) return drift.notifyError(player, 'Некорректное новое имя');

        const presets = drift.getClientPayload(setup).customPresets;
        const preset = presets.find(x => x.name === oldName);
        if (!preset) return drift.notifyError(player, 'Пресет не найден');

        const duplicate = presets.find(x => x.name.toLowerCase() === normalizedName.toLowerCase());
        if (duplicate && duplicate !== preset) return drift.notifyError(player, 'Пресет с таким именем уже существует');

        preset.name = normalizedName;
        setup.presets = JSON.stringify(presets);
        await setup.save();

        player.call('drift.preset.list', [presets]);
    },

    'drift.preset.delete': async (player, presetName) => {
        if (!player.character) return;
        const vehicle = getCurrentUiVehicle(player) || await resolvePlayerVehicle(player);
        if (!vehicle) return;

        const setup = await drift.getOrCreateSetup(vehicle);
        const presets = drift.getClientPayload(setup).customPresets;
        const index = presets.findIndex(x => x.name === presetName);
        if (index === -1) return drift.notifyError(player, 'Пресет не найден');

        presets.splice(index, 1);
        setup.presets = JSON.stringify(presets);
        if (setup.activePreset === presetName) setup.activePreset = 'Street Drift';
        await setup.save();

        player.call('drift.preset.list', [presets]);
        player.call('drift.setup.sync', [{
            settings: drift.sanitizeSettings(JSON.parse(setup.settings)),
            activePreset: setup.activePreset,
            customPresets: presets,
            stats: drift.getStats(JSON.parse(setup.settings)),
        }]);
    },

    'vehicle.ready': async (player, vehicle, seat) => {
        if (!player.character || seat !== 0) return;
        const validation = drift.canUseVehicle(vehicle, player);
        if (!validation.ok) return player.call('drift.vehicle.state', [null]);

        const setup = await drift.getOrCreateSetup(vehicle);
        if (!setup.installed) return player.call('drift.vehicle.state', [null]);

        const payload = drift.getClientPayload(setup);
        player.call('drift.vehicle.state', [{
            vehicleId: vehicle.sqlId,
            settings: payload.settings,
            activePreset: payload.activePreset,
            stats: drift.getStats(payload.settings),
        }]);

        vehicle.setVariable('drift:installed', true);
        vehicle.setVariable('drift:settings', payload.settings);
    },

    'vehicles.respawn.full': async (oldVehicle) => {
        if (!oldVehicle || !oldVehicle.sqlId) return;
        const setup = await db.Models.VehicleDriftSetup.findOne({ where: { vehicleId: oldVehicle.sqlId } });
        if (!setup || !setup.installed) return;
        oldVehicle.setVariable('drift:installed', true);
        oldVehicle.setVariable('drift:settings', drift.sanitizeSettings(JSON.parse(setup.settings)));
    },
};
