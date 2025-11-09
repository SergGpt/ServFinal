"use strict";

let notifs;
let money;
let jobs;
let prompt;
let vehiclesModule;
let initialized = false;

function ensureModules() {
    if (!notifs || !money || !jobs || !prompt || !vehiclesModule) {
        const callFn = typeof global.call === 'function' ? global.call : null;
        if (!callFn) return false;
        if (!notifs) notifs = callFn('notifications');
        if (!money) money = callFn('money');
        if (!jobs) jobs = callFn('jobs');
        if (!prompt) prompt = callFn('prompt');
        if (!vehiclesModule) vehiclesModule = callFn('vehicles');
    }
    return true;
}

const JOB_ID = 11;
const START_POS = new mp.Vector3(158.976, -3082.372, 6.014);
const START_RADIUS = 1.5;
const DELIVERY_POS = new mp.Vector3(126.815, -3105.666, 5.595);
const DELIVERY_RADIUS = 4;
const DELIVERY_MARKER_HEIGHT = 4.095;

function resolveVehicleProperties(modelName) {
    const defaultProps = {
        name: modelName,
        maxFuel: 80,
        consumption: 1.5,
        license: 1,
        price: 100000,
        vehType: 0,
        isElectric: 0,
        trunkType: 1,
    };

    if (!vehiclesModule || typeof vehiclesModule.getVehiclePropertiesByModel !== 'function') {
        return defaultProps;
    }

    try {
        return vehiclesModule.getVehiclePropertiesByModel(modelName) || defaultProps;
    } catch (err) {
        console.log('[AUTOROOBER] Failed to resolve vehicle properties:', err);
        return defaultProps;
    }
}

const VEHICLE_TIERS = {
    low: ["dilettante", "blade", "picador", "virgo", "voodoo"],
    mid: ["blista", "prairie", "oracle", "sentinel", "rancherxl"],
    high: ["baller", "dubsta", "cog55", "alpha", "buffalo"],
    top: ["bestiagts", "ninef", "raiden", "bullet", "carbonizzare"],
};

const REWARD_TIERS = {
    low: [100, 100, 100, 100, 100],
    mid: [200, 200, 200, 200, 200],
    high: [300, 300, 300, 300, 300],
    top: [400, 400, 400, 400, 400],
};

const SKILL_STAGES = [
    { min: 0, max: 25 },
    { min: 26, max: 50 },
    { min: 51, max: 75 },
    { min: 76, max: 100 },
];

const SKILL_EXP_REWARD = [0.5, 0.25, 0.125, 0.0625];

const ORDER_TIME_SETTINGS = [
    { radius: 270.0, seconds: 1200 },
    { radius: 350.0, seconds: 1500 },
    { radius: 400.0, seconds: 1800 },
];

const VEHICLE_POSITIONS = [
    { x: 1691.173, y: 3288.316, z: 40.311, heading: 34 },
    { x: 1716.905, y: 3322.305, z: 40.387, heading: 13.366 },
    { x: 1747.404, y: 3323.445, z: 40.314, heading: 298.102 },
    { x: 1551.363, y: 3515.973, z: 35.155, heading: 114.643 },
    { x: 1357.61, y: 3616.541, z: 34.051, heading: 107.543 },
    { x: 895.187, y: 3571.604, z: 32.76, heading: 270.973 },
    { x: 384.396, y: 3562.908, z: 32.461, heading: 82.017 },
    { x: 347.199, y: 3392.124, z: 35.567, heading: 292.02 },
    { x: 523.885, y: 3090.019, z: 39.629, heading: 64.248 },
    { x: 638.094, y: 2776.056, z: 41.15, heading: 183.798 },
    { x: 1040.39, y: 2239.356, z: 43.379, heading: 182.525 },
    { x: 1138.514, y: 2098.512, z: 54.959, heading: 89.474 },
    { x: 1238.329, y: 1858.193, z: 78.52, heading: 133.736 },
    { x: 809.592, y: 2154.42, z: 51.442, heading: 155.947 },
    { x: 355.224, y: 2558.453, z: 42.684, heading: 294.981 },
    { x: 193.499, y: 2760.367, z: 42.591, heading: 6.786 },
    { x: 110.345, y: 3679.376, z: 38.919, heading: 359.544 },
    { x: 95.94, y: 3761.342, z: 38.634, heading: 246.872 },
    { x: 22.464, y: 3658.412, z: 38.977, heading: 62.389 },
    { x: -2175.584, y: 4274.257, z: 48.213, heading: 330.808 },
    { x: -3045.681, y: 538.53, z: 2.534, heading: 90.183 },
    { x: -805.454, y: 5389.937, z: 33.681, heading: 172.446 },
    { x: -394.259, y: 6076.446, z: 30.665, heading: 47.557 },
    { x: -442.12, y: 6137.016, z: 30.643, heading: 45.888 },
    { x: -106.528, y: 6365.91, z: 30.643, heading: 134.375 },
    { x: -116.051, y: 6351.192, z: 30.655, heading: 315.253 },
    { x: -193.962, y: 6268.169, z: 30.653, heading: 133.055 },
    { x: -290.214, y: 6182.125, z: 30.656, heading: 46.037 },
    { x: -287.745, y: 6303.367, z: 30.656, heading: 315.167 },
    { x: 2907.129, y: 4340.364, z: 49.457, heading: 204.615 },
    { x: 2975.161, y: 3484.954, z: 70.606, heading: 93.334 },
    { x: 2652.14, y: 3499.742, z: 53.067, heading: 337.748 },
    { x: 2572.875, y: 3174.467, z: 49.992, heading: 323.644 },
    { x: 2409.457, y: 3034.031, z: 47.317, heading: 181.019 },
    { x: 2343.236, y: 3142.56, z: 47.372, heading: 169.008 },
    { x: 1297.765, y: 323.534, z: 81.155, heading: 236.246 },
    { x: 1034.477, y: -144.587, z: 73.352, heading: 133.289 },
    { x: 981.823, y: -147.005, z: 73.403, heading: 237.107 },
    { x: 955.839, y: -197.941, z: 72.351, heading: 58.122 },
    { x: 875.283, y: -961.174, z: 25.448, heading: 270.229 },
];

