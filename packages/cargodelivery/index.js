"use strict";

let notifs;
let money;

const BOARD_POS = new mp.Vector3(118.629, -3104.442, 5.701);
const RENT_POS = new mp.Vector3(133.807, -3239.399, 5.857);
const RENT_SPAWN_POS = new mp.Vector3(140.917, -3234.474, 5.857);
const SHOWCASE_MULES = [
    { x: 133.58, y: -3244.29, z: 5.86, h: 270 },
    { x: 133.64, y: -3250.66, z: 5.86, h: 270 },
    { x: 133.72, y: -3257.03, z: 5.86, h: 270 },
];
const PICKUP_RADIUS = 6;
const DROP_RADIUS = 8;

const CONTRACT_DEPOSIT_K = 0.1;
const MULE_RENT_COST = 1000;
const DELIVERY_SECONDS = 30 * 60;
const CONTRACT_REFRESH_SECONDS = 20 * 60;

// Полный список маршрутов (для разнообразия)
const CARGO_ROUTES = [
    { pickup: { x: 919.26, y: -1256.17, z: 25.53, name: 'Склад Ла-Меса' }, dropoff: { x: -428.89, y: -2786.82, z: 5.00, name: 'Терминал Elysian' }, reward: 15000 },
    { pickup: { x: 2686.91, y: 3514.26, z: 52.71, name: 'Промзона Сэнди' }, dropoff: { x: 68.23, y: 6308.42, z: 31.22, name: 'Палето порт' }, reward: 22000 },
    { pickup: { x: -513.40, y: -2901.55, z: 5.00, name: 'Док №4' }, dropoff: { x: 1708.07, y: 4940.75, z: 42.07, name: 'Склад Грейпсид' }, reward: 26000 },
    { pickup: { x: 2767.53, y: 1379.72, z: 24.52, name: 'Логистический двор Ron' }, dropoff: { x: -98.56, y: -2521.48, z: 6.00, name: 'Порт LS' }, reward: 30000 },
    { pickup: { x: 1241.66, y: -3179.65, z: 6.02, name: 'Терминал Buccaneer Way' }, dropoff: { x: 2559.67, y: 4669.78, z: 34.08, name: 'Промбаза Кэссиди' }, reward: 28500 },
    { pickup: { x: -552.27, y: 5348.70, z: 74.74, name: 'Лесопилка Палето' }, dropoff: { x: 826.57, y: -2159.35, z: 29.62, name: 'Индастриал LS' }, reward: 27500 },
    { pickup: { x: 1714.29, y: 4783.29, z: 41.98, name: 'Склад Грейпсид' }, dropoff: { x: -248.21, y: 6063.57, z: 31.46, name: 'Рынок Палето' }, reward: 16500 },
    { pickup: { x: 1190.42, y: -3102.10, z: 5.54, name: 'Портовой ангар A1' }, dropoff: { x: 2533.29, y: 2588.45, z: 37.95, name: 'Объездная Harmony' }, reward: 24500 },
    { pickup: { x: 152.54, y: 6374.86, z: 31.37, name: 'Северный терминал' }, dropoff: { x: -1155.29, y: -2031.58, z: 13.16, name: 'Аэропорт грузовой' }, reward: 31500 },
    { pickup: { x: -42.65, y: -1086.83, z: 26.42, name: 'Автохаб Downtown' }, dropoff: { x: 2722.94, y: 3452.11, z: 55.71, name: 'Песчаный склад' }, reward: 26500 },
    { pickup: { x: 1961.54, y: 5176.09, z: 47.64, name: 'Хоздвор Мон-Чиллиад' }, dropoff: { x: -318.51, y: -1535.55, z: 27.54, name: 'Промсклад Дэвис' }, reward: 30500 },
    { pickup: { x: 94.88, y: -2689.96, z: 6.01, name: 'Контейнерный двор' }, dropoff: { x: 1204.28, y: 1853.49, z: 78.94, name: 'Винодельня' }, reward: 23500 },
    { pickup: { x: 2677.18, y: 1452.61, z: 24.50, name: 'Склад Route 68' }, dropoff: { x: -724.38, y: -935.47, z: 19.01, name: 'Топливная база LS' }, reward: 29500 },
    { pickup: { x: -586.27, y: -1777.20, z: 23.18, name: 'Склад Бэнни' }, dropoff: { x: 225.49, y: 1173.03, z: 225.46, name: 'Резервуары Татавиам' }, reward: 25500 },
    { pickup: { x: -2961.45, y: 419.53, z: 15.24, name: 'Берег Чумаш' }, dropoff: { x: 1132.18, y: -1302.19, z: 34.74, name: 'Центральный госпиталь склад' }, reward: 32000 },
    { pickup: { x: 382.11, y: 3584.22, z: 33.29, name: 'Склад Grand Senora' }, dropoff: { x: -1078.09, y: -1678.10, z: 4.58, name: 'Лодочный терминал' }, reward: 27000 },
    { pickup: { x: 1728.47, y: 6408.01, z: 35.04, name: 'Логцентр Палето' }, dropoff: { x: 997.90, y: -1868.23, z: 31.04, name: 'Промзона Ла-Меса' }, reward: 34000 },
    { pickup: { x: -1229.92, y: -329.23, z: 37.79, name: 'Деловой док Del Perro' }, dropoff: { x: 2885.79, y: 4382.25, z: 50.30, name: 'Ветряки Рон-Альтернатс' }, reward: 33500 },
    { pickup: { x: 172.71, y: -3199.28, z: 5.79, name: 'Морской склад B4' }, dropoff: { x: -2070.88, y: -317.56, z: 13.31, name: 'Северный Chumash depot' }, reward: 31000 },
    { pickup: { x: 2570.88, y: 320.49, z: 108.46, name: 'Паллеты East Joshua' }, dropoff: { x: -146.78, y: -1698.40, z: 32.87, name: 'Склад Бенсон Докс' }, reward: 28000 },
];

