"use strict";

let notifs;
let money;

const BOARD_POS = new mp.Vector3(118.629, -3104.442, 5.701);
const RENT_POS = new mp.Vector3(133.807, -3239.399, 5.857);
const RENT_SPAWN_POS = new mp.Vector3(140.917, -3234.474, 5.857);
const PICKUP_RADIUS = 6;
const DROP_RADIUS = 8;

const CONTRACT_DEPOSIT_K = 0.1;
const MULE_RENT_COST = 1000;
const DELIVERY_SECONDS = 30 * 60;

const CONTRACT_POINTS = [
    {
        pickup: { x: 919.26, y: -1256.17, z: 25.53, name: 'Склад Ла-Меса' },
        dropoff: { x: -428.89, y: -2786.82, z: 5.00, name: 'Терминал Elysian' },
        reward: 15000,
    },
    {
        pickup: { x: 2686.91, y: 3514.26, z: 52.71, name: 'Промзона Сэнди' },
        dropoff: { x: 68.23, y: 6308.42, z: 31.22, name: 'Палето порт' },
        reward: 22000,
    },
    {
        pickup: { x: -513.40, y: -2901.55, z: 5.00, name: 'Док №4' },
        dropoff: { x: 1708.07, y: 4940.75, z: 42.07, name: 'Склад Грейпсид' },
        reward: 26000,
    },
    {
        pickup: { x: 2767.53, y: 1379.72, z: 24.52, name: 'Логистический двор Ron' },
        dropoff: { x: -98.56, y: -2521.48, z: 6.00, name: 'Порт LS' },
        reward: 30000,
    }
];

const sessions = new Map();

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

function chooseContract() {
    const index = Math.floor(Math.random() * CONTRACT_POINTS.length);
    return cloneContractData(CONTRACT_POINTS[index]);
}

function getSession(player) {
    if (!player || !player.character) return null;
    if (!sessions.has(player.id)) {
        sessions.set(player.id, {
            offeredContract: null,
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

    session.offeredContract = null;
    session.contract = null;
    session.rentedVehicle = null;
    session.cargoLoaded = false;
    session.deliveryEndsAt = null;
    session.startBodyHealth = 1000;

    player.call('cargo.delivery.clear', [reason]);
}

function updateBoardData(player) {
    const session = getSession(player);
    if (!session) return;
    if (!session.offeredContract && !session.contract) {
        session.offeredContract = chooseContract();
    }

    const active = session.contract || session.offeredContract;
    if (!active) return;

    player.call('cargo.board.data', [JSON.stringify({
        pickupName: active.pickup.name,
        dropoffName: active.dropoff.name,
        reward: active.reward,
        deposit: active.deposit,
        hasActiveContract: !!session.contract,
        hasRentedVehicle: !!session.rentedVehicle,
        cargoLoaded: !!session.cargoLoaded,
    })]);
}

function createDeliveryColshape(player) {
    const session = getSession(player);
    if (!session || !session.contract) return;

    clearColshape(session.dropoffColshape);
    const target = session.contract.dropoff;
    const shape = mp.colshapes.newSphere(target.x, target.y, target.z, DROP_RADIUS);
    shape.isCargoDropoff = true;
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

    init() {
        if (!ensureModules()) return false;

        mp.blips.new(478, BOARD_POS, { name: 'Доска контрактов', color: 5, shortRange: true, scale: 0.9 });
        mp.blips.new(67, RENT_POS, { name: 'Аренда Mule', color: 3, shortRange: true, scale: 0.9 });

        this.boardColshape = mp.colshapes.newSphere(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z, 1.8);
        this.rentColshape = mp.colshapes.newSphere(RENT_POS.x, RENT_POS.y, RENT_POS.z, 2.2);
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
        if (!session.offeredContract) session.offeredContract = chooseContract();

        const contract = session.offeredContract;
        money.removeCash(player, contract.deposit, (result) => {
            if (!result) return notifs.error(player, 'Недостаточно наличных для покупки контракта', 'Грузоперевозка');

            session.contract = cloneContractData(contract);
            session.offeredContract = chooseContract();
            session.cargoLoaded = false;

            const pickup = session.contract.pickup;
            clearColshape(session.pickupColshape);
            const shape = mp.colshapes.newSphere(pickup.x, pickup.y, pickup.z, PICKUP_RADIUS);
            shape.isCargoPickup = true;
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