const orders = new Map();
const occupiedPositions = new Set();
let startColshape = null;
let deliveryColshape = null;
let startBlip = null;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getTierIndex(exp) {
    for (let i = 0; i < SKILL_STAGES.length; i++) {
        const stage = SKILL_STAGES[i];
        if (exp >= stage.min && exp <= stage.max) return i;
    }
    return 0;
}

function getTierKey(index) {
    return ['low', 'mid', 'high', 'top'][index] || 'low';
}

function getFreePositionIndex() {
    if (occupiedPositions.size >= VEHICLE_POSITIONS.length) return -1;

    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
        const idx = getRandomInt(0, VEHICLE_POSITIONS.length - 1);
        if (!occupiedPositions.has(idx)) return idx;
    }

    for (let i = 0; i < VEHICLE_POSITIONS.length; i++) {
        if (!occupiedPositions.has(i)) return i;
    }
    return -1;
}

function getVehicleModel(tierKey, variant) {
    const tier = VEHICLE_TIERS[tierKey];
    if (!tier) return VEHICLE_TIERS.low[0];
    return tier[variant % tier.length];
}

function getVehicleReward(tierKey, variant) {
    const tier = REWARD_TIERS[tierKey];
    if (!tier) return REWARD_TIERS.low[0];
    return tier[variant % tier.length];
}

function ensureJob(player, options = {}) {
    if (!ensureModules()) return false;
    if (!player.character) return false;

    if (player.character.job === JOB_ID) return true;

    const { autoHire = false } = options;

    if (!autoHire) {
        notifs.error(player, 'Вы не работаете автоугонщиком', 'Автоугон');
        return false;
    }

    if (player.character.job && player.character.job !== JOB_ID) {
        const currentJob = jobs.getJob(player.character.job);
        const suffix = currentJob ? `работы "${currentJob.name}"` : 'другой работы';
        notifs.error(player, `Сначала увольтесь с ${suffix}`, 'Автоугон');
        return false;
    }

    const jobData = jobs.getJob(JOB_ID);
    if (!jobData) {
        notifs.error(player, 'Работа временно недоступна', 'Автоугон');
        return false;
    }

    jobs.addMember(player, jobData);

    if (player.character.job !== JOB_ID) {
        notifs.error(player, 'Не удалось оформить трудоустройство', 'Автоугон');
        return false;
    }

    notifs.success(player, 'Вы устроились на работу', jobData.name || 'Автоугонщик');
    return true;
}

function getSkillData(player) {
    const skill = jobs.getJobSkill(player, JOB_ID);
    if (!skill) return { exp: 0, tierIndex: 0 };
    const tierIndex = getTierIndex(skill.exp);
    return { exp: skill.exp, tierIndex };
}

function formatOrder(order) {
    if (!order) return null;
    return {
        spawn: order.spawn,
        baseReward: order.baseReward,
        expireAt: order.expireAt,
    };
}

function getOrder(player) {
    return orders.get(player.id);
}