const sessions = new Map();
const boardState = {
    routeIndex: 0,
    nextRefreshAt: 0,
    timer: null,
};

function ensureModules() {
    if (!notifs) notifs = call('notifications');
    if (!money) money = call('money');
    return !!(notifs && money);
}

function cloneContractData(template) {
    return {
        pickup: { ...template.pickup },
        dropoff: { ...template.dropoff },
        reward: template.reward,
        deposit: Math.ceil(template.reward * CONTRACT_DEPOSIT_K),
    };
}

function getCurrentBoardContract() {
    const route = CARGO_ROUTES[boardState.routeIndex] || CARGO_ROUTES[0];
    return cloneContractData(route);
}

function getSession(player) {
    if (!player || !player.character) return null;
    if (!sessions.has(player.id)) {
        sessions.set(player.id, {
            contract: null,
            rentedVehicle: null,
            cargoLoaded: false,
            deliveryEndsAt: null,
            pickupColshape: null,
            dropoffColshape: null,
            timer: null,
            startBodyHealth: 1000,
        });
    }
    return sessions.get(player.id);
}

function clearColshape(colshape) {
    if (!colshape) return;
    try {
        if (mp.colshapes.exists(colshape)) colshape.destroy();
    } catch (e) {
        // ignore
    }
}

function clearSessionProgress(player, reason = null) {
    const session = getSession(player);
    if (!session) return;

    clearColshape(session.pickupColshape);
    clearColshape(session.dropoffColshape);
    session.pickupColshape = null;
    session.dropoffColshape = null;

    if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
    }

    if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle)) {
        session.rentedVehicle.destroy();
    }

    session.contract = null;
    session.rentedVehicle = null;
    session.cargoLoaded = false;
    session.deliveryEndsAt = null;
    session.startBodyHealth = 1000;

    player.call('cargo.delivery.clear', [reason]);
}

function secondsToRefresh() {
    return Math.max(0, Math.ceil((boardState.nextRefreshAt - Date.now()) / 1000));
}

function updateBoardData(player) {
    const session = getSession(player);
    if (!session) return;

    const active = session.contract || getCurrentBoardContract();
    player.call('cargo.board.data', [JSON.stringify({
        pickupName: active.pickup.name,
        dropoffName: active.dropoff.name,
        reward: active.reward,
        deposit: active.deposit,
        hasActiveContract: !!session.contract,
        hasRentedVehicle: !!session.rentedVehicle,
        cargoLoaded: !!session.cargoLoaded,
        refreshInSeconds: secondsToRefresh(),
        routesCount: CARGO_ROUTES.length,
    })]);
}

function updateBoardsForAllPlayers() {
    mp.players.forEach((player) => {
        if (!player.character) return;
        updateBoardData(player);
    });
}

