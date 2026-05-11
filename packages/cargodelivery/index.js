"use strict";

let notifs;
let money;
let vehiclesModule;

const BOARD_POS = new mp.Vector3(-739.9175415039062, -2562.908447265625, 13.955526351928711);
const RENT_POS = new mp.Vector3(-748.768798828125, -2565.418701171875, 13.89966106414795);
const RENT_SPAWN_POS = new mp.Vector3(-747.4849243164062, -2572.3525390625, 13.857550621032715);
const RENT_SPAWN_HEADING = 180;
const SHOWCASE_MULES = [];
const PICKUP_RADIUS = 6;
const DROP_RADIUS = 8;

const CONTRACT_DEPOSIT_K = 0.1;
const MULE_RENT_COST = 1000;
const DELIVERY_SECONDS = 30 * 60;
const CONTRACT_REFRESH_SECONDS = 20 * 60;
const CARGO_JOB_ID = 4;
const CARGO_JOB_OWNER_ID = 13;
const RENT_SECONDS = 2 * 60 * 60;
const RENT_WARN_SECONDS = [10 * 60, 5 * 60, 60];
const RENT_DESTROY_DELAY_SECONDS = 2 * 60;

let cargoRoutes = [];

const sessions = new Map();
const boardState = {
    routeIndex: 0,
    nextRefreshAt: 0,
    timer: null,
};

function ensureModules() {
    if (!notifs) notifs = call('notifications');
    if (!money) money = call('money');
    if (!vehiclesModule) vehiclesModule = call('vehicles');
    return !!(notifs && money && vehiclesModule);
}


function resolveVehicleProperties(modelName) {
    const fallback = {
        name: modelName,
        maxFuel: 80,
        consumption: 2,
        license: 2,
        price: 50000,
        vehType: 1,
        isElectric: 0,
        trunkType: 3,
    };

    if (!vehiclesModule || typeof vehiclesModule.getVehiclePropertiesByModel !== 'function') {
        return fallback;
    }

    try {
        const props = vehiclesModule.getVehiclePropertiesByModel(modelName);
        return props || fallback;
    } catch (err) {
        return fallback;
    }
}

function parseDropoffs(raw) {
    try {
        const points = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(points) ? points : [];
    } catch (e) {
        return [];
    }
}

function routeToContractData(route) {
    if (!route) return null;
    const dropoffs = parseDropoffs(route.dropoffs);
    return {
        routeId: route.id,
        pickup: {
            x: route.pickupX,
            y: route.pickupY,
            z: route.pickupZ,
            name: route.pickupName,
        },
        dropoffs: dropoffs.map((point, index) => ({
            x: point.x,
            y: point.y,
            z: point.z,
            name: point.name || `Точка доставки #${index + 1}`,
        })),
        reward: route.reward,
        deposit: Math.ceil(route.reward * CONTRACT_DEPOSIT_K),
    };
}

function cloneContractData(template) {
    if (!template) return null;
    return {
        routeId: template.routeId,
        pickup: { ...template.pickup },
        dropoffs: template.dropoffs.map(point => ({ ...point })),
        reward: template.reward,
        deposit: Math.ceil(template.reward * CONTRACT_DEPOSIT_K),
    };
}

function getCurrentBoardContract() {
    const route = cargoRoutes[boardState.routeIndex] || cargoRoutes[0];
    return cloneContractData(routeToContractData(route));
}

function getCurrentDropoff(session) {
    if (!session || !session.contract || !session.contract.dropoffs.length) return null;
    return session.contract.dropoffs[session.currentDropoffIndex || 0];
}


async function loadRoutesFromDB() {
    const rows = await db.Models.CargoDeliveryRoute.findAll({
        where: { isActive: 1 },
        order: [['id', 'ASC']]
    });
    cargoRoutes = rows.filter(route => parseDropoffs(route.dropoffs).length > 0);
    if (boardState.routeIndex >= cargoRoutes.length) boardState.routeIndex = 0;
}

function isCargoWorker(player) {
    return !!(player && player.character && player.character.job == CARGO_JOB_ID);
}

function getRouteSummary(route) {
    const dropoffs = parseDropoffs(route.dropoffs);
    return {
        id: route.id,
        pickupName: route.pickupName,
        reward: route.reward,
        isActive: route.isActive,
        dropoffCount: dropoffs.length,
    };
}