function clearOrder(player, reason = null, notify = true) {
    if (!ensureModules()) return;
    const order = orders.get(player.id);
    if (!order) return;

    if (order.timer) {
        clearTimeout(order.timer);
    }

    if (order.vehicle && mp.vehicles.exists(order.vehicle)) {
        if (order.vehicle.autoRobberPlayerId === player.id && mp.players.exists(player) && player.vehicle === order.vehicle) {
            player.removeFromVehicle();
        }
        order.vehicle.destroy();
    }

    if (order.spawnIndex !== null && occupiedPositions.has(order.spawnIndex)) {
        occupiedPositions.delete(order.spawnIndex);
    }

    orders.delete(player.id);
    delete player.autorooberOrder;

    if (mp.players.exists(player)) {
        player.call('autoroober.order.clear', [reason || 'cancel']);
        player.call('autoroober.menu.forceClose');

        if (notify && reason === 'time') {
            notifs.error(player, 'Вы не уложились в отведённое время', 'Автоугон');
        } else if (notify && reason === 'vehicle') {
            notifs.error(player, 'Транспорт уничтожен', 'Автоугон');
        }
    }
}

function calculateFinalReward(order) {
    if (!order.vehicle || !mp.vehicles.exists(order.vehicle)) return 0;
    const health = Math.max(0, order.vehicle.bodyHealth || 0);
    const multiplier = order.baseReward / 1000;
    return Math.max(0, Math.round(health * multiplier));
}

function expireOrder(player, reason = 'time') {
    const order = getOrder(player);
    if (!order) return;
    clearOrder(player, reason, true);
}

function createOrder(player) {
    if (!ensureModules()) return;
    if (!ensureJob(player, { autoHire: true })) return;
    if (getOrder(player)) {
        notifs.error(player, 'У вас уже есть активный заказ', 'Автоугон');
        return;
    }
    if (player.vehicle) {
        notifs.error(player, 'Покиньте транспорт', 'Автоугон');
        return;
    }

    const { tierIndex } = getSkillData(player);
    const tierKey = getTierKey(tierIndex);

    const variant = getRandomInt(0, VEHICLE_TIERS.low.length - 1);
    const posIndex = getFreePositionIndex();
    if (posIndex === -1) {
        notifs.error(player, 'Сейчас нет свободных заказов', 'Автоугон');
        return;
    }

    const position = VEHICLE_POSITIONS[posIndex];
    const modelName = getVehicleModel(tierKey, variant);
    const reward = getVehicleReward(tierKey, variant);
    const timeSettings = ORDER_TIME_SETTINGS[getRandomInt(0, ORDER_TIME_SETTINGS.length - 1)];

    const color = getRandomInt(0, 255);
    const vehicle = mp.vehicles.new(mp.joaat(modelName), new mp.Vector3(position.x, position.y, position.z), {
        heading: position.heading,
        numberPlate: 'Robbery',
        color: [[color, color, color], [color, color, color]],
        dimension: 0,
    });

    vehicle.autoRobberPlayerId = player.id;
    vehicle.locked = false;
    vehicle.autoRobberUnlocked = false;
    const vehicleProps = resolveVehicleProperties(modelName);
    vehicle.properties = vehicleProps;
    vehicle.maxFuel = vehicleProps.maxFuel || 80;
    vehicle.fuel = vehicleProps.maxFuel || 80;
    vehicle.consumption = vehicleProps.consumption || 1.5;
    vehicle.trunkType = vehicleProps.trunkType || 1;

    const now = Date.now();
    const expireAt = now + timeSettings.seconds * 1000;

    const order = {
        playerId: player.id,
        spawnIndex: posIndex,
        spawn: { x: position.x, y: position.y, z: position.z },
        baseReward: reward,
        vehicle,
        vehicleModel: modelName,
        tierIndex,
        expireAt,
        timer: setTimeout(() => {
            if (!mp.players.exists(player)) return;
            expireOrder(player, 'time');
            notifs.error(player, 'Вы не успели вернуть автомобиль', 'Автоугон');
        }, timeSettings.seconds * 1000),
    };

    orders.set(player.id, order);
    occupiedPositions.add(posIndex);
    player.autorooberOrder = order;

    player.call('autoroober.order.prepare');

    setTimeout(() => {
        if (!mp.players.exists(player)) {
            clearOrderData(order);
            return;
        }
        player.call('autoroober.order.created', [
            order.spawn.x,
            order.spawn.y,
            order.spawn.z,
            timeSettings.seconds,
            order.vehicleModel,
            vehicle,
            order.baseReward,
            DELIVERY_POS.x,
            DELIVERY_POS.y,
            DELIVERY_POS.z,
        ]);
        notifs.info(player, `Ты должен найти ${order.vehicleModel.toUpperCase()} и доставить в порт`, 'Симон');
    }, 15000);
}

function clearOrderData(order) {
    if (!order) return;
    if (order.timer) clearTimeout(order.timer);
    if (order.vehicle && mp.vehicles.exists(order.vehicle)) {
        order.vehicle.destroy();
    }
    if (order.spawnIndex !== null && occupiedPositions.has(order.spawnIndex)) {
        occupiedPositions.delete(order.spawnIndex);
    }
    orders.delete(order.playerId);
}

