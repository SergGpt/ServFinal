"use strict";

let bizes = call('bizes');
let jobs = call('jobs');
let notifs = call('notifications');
let utils = call('utils');

module.exports = {
    // Места
    loadPos: new mp.Vector3(895.5589599609375, -3182.19091796875, -7.099202632904053),
    cropUnloadPos: new mp.Vector3(85.55198669433594, 6331.1318359375, 30.225765228271484),

    // Настройки
    productPrice: 4,
    productsMax: 500,
    barrelsMax: 50,
    skillProducts: 15,
    skillBarrels: 1,
    productSellK: 0.8,
    vehPrice: 2500,
    exp: 0.05,
    cropPrice: 11,
    bizOrders: [],

    vehModels: { "pounder": [0,1,2,3,4,5,6,7,8,9,10,11] },

    init() {
        this.createLoadMarker();
        this.createCropUnloadMarker();
        console.log("[CARRIER] Инициализация завершена");
    },

    createLoadMarker() {
        const pos = this.loadPos;
        const marker = mp.markers.new(1, pos, 15, { color: [255,187,0,70] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z + 9, 10);

        colshape.onEnter = (player) => {
            if (player.character.job != 4) return notifs.error(player, "Отказано в доступе", "Склад");
            player.call("carrier.load.info.set", [this.getLoadData()]);
            player.carrierLoad = marker;
        };
        colshape.onExit = (player) => {
            player.call("selectMenu.hide");
            delete player.carrierLoad;
        };

        marker.colshape = colshape;
        mp.blips.new(318, pos, { color: 71, name: "Грузоперевозка", shortRange: true, scale: 1 });
    },

    createCropUnloadMarker() {
        const pos = this.cropUnloadPos;
        const marker = mp.markers.new(1, pos, 3, { color: [255,187,0,70] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z + 2, 2);

        colshape.onEnter = (player) => {
            if (player.character.job != 4) return notifs.error(player, "Отказано в доступе", "Склад");
            player.call("carrier.cropUnload.info.set", [this.getCropUnloadData()]);
            player.cropUnloadMarker = marker;
        };
        colshape.onExit = (player) => {
            player.call("selectMenu.hide");
            delete player.cropUnloadMarker;
        };

        marker.colshape = colshape;
        mp.blips.new(569, pos, { color: 1, name: "Урожай", shortRange: true, scale: 1 });
    },

    getLoadData() {
        return { bizOrders: this.bizOrders, productPrice: this.productPrice, productSellK: this.productSellK };
    },

    getCropUnloadData() { return { cropPrice: this.cropPrice }; },

    getProductsMax(player) {
        const skill = jobs.getJobSkill(player, 4);
        return parseInt(this.productsMax + skill.exp * this.skillProducts);
    },

    getBarrelsMax(player) {
        const skill = jobs.getJobSkill(player, 4);
        return Math.floor(this.barrelsMax + skill.exp * this.skillBarrels);
    },

    initBizOrders() {
        const list = bizes.getOrderBizes();
        list.forEach(biz => this.addBizOrder(biz));
    },

    getBizOrder(bizId) {
        return this.bizOrders.find(x => x.bizId == bizId);
    },

    addBizOrder(biz) {
        if (!biz.info.productsOrderPrice) return console.log(`[CARRIER] Некорректная цена | ${biz.info}`);
        const vdistance = utils.vdist(this.loadPos, new mp.Vector3(biz.info.x, biz.info.y, biz.info.z));
        const order = {
            bizId: biz.info.id,
            bizName: biz.info.name,
            ownerName: biz.info.characterNick,
            prodName: bizes.getResourceName(biz.info.type),
            prodCount: biz.info.productsOrder,
            prodPrice: bizes.getResourcePrice(biz.info.type),
            orderPrice: biz.info.productsOrderPrice,
            distance: +Math.sqrt(vdistance).toFixed(1),
        };
        this.removeBizOrderByBizId(order.bizId);
        this.jobBroadcast(`Поступил заказ для бизнеса ${order.bizName}`);
        this.bizOrders.push(order);
    },

    removeBizOrderByBizId(bizId) {
        this.bizOrders = this.bizOrders.filter(order => order.bizId !== bizId);
    },

    takeBizOrder(player, veh, order, count) {
        if (typeof order === 'number') order = this.getBizOrder(order);
        const pos = bizes.getBizPosition(order.bizId);

        if (count == order.prodCount) this.removeBizOrderByBizId(order.bizId);
        else {
            const price = parseInt(order.orderPrice * (count / order.prodCount));
            order.orderPrice -= price;
            order.prodCount -= count;
            order = Object.assign({}, order);
            order.orderPrice = price;
            order.prodCount = count;
        }

        veh.products = { bizOrder: order, playerId: player.id };
        veh.setVariable("label", `${count} из ${this.getProductsMax(player)} ед.`);
        player.call("carrier.bizOrder.waypoint.set", [pos]);
        notifs.success(player, `Заказ принят`, order.bizName);
        this.jobBroadcast(`Взят заказ для бизнеса ${order.bizName}`);
    },

    dropBizOrderByVeh(veh) {
        if (!veh.products || !veh.products.bizOrder) return;
        const order = veh.products.bizOrder;
        const oldOrder = this.getBizOrder(order.bizId);
        if (oldOrder) {
            oldOrder.orderPrice += order.orderPrice;
            oldOrder.prodCount += order.prodCount;
        } else this.bizOrders.push(order);

        delete veh.products;
        veh.setVariable("label", null);
        this.jobBroadcast(`Вернулся заказ для бизнеса ${order.bizName}`);
    },

    /**
     * Проверка нефтевоза: тягач hauler + прицеп tanker рядом
     */
    isOilTanker(veh) {
        if (!veh) return false;

        const haulerHash = mp.joaat("hauler");
        const tankerHash = mp.joaat("tanker");

        const modelName = veh.db?.modelName || veh.modelName;
        const modelHash = veh.model;

        // Проверяем тягач
        if (modelName !== "hauler" && modelHash !== haulerHash) {
            return false;
        }

        // Ищем прицепы поблизости
        const nearbyTrailers = mp.vehicles.toArray().filter(trailer => {
            const tModelName = trailer.db?.modelName || trailer.modelName;
            const tModelHash = trailer.model;

            if (tModelName !== "tanker" && tModelHash !== tankerHash) return false;

            const distance = veh.position.subtract(trailer.position).length();
            return distance < 30.0;
        });

        return nearbyTrailers.length > 0;
    },

    checkOilTankerByRemoteId(remoteId) {
        const veh = mp.vehicles.at(remoteId);
        if (!veh) return false;
        return this.isOilTanker(veh);
    },

    updateOilTankerLabel(veh) {
        if (!veh.oil) return;
        const { current, max } = veh.oil;
        veh.setVariable("label", `~y~${current} ~w~из ~o~${max} ~w~баррелей`);
    },

    jobBroadcast(text) {
        mp.players.forEach(rec => {
            if (!rec.character || rec.character.job != 4) return;
            notifs.info(rec, text, "Грузоперевозчики");
        });
    },

    getVehByDriver(player) {
        return mp.vehicles.toArray().find(x => x.db && x.db.key == 'job' && x.db.owner == 4 && x.driver && x.driver.playerId == player.id && x.driver.characterId == player.character.id);
    },

    getDriverByVeh(veh) {
        if (!veh.driver) return;
        return mp.players.toArray().find(x => x.character && x.id == veh.driver.playerId && x.character.id == veh.driver.characterId);
    },

    clearVeh(veh) {
        const driver = this.getDriverByVeh(veh);
        if (driver) driver.call("carrier.bizOrder.waypoint.set");
        this.dropBizOrderByVeh(veh);
        delete veh.driver;
        if (veh.products) delete veh.products;
        veh.setVariable("label", null);
    },

    isCorrectProductType(vehModel, type) {
        if (!this.vehModels[vehModel]) return false;
        return this.vehModels[vehModel].includes(type);
    }
};