async function createRouteFromPlayer(player) {
    const pos = player.position;
    const route = await db.Models.CargoDeliveryRoute.create({
        pickupName: `Погрузка #${Date.now()}`,
        pickupX: pos.x,
        pickupY: pos.y,
        pickupZ: pos.z,
        dropoffs: '[]',
        reward: 15000,
        isActive: 1,
    });
    await loadRoutesFromDB();
    return route;
}

async function addDropoffFromPlayer(routeId, player) {
    const route = await db.Models.CargoDeliveryRoute.findByPk(routeId);
    if (!route) return null;

    const pos = player.position;
    const dropoffs = parseDropoffs(route.dropoffs);
    dropoffs.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        name: `Доставка #${dropoffs.length + 1}`,
    });
    route.dropoffs = JSON.stringify(dropoffs);
    await route.save();
    await loadRoutesFromDB();
    return route;
}

async function setRouteReward(routeId, reward) {
    const route = await db.Models.CargoDeliveryRoute.findByPk(routeId);
    if (!route) return null;
    route.reward = reward;
    await route.save();
    await loadRoutesFromDB();
    return route;
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
            pickupInside: false,
            rentedVehicleDbId: null,
            rentedVehiclePlate: null,
            rentExpiresAt: null,
            rentWarnTimers: [],
            rentExpireTimer: null,
            rentDestroyTimer: null,
            currentDropoffIndex: 0,
        });
    }
    return sessions.get(player.id);
}



function distance3d(posA, posB) {
    const dx = (posA.x || 0) - (posB.x || 0);
    const dy = (posA.y || 0) - (posB.y || 0);
    const dz = (posA.z || 0) - (posB.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function findNearestFreeJobMule(player, radius = 120) {
    if (!player || !mp.players.exists(player)) return null;
    const pos = player.position;
    let nearest = null;
    let nearestDist = Number.MAX_VALUE;

    mp.vehicles.forEach((veh) => {
        if (!veh || !mp.vehicles.exists(veh)) return;
        if (veh.key !== 'job' || veh.owner !== CARGO_JOB_OWNER_ID) return;
        const modelName = (veh.modelName || (veh.db && veh.db.modelName) || '').toLowerCase();
        if (modelName !== 'mule') return;
        if (veh.cargoOwnerId && veh.cargoOwnerId !== player.id) return;

        const dist = distance3d(pos, veh.position);
        if (dist > radius) return;
        if (dist < nearestDist) {
            nearest = veh;
            nearestDist = dist;
        }
    });

    return nearest;
}

function isPlayerInRentedMule(player, session) {
    if (!player || !session) return false;
    if (!player.vehicle) return false;
    if (session.rentExpiresAt && Date.now() > session.rentExpiresAt) return false;

    const vehicle = player.vehicle;
    if (vehicle.cargoRentExpired) return false;
    if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle) && vehicle === session.rentedVehicle) {
        return true;
    }

    if (vehicle.cargoOwnerId != null && vehicle.cargoOwnerId == player.id) return true;

    if (session.rentedVehicleDbId != null && vehicle.db && vehicle.db.id == session.rentedVehicleDbId) return true;
    if (session.rentedVehiclePlate && vehicle.plate && vehicle.plate === session.rentedVehiclePlate) return true;

    return false;
}

function clearRentTimers(session) {
    if (!session) return;
    if (session.rentWarnTimers && session.rentWarnTimers.length) {
        session.rentWarnTimers.forEach(t => clearTimeout(t));
    }
    session.rentWarnTimers = [];
    if (session.rentExpireTimer) {
        clearTimeout(session.rentExpireTimer);
        session.rentExpireTimer = null;
    }
    if (session.rentDestroyTimer) {
        clearTimeout(session.rentDestroyTimer);
        session.rentDestroyTimer = null;
    }
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

    session.contract = null;
    session.cargoLoaded = false;
    session.deliveryEndsAt = null;
    session.startBodyHealth = 1000;
    session.pickupInside = false;
    session.currentDropoffIndex = 0;

    player.call('cargo.pickup.zone.state', [false]);
    player.call('cargo.delivery.clear', [reason]);
}

function secondsToRefresh() {
    return Math.max(0, Math.ceil((boardState.nextRefreshAt - Date.now()) / 1000));
}