function completeOrder(player) {
    if (!ensureModules()) return;
    const order = getOrder(player);
    if (!order) return;
    if (!player.vehicle || player.vehicle !== order.vehicle) return;

    const reward = calculateFinalReward(order);

    clearOrder(player, 'success', false);

    const finalReward = reward * jobs.bonusPay;
    money.addCash(player, finalReward, (result) => {
        if (!result) {
            notifs.error(player, 'Ошибка начисления наличных', 'Автоугон');
            return;
        }
        const tierExp = SKILL_EXP_REWARD[order.tierIndex] || 0.05;
        jobs.addJobExp(player, tierExp, JOB_ID);
        notifs.success(player, `Вы заработали $${finalReward}`, 'Автоугон');
        player.call('autoroober.order.completed', [finalReward]);
    }, `Оплата автоугона (${player.name})`);
}

function onVehicleStartEnter(player, vehicle) {
    if (!ensureModules()) return;
    const order = getOrder(player);
    if (!order) return;
    if (vehicle !== order.vehicle) return;
    if (vehicle.robbing) return;
    if (vehicle.autoRobberUnlocked) return;

    vehicle.robbing = true;
    const hackDuration = getRandomInt(20, 35);
    player.call('autoroober.vehicle.hack', [hackDuration]);
    setTimeout(() => {
        if (!mp.players.exists(player)) return;
        if (!mp.vehicles.exists(vehicle)) return;
        vehicle.robbing = false;
        vehicle.autoRobberUnlocked = true;
    }, hackDuration * 1000);
}

function onVehicleEnter(player, vehicle, seat) {
    if (!ensureModules()) return;
    if (seat !== 0) return;
    if (!vehicle.autoRobberPlayerId) return;
    if (vehicle.autoRobberPlayerId !== player.id) {
        notifs.error(player, 'У вас нет ключей от этого транспорта', 'Автоугон');
        player.removeFromVehicle();
        return;
    }
}

function handleVehicleDestroyed(vehicle) {
    if (!ensureModules()) return;
    const playerId = vehicle.autoRobberPlayerId;
    if (!playerId) return;
    const order = orders.get(playerId);
    if (!order) return;
    const player = mp.players.at(playerId);
    if (player && mp.players.exists(player)) {
        clearOrder(player, 'vehicle', true);
    } else {
        clearOrderData(order);
        orders.delete(playerId);
    }
}

function cleanupPlayer(player) {
    if (!ensureModules()) return;
    const order = getOrder(player);
    if (!order) return;
    clearOrder(player, 'cancel', false);
}

function init() {
    if (!ensureModules()) {
        return false;
    }
    if (initialized) return true;
    startBlip = mp.blips.new(669, START_POS, {
        name: 'Автоугон',
        color: 1,
        shortRange: true,
    });

    startColshape = mp.colshapes.newSphere(START_POS.x, START_POS.y, START_POS.z, START_RADIUS);
    startColshape.autorooberStart = true;

    deliveryColshape = mp.colshapes.newSphere(DELIVERY_POS.x, DELIVERY_POS.y, DELIVERY_POS.z, DELIVERY_RADIUS);
    deliveryColshape.autorooberDelivery = true;

    mp.markers.new(1, new mp.Vector3(DELIVERY_POS.x, DELIVERY_POS.y, DELIVERY_MARKER_HEIGHT), DELIVERY_RADIUS, {
        color: [0, 125, 255, 175],
    });

    mp.events.add('vehicleDestroyed', handleVehicleDestroyed);
    initialized = true;
    return true;
}

function onStartColshapeEnter(player) {
    if (!ensureModules()) return;
    if (!player.character) return;
    if (player.vehicle) return notifs.error(player, 'Выйдите из транспорта', 'Автоугон');

    const promptText = player.character.job === JOB_ID
        ? 'Нажмите <span>E</span>, чтобы открыть меню автоугона'
        : 'Нажмите <span>E</span>, чтобы начать работу автоугонщиком';

    prompt.show(player, promptText);
    player.call('autoroober.menu.state', [true]);
}

function onStartColshapeExit(player) {
    if (!ensureModules()) return;
    if (!player.character) return;
    prompt.hide(player);
    player.call('autoroober.menu.state', [false]);
    player.call('autoroober.menu.forceClose');
}

module.exports = {
    init,
    get startColshape() {
        return startColshape;
    },
    get deliveryColshape() {
        return deliveryColshape;
    },
    onStartColshapeEnter,
    onStartColshapeExit,
    createOrder,
    expireOrder,
    completeOrder,
    cleanupPlayer,
    onVehicleStartEnter,
    onVehicleEnter,
};