function rotateBoardContract(notifyPlayers = false) {
    const old = boardState.routeIndex;
    if (CARGO_ROUTES.length <= 1) boardState.routeIndex = 0;
    else {
        do {
            boardState.routeIndex = Math.floor(Math.random() * CARGO_ROUTES.length);
        } while (boardState.routeIndex === old);
    }
    boardState.nextRefreshAt = Date.now() + CONTRACT_REFRESH_SECONDS * 1000;
    updateBoardsForAllPlayers();

    if (notifyPlayers) {
        mp.players.forEach((player) => {
            if (!player.character) return;
            const session = getSession(player);
            if (session && session.contract) return;
            notifs.info(player, 'На доске появился новый контракт на грузоперевозку', 'Грузоперевозка');
        });
    }
}

function createDeliveryColshape(player) {
    const session = getSession(player);
    if (!session || !session.contract) return;

    clearColshape(session.dropoffColshape);
    const target = session.contract.dropoff;
    const shape = mp.colshapes.newSphere(target.x, target.y, target.z, DROP_RADIUS);
    shape.ownerId = player.id;
    session.dropoffColshape = shape;

    player.call('cargo.delivery.dropoff.set', [target.x, target.y, target.z]);
}

function startDeliveryTimer(player) {
    const session = getSession(player);
    if (!session) return;

    session.deliveryEndsAt = Date.now() + DELIVERY_SECONDS * 1000;
    session.timer = setTimeout(() => {
        if (!mp.players.exists(player)) return;
        notifs.error(player, 'Время доставки истекло. Контракт аннулирован.', 'Грузоперевозка');
        clearSessionProgress(player, 'time');
    }, DELIVERY_SECONDS * 1000);

    player.call('cargo.delivery.timer.start', [DELIVERY_SECONDS]);
}

