"use strict";

mp.carrier = {
    bizOrderBlip: null,

    initStartJob() {
        const pedInfo = {
            model: "s_m_m_cntrybar_01",
            position: { x: 890.5279, y: -3176.4104, z: 5.9008 },
            heading: 45.43,
            marker: {
                x: 889.5941, y: -3175.6851, z: 4.9008,
                color: [199, 21, 125, 133],
                radius: 1.5,
                enterEvent: "carrier.jobshape.enter",
                leaveEvent: "carrier.jobshape.leave"
            },
        };
        mp.events.call('NPC.create', pedInfo);
    },

    setLoadInfo(data) {
        this.initBizOrdersInfo(data);
        const price = [`$${data.productPrice}`];
        const sell = [`-${Math.ceil((1 - data.productSellK) * 100)}%`];
        mp.callCEFV(`selectMenu.setItemValues('carrierLoadProducts', 'Купить', ${JSON.stringify(price)})`);
        mp.callCEFV(`selectMenu.setItemValues('carrierLoadProducts', 'Списать', ${JSON.stringify(sell)})`);
        mp.callCEFV(`selectMenu.showByName('carrierLoad')`);
    },

    setCropUnloadInfo(data) {
        const price = [`$${data.cropPrice}`];
        mp.callCEFV(`selectMenu.setItemValues('carrierCropUnload', 'Цена за 1 ед.', ${JSON.stringify(price)})`);
        mp.callCEFV(`selectMenu.showByName('carrierCropUnload')`);
    },

    initBizOrdersInfo(data) {
        const items = data.bizOrders.map(order => ({
            text: order.bizName,
            values: [`${order.prodCount} ед.`]
        }));
        items.push({ text: `Вернуться` });
        mp.callCEFV(`selectMenu.setItems('carrierLoadBizOrders', ${JSON.stringify(items)})`);
        mp.callCEFV(`selectMenu.setProp('carrierLoadBizOrders', 'bizOrders', ${JSON.stringify(data.bizOrders)})`);
    },

    setBizOrderWaypoint(pos) {
        if (this.bizOrderBlip && mp.blips.exists(this.bizOrderBlip)) {
            this.bizOrderBlip.destroy();
            this.bizOrderBlip = null;
        }
        if (!pos) return;
        this.bizOrderBlip = mp.blips.new(1, pos, { name: "Заказ", color: 60 });
        this.bizOrderBlip.setRoute(true);
    },

    // Проверка: сидим в тягаче с прицепом
    canCollectOil() {
        const veh = mp.players.local.vehicle;
        if (!veh) {
            mp.events.call('notifications.push.error', "Садитесь в грузовик");
            return false;
        }

        // отправляем на сервер для проверки привязанных прицепов
        mp.events.callRemote("carrier.checkOilTanker", veh.remoteId);
        return true;
    }
};

// Сервер вернёт результат, клиент покажет уведомление
mp.events.add("carrier.checkOilTanker.result", (canCollect) => {
    if (!canCollect) {
        mp.events.call('notifications.push.error', "Чтобы вести нефть, нужно быть в тягаче с прицепом-тонкером");
    } else {
        mp.events.call('notifications.push.success', "Можно вести нефть");
    }
});

mp.events.add({
    "characterInit.done": () => { mp.carrier.initStartJob(); },
    "carrier.load.info.set": (data) => { mp.carrier.setLoadInfo(data); },
    "carrier.cropUnload.info.set": (data) => { mp.carrier.setCropUnloadInfo(data); },
    "carrier.jobshape.enter": () => { mp.events.call(`selectMenu.show`, `carrierJob`); },
    "carrier.jobshape.leave": () => { mp.events.call(`selectMenu.hide`); },
    "carrier.bizOrder.waypoint.set": (pos) => { mp.carrier.setBizOrderWaypoint(pos); },
});
