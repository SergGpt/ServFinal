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
        const result = await marketplace.createLot(player, title, description, price, lotType, lotTargetId);
        if (!result.ok) {
            player.call("notifications.push.error", [result.error, "Маркетплейс"]);
            return;
        }

        player.call("notifications.push.success", ["Лот создан", "Маркетплейс"]);
        await marketplace.sendLots(player);
    },

    "marketplace.phone.buy": async (player, lotId) => {
        const result = await marketplace.buyLot(player, lotId);
        if (!result.ok) {
            player.call("notifications.push.error", [result.error, "Маркетплейс"]);
            return;
        }

        player.call("notifications.push.success", [`Вы купили: ${result.lot.title}`, "Маркетплейс"]);
        await marketplace.sendLots(player);
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