module.exports = {
    boardColshape: null,
    rentColshape: null,
    boardMarker: null,
    rentMarker: null,
    boardLabel: null,
    rentLabel: null,
    showcaseVehicles: [],

    init() {
        if (!ensureModules()) return false;

        mp.blips.new(478, BOARD_POS, { name: 'Доска контрактов', color: 5, shortRange: true, scale: 0.9 });
        mp.blips.new(67, RENT_POS, { name: 'Аренда Mule', color: 3, shortRange: true, scale: 0.9 });

        this.boardMarker = mp.markers.new(1, new mp.Vector3(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z - 1), 1.3, { color: [61, 161, 255, 120] });
        this.rentMarker = mp.markers.new(1, new mp.Vector3(RENT_POS.x, RENT_POS.y, RENT_POS.z - 1), 1.6, { color: [90, 220, 110, 120] });

        this.boardLabel = mp.labels.new('~w~Доска контрактов\n~g~Нажмите E', new mp.Vector3(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z + 1.05), {
            los: false,
            drawDistance: 15,
            dimension: 0,
        });
        this.rentLabel = mp.labels.new('~w~Аренда Mule ($1000)\n~g~Нажмите E', new mp.Vector3(RENT_POS.x, RENT_POS.y, RENT_POS.z + 1.05), {
            los: false,
            drawDistance: 18,
            dimension: 0,
        });

        this.boardColshape = mp.colshapes.newSphere(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z, 1.8);
        this.rentColshape = mp.colshapes.newSphere(RENT_POS.x, RENT_POS.y, RENT_POS.z, 2.2);

        this.showcaseVehicles = [];
        SHOWCASE_MULES.forEach((pos, i) => {
            const veh = mp.vehicles.new(mp.joaat('mule'), new mp.Vector3(pos.x, pos.y, pos.z), {
                heading: pos.h,
                numberPlate: `RENT${i + 1}`,
                locked: true,
                engine: false,
                dimension: 0,
            });
            veh.setVariable('static', true);
            this.showcaseVehicles.push(veh);
        });

        rotateBoardContract(false);
        if (boardState.timer) clearInterval(boardState.timer);
        boardState.timer = setInterval(() => rotateBoardContract(true), CONTRACT_REFRESH_SECONDS * 1000);

        console.log(`[CARGO DELIVERY] Маршрутов загружено: ${CARGO_ROUTES.length}. Обновление доски: ${CONTRACT_REFRESH_SECONDS / 60} минут.`);
        return true;
    },

    onBoardEnter(player) {
        const session = getSession(player);
        if (!session) return;
        updateBoardData(player);
        player.call('cargo.board.state', [true]);
    },

    onBoardExit(player) {
        player.call('cargo.board.state', [false]);
    },

    onRentEnter(player) {
        const session = getSession(player);
        if (!session) return;
        player.call('cargo.rent.state', [true]);
        player.call('cargo.rent.data', [JSON.stringify({
            rentPrice: MULE_RENT_COST,
            hasActiveContract: !!session.contract,
            hasVehicle: !!session.rentedVehicle,
        })]);
    },

    onRentExit(player) {
        player.call('cargo.rent.state', [false]);
    },

    acceptContract(player) {
        if (!ensureModules()) return;
        const session = getSession(player);
        if (!session) return;
        if (session.contract) return notifs.error(player, 'У вас уже есть активный контракт', 'Грузоперевозка');

        const contract = getCurrentBoardContract();
        money.removeCash(player, contract.deposit, (result) => {
            if (!result) return notifs.error(player, 'Недостаточно наличных для покупки контракта', 'Грузоперевозка');

            session.contract = cloneContractData(contract);
            session.cargoLoaded = false;

            const pickup = session.contract.pickup;
            clearColshape(session.pickupColshape);
            const shape = mp.colshapes.newSphere(pickup.x, pickup.y, pickup.z, PICKUP_RADIUS);
            shape.ownerId = player.id;
            session.pickupColshape = shape;

            player.call('cargo.delivery.pickup.set', [pickup.x, pickup.y, pickup.z]);
            updateBoardData(player);
            notifs.success(player, `Контракт куплен за $${contract.deposit}. Арендуйте Mule и заберите груз.`, 'Грузоперевозка');
        }, 'Покупка контракта на перевозку груза');
    },

    rentMule(player) {
        if (!ensureModules()) return;
        const session = getSession(player);
        if (!session || !session.contract) return notifs.error(player, 'Сначала возьмите контракт на доске', 'Грузоперевозка');
        if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle)) {
            return notifs.error(player, 'У вас уже арендован Mule', 'Грузоперевозка');
        }

        money.removeCash(player, MULE_RENT_COST, (result) => {
            if (!result) return notifs.error(player, 'Недостаточно наличных для аренды Mule', 'Грузоперевозка');

            const veh = mp.vehicles.new(mp.joaat('mule'), RENT_SPAWN_POS, {
                heading: 269,
                numberPlate: 'CARGO',
                locked: false,
                engine: false,
                dimension: player.dimension,
            });

            veh.cargoOwnerId = player.id;
            session.rentedVehicle = veh;
            session.startBodyHealth = 1000;

            player.call('cargo.rent.data', [JSON.stringify({
                rentPrice: MULE_RENT_COST,
                hasActiveContract: true,
                hasVehicle: true,
            })]);
            notifs.success(player, 'Mule арендован. Езжайте на точку погрузки.', 'Грузоперевозка');
        }, 'Аренда Mule для грузоперевозки');
    },

    onPlayerEnterColshape(player, shape) {
        const session = getSession(player);
        if (!session || !session.contract) return;

        if (shape === session.pickupColshape) {
            if (!player.vehicle || player.vehicle.driver !== player) return;
            if (!session.rentedVehicle || player.vehicle !== session.rentedVehicle) {
                return notifs.error(player, 'Забрать груз можно только на арендованном Mule', 'Грузоперевозка');
            }
            if (session.cargoLoaded) return;

            session.cargoLoaded = true;
            session.startBodyHealth = Math.max(300, player.vehicle.bodyHealth || 1000);
            clearColshape(session.pickupColshape);
            session.pickupColshape = null;

            createDeliveryColshape(player);
            startDeliveryTimer(player);
            notifs.success(player, 'Груз загружен. Доставьте его в пункт назначения за 30 минут.', 'Грузоперевозка');
            updateBoardData(player);
            return;
        }

        if (shape === session.dropoffColshape) {
            if (!session.cargoLoaded) return;
            if (!player.vehicle || player.vehicle.driver !== player || player.vehicle !== session.rentedVehicle) return;

            const vehicle = session.rentedVehicle;
            const currentHealth = Math.max(0, vehicle.bodyHealth || 0);
            const healthFactor = Math.max(0.35, Math.min(1, currentHealth / session.startBodyHealth));
            const finalReward = Math.max(0, Math.round(session.contract.reward * healthFactor));

            money.addCash(player, finalReward, (result) => {
                if (result) {
                    notifs.success(player, `Доставка завершена. Выплата: $${finalReward} (сохранность ${(healthFactor * 100).toFixed(0)}%)`, 'Грузоперевозка');
                } else {
                    notifs.error(player, 'Ошибка начисления выплаты', 'Грузоперевозка');
                }
                clearSessionProgress(player, 'success');
            }, 'Выплата за доставку груза');
        }
    },

    cleanupPlayer(player) {
        clearSessionProgress(player);
        sessions.delete(player.id);
    },
};