function updateBoardData(player) {
    const session = getSession(player);
    if (!session) return;

    const active = session.contract || getCurrentBoardContract();
    if (!active) {
        player.call('cargo.board.data', [JSON.stringify({
            pickupName: '-',
            dropoffName: '-',
            reward: 0,
            deposit: 0,
            hasActiveContract: !!session.contract,
            hasRentedVehicle: !!session.rentedVehicle,
            cargoLoaded: !!session.cargoLoaded,
            refreshInSeconds: secondsToRefresh(),
            routesCount: 0,
        })]);
        return;
    }

    const nextDropoff = session.contract ? getCurrentDropoff(session) : active.dropoffs[0];
    player.call('cargo.board.data', [JSON.stringify({
        pickupName: active.pickup.name,
        dropoffName: nextDropoff ? nextDropoff.name : '-',
        reward: active.reward,
        deposit: active.deposit,
        hasActiveContract: !!session.contract,
        hasRentedVehicle: !!session.rentedVehicle,
        cargoLoaded: !!session.cargoLoaded,
        refreshInSeconds: secondsToRefresh(),
        routesCount: cargoRoutes.length,
        dropoffCount: active.dropoffs.length,
    })]);
}

function updateBoardsForAllPlayers() {
    mp.players.forEach((player) => {
        if (!isCargoWorker(player)) return;
        updateBoardData(player);
    });
}

function rotateBoardContract(notifyPlayers = false) {
    const old = boardState.routeIndex;
    if (cargoRoutes.length <= 1) boardState.routeIndex = 0;
    else {
        do {
            boardState.routeIndex = Math.floor(Math.random() * cargoRoutes.length);
        } while (boardState.routeIndex === old);
    }
    boardState.nextRefreshAt = Date.now() + CONTRACT_REFRESH_SECONDS * 1000;
    updateBoardsForAllPlayers();

    if (notifyPlayers) {
        mp.players.forEach((player) => {
            if (!isCargoWorker(player)) return;
            const session = getSession(player);
            if (session && session.contract) return;
            notifs.info(player, 'На черном рынке появился новый контракт на грузоперевозку', 'Черный рынок');
        });
    }
}

