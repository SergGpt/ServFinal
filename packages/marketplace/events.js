"use strict";

const marketplace = require("./index");

module.exports = {
    "init": () => {
        marketplace.init();
        inited(__dirname);
    },

    "marketplace.phone.open": async (player) => {
        if (!player.phone) return;
        await marketplace.sendLots(player);
        player.call("phone.show", [false]);
        player.call("marketplace.fullscreen.open", []);
    },

    "marketplace.phone.create": async (player, title, description, price, lotType, lotTargetId) => {
        try {
            let payload = null;
            if ((description === undefined || description === null) && (price === undefined || price === null) && typeof title === "string") {
                try { payload = JSON.parse(title); } catch (_) {}
            }

            const finalTitle = payload && payload.title != null ? payload.title : title;
            const finalDescription = payload && payload.description != null ? payload.description : description;
            const finalPrice = payload && payload.price != null ? payload.price : price;
            const finalLotType = payload && payload.lotType != null ? payload.lotType : lotType;
            const finalLotTargetId = payload && payload.lotTargetId != null ? payload.lotTargetId : lotTargetId;

            const result = await marketplace.createLot(player, finalTitle, finalDescription, finalPrice, finalLotType, finalLotTargetId);
            if (!result.ok) {
                player.call("notifications.push.error", [result.error, "Маркетплейс"]);
                return;
            }
            player.call("notifications.push.success", ["Лот создан", "Маркетплейс"]);
            await marketplace.sendLots(player);
        } catch (e) {
            console.log("[marketplace.events][create] error:", e && e.message ? e.message : e);
            player.call("notifications.push.error", ["Ошибка создания лота", "Маркетплейс"]);
        }
    },

    "marketplace.phone.buy": async (player, lotId) => {
        try {
            const result = await marketplace.buyLot(player, lotId);
            if (!result.ok) {
                player.call("notifications.push.error", [result.error, "Маркетплейс"]);
                return;
            }
            player.call("notifications.push.success", [`Вы купили: ${result.lot.title}`, "Маркетплейс"]);
            await marketplace.sendLots(player);
        } catch (e) {
            console.log("[marketplace.events][buy] error:", e && e.message ? e.message : e);
            player.call("notifications.push.error", ["Ошибка покупки лота", "Маркетплейс"]);
        }
    },

    "marketplace.phone.remove": async (player, lotId) => {
        const result = await marketplace.removeLot(player, lotId);
        if (!result.ok) {
            player.call("notifications.push.error", [result.error, "Маркетплейс"]);
            return;
        }

        player.call("notifications.push.success", ["Лот снят и возвращен владельцу", "Маркетплейс"]);
        await marketplace.sendLots(player);
    },

    "marketplace.phone.open.fullscreen": async (player) => {
        if (!player.phone) return;
        await marketplace.sendLots(player);
        player.call("phone.show", [false]);
        player.call("marketplace.fullscreen.open", []);
    }
};
