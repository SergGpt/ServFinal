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
    },

    "marketplace.phone.create": async (player, title, description, price) => {
        const result = await marketplace.createLot(player, title, description, price);
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
    }
};