function createDeliveryColshape(player) {
    const session = getSession(player);
    if (!session || !session.contract) return;

    clearColshape(session.dropoffColshape);
    const target = getCurrentDropoff(session);
    if (!target) return;
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

    async init() {
        if (!ensureModules()) return false;
        await loadRoutesFromDB();

        mp.blips.new(478, BOARD_POS, { name: 'Черный рынок', color: 5, shortRange: true, scale: 0.9 });
        mp.blips.new(67, RENT_POS, { name: 'Аренда Mule', color: 3, shortRange: true, scale: 0.9 });

        this.boardMarker = mp.markers.new(1, new mp.Vector3(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z - 1), 1.3, { color: [61, 161, 255, 120] });
        this.rentMarker = mp.markers.new(1, new mp.Vector3(RENT_POS.x, RENT_POS.y, RENT_POS.z - 1), 1.6, { color: [90, 220, 110, 120] });

        this.boardLabel = mp.labels.new('~w~Черный рынок\n~g~Нажмите E', new mp.Vector3(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z + 1.05), {
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
            veh.properties = resolveVehicleProperties('mule');
            veh.setVariable('static', true);
            this.showcaseVehicles.push(veh);
        });

        rotateBoardContract(false);
        if (boardState.timer) clearInterval(boardState.timer);
        boardState.timer = setInterval(() => rotateBoardContract(true), CONTRACT_REFRESH_SECONDS * 1000);

        console.log(`[CARGO DELIVERY] Маршрутов загружено из БД: ${cargoRoutes.length}. Обновление черного рынка: ${CONTRACT_REFRESH_SECONDS / 60} минут.`);
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
        if (!contract || !contract.dropoffs.length) return notifs.error(player, 'На черном рынке нет доступных контрактов', 'Черный рынок');
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
            player.call('cargo.delivery.pickup.marker', [pickup.x, pickup.y, pickup.z]);
            updateBoardData(player);
            notifs.success(player, `Контракт куплен за $${contract.deposit}. Арендуйте Mule и заберите груз.`, 'Грузоперевозка');
        }, 'Покупка контракта на перевозку груза');
    },

    rentMule(player) {
        if (!ensureModules()) return;
        const session = getSession(player);
        if (!session || !session.contract) return notifs.error(player, 'Сначала возьмите контракт на черном рынке', 'Грузоперевозка');
        if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle) && !session.rentedVehicle.cargoRentExpired) {
            return notifs.error(player, 'У вас уже арендован Mule', 'Грузоперевозка');
        }

        money.removeCash(player, MULE_RENT_COST, (result) => {
            if (!result) return notifs.error(player, 'Недостаточно наличных для аренды Mule', 'Грузоперевозка');

            let veh = findNearestFreeJobMule(player);
            if (!veh) {
                veh = mp.vehicles.new(mp.joaat('mule'), RENT_SPAWN_POS, {
                    heading: RENT_SPAWN_HEADING,
                    numberPlate: 'CARGO',
                    locked: false,
                    engine: false,
                    dimension: player.dimension,
                });
                veh.properties = resolveVehicleProperties('mule');
            }

            veh.cargoOwnerId = player.id;
            session.rentedVehicle = veh;
            session.startBodyHealth = 1000;
            session.rentedVehicleDbId = veh.db ? veh.db.id : null;
            session.rentedVehiclePlate = veh.plate || null;
            session.rentExpiresAt = Date.now() + RENT_SECONDS * 1000;
            clearRentTimers(session);
            session.rentWarnTimers = [];
            veh.cargoRentExpired = false;

            RENT_WARN_SECONDS.forEach((warnSec) => {
                const delay = session.rentExpiresAt - Date.now() - warnSec * 1000;
                if (delay <= 0) return;
                const timer = setTimeout(() => {
                    if (!mp.players.exists(player)) return;
                    const mins = Math.ceil(warnSec / 60);
                    notifs.info(player, `До окончания аренды Mule осталось ${mins} мин.`, 'Грузоперевозка');
                }, delay);
                session.rentWarnTimers.push(timer);
            });

            session.rentExpireTimer = setTimeout(() => {
                if (!session.rentedVehicle || !mp.vehicles.exists(session.rentedVehicle)) return;
                const rentedVeh = session.rentedVehicle;
                rentedVeh.cargoRentExpired = true;
                rentedVeh.engine = false;
                rentedVeh.engineStatus = false;
                rentedVeh.setVariable('engine', false);
                if (mp.players.exists(player)) {
                    notifs.error(player, 'Время аренды истекло. Машина заблокирована и будет убрана через 2 минуты.', 'Грузоперевозка');
                }
                session.rentDestroyTimer = setTimeout(() => {
                    if (rentedVeh && mp.vehicles.exists(rentedVeh)) rentedVeh.destroy();
                    session.rentedVehicle = null;
                    session.rentedVehicleDbId = null;
                    session.rentedVehiclePlate = null;
                    session.rentExpiresAt = null;
                    clearRentTimers(session);
                    if (mp.players.exists(player)) updateBoardData(player);
                }, RENT_DESTROY_DELAY_SECONDS * 1000);
            }, RENT_SECONDS * 1000);

            player.call('cargo.rent.data', [JSON.stringify({
                rentPrice: MULE_RENT_COST,
                hasActiveContract: true,
                hasVehicle: true,
            })]);
            notifs.success(player, `Mule арендован (${veh.plate || 'без номера'}). Езжайте на точку погрузки.`, 'Грузоперевозка');
        }, 'Аренда Mule для грузоперевозки');
    },

    onPlayerEnterColshape(player, shape) {
        const session = getSession(player);
        if (!session || !session.contract) return;

        if (shape === session.pickupColshape) {
            session.pickupInside = true;
            player.call('cargo.pickup.zone.state', [true]);
            if (!isPlayerInRentedMule(player, session)) return;
            if (session.cargoLoaded) return;
            player.call('cargo.pickup.hint.show');
            return;
        }

        if (shape === session.dropoffColshape) {
            if (!session.cargoLoaded) return;
            if (!isPlayerInRentedMule(player, session)) return;

            const totalDropoffs = session.contract.dropoffs.length;
            session.currentDropoffIndex = (session.currentDropoffIndex || 0) + 1;
            clearColshape(session.dropoffColshape);
            session.dropoffColshape = null;

            if (session.currentDropoffIndex < totalDropoffs) {
                createDeliveryColshape(player);
                updateBoardData(player);
                return notifs.info(player, `Точка доставки выполнена (${session.currentDropoffIndex}/${totalDropoffs}). Езжайте к следующей точке.`, 'Грузоперевозка');
            }

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


    onPlayerExitColshape(player, shape) {
        const session = getSession(player);
        if (!session) return;
        if (shape === session.pickupColshape) {
            session.pickupInside = false;
            player.call('cargo.pickup.zone.state', [false]);
        }
    },

    loadCargo(player) {
        if (!ensureModules()) return;
        const session = getSession(player);
        if (!session || !session.contract) return;
        if (!session.pickupColshape || !session.pickupInside) return notifs.error(player, 'Подъедьте к зоне погрузки', 'Грузоперевозка');
        if (session.cargoLoaded) return notifs.error(player, 'Груз уже загружен', 'Грузоперевозка');
        if (!isPlayerInRentedMule(player, session)) {
            return notifs.error(player, 'Загрузка доступна только на арендованном Mule', 'Грузоперевозка');
        }

        session.cargoLoaded = true;
        session.startBodyHealth = Math.max(300, player.vehicle.bodyHealth || 1000);
        clearColshape(session.pickupColshape);
        session.pickupColshape = null;
        session.pickupInside = false;

        player.call('cargo.pickup.zone.state', [false]);
        createDeliveryColshape(player);
        startDeliveryTimer(player);
        notifs.success(player, 'Груз загружен. Доставьте его в пункт назначения за 30 минут.', 'Грузоперевозка');
        updateBoardData(player);
    },



    async showAdminRouteMenu(player) {
        await loadRoutesFromDB();
        const allRoutes = await db.Models.CargoDeliveryRoute.findAll({ order: [['id', 'ASC']] });
        player.call('cargo.admin.routes.show', [JSON.stringify({
            routes: allRoutes.map(getRouteSummary),
        })]);
    },

    async createAdminRoute(player) {
        const route = await createRouteFromPlayer(player);
        notifs.success(player, `Маршрут #${route.id} создан. Позиция игрока сохранена как точка погрузки.`, 'Маршруты грузов');
        await this.showAdminRouteMenu(player);
    },

    async addAdminDropoff(player, routeId) {
        const route = await addDropoffFromPlayer(routeId, player);
        if (!route) return notifs.error(player, 'Маршрут не найден', 'Маршруты грузов');
        notifs.success(player, `Точка доставки добавлена в маршрут #${route.id}.`, 'Маршруты грузов');
        await this.showAdminRouteMenu(player);
    },

    async setAdminReward(player, routeId, reward) {
        if (isNaN(reward) || reward <= 0) return notifs.error(player, 'Неверная награда', 'Маршруты грузов');
        const route = await setRouteReward(routeId, reward);
        if (!route) return notifs.error(player, 'Маршрут не найден', 'Маршруты грузов');
        notifs.success(player, `Награда маршрута #${route.id} установлена: $${route.reward}.`, 'Маршруты грузов');
    },

    canUseJobVehicle(player, vehicle) {
        if (!player || !player.character || !vehicle) return false;
        if (vehicle.key !== 'job' || vehicle.owner !== CARGO_JOB_OWNER_ID) return false;
        const session = getSession(player);
        if (!session) return false;
        if (vehicle.cargoRentExpired) return false;
        if (session.rentExpiresAt && Date.now() > session.rentExpiresAt) return false;
        if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle) && session.rentedVehicle === vehicle) return true;
        if (vehicle.cargoOwnerId != null && vehicle.cargoOwnerId == player.id) return true;
        if (session.rentedVehicleDbId != null && vehicle.db && vehicle.db.id == session.rentedVehicleDbId) return true;
        if (session.rentedVehiclePlate && vehicle.plate && vehicle.plate === session.rentedVehiclePlate) return true;
        return false;
    },

    cleanupPlayer(player) {
        const session = getSession(player);
        if (!session) return;
        clearSessionProgress(player);
        // Сохраняем сессию, если аренда еще активна: таймеры аренды должны продолжать работу
        if (session.rentedVehicle && mp.vehicles.exists(session.rentedVehicle) && !session.rentedVehicle.cargoRentExpired) return;
        clearRentTimers(session);
        sessions.delete(player.id);
    },
};
