"use strict";

const pawnshops = require('./index');
const notifs = call('notifications');

module.exports = {
    "init": () => {
        pawnshops.init();
        inited(__dirname);
    },
    "characterInit.done": (player) => {
        const config = pawnshops.getClientConfig();
        player.call('pawnshops.init', [JSON.stringify(config)]);
    },
    "pawnshops.menu.request": (player, brokerId) => {
        if (!player.character) return;
        const broker = pawnshops.getBroker(brokerId);
        if (!broker) return notifs.error(player, 'Скупщик не найден', 'Скупщик');
        if (player.pawnshopBrokerId !== broker.id) return notifs.error(player, 'Подойдите ближе к скупщику', broker.title);

        const data = pawnshops.getCounts(player, broker);
        player.call('pawnshops.menu.show', [JSON.stringify(data)]);
    },
    "pawnshops.sell.one": (player, brokerId) => {
        if (!player.character) return;
        const broker = pawnshops.getBroker(brokerId);
        if (!broker) return notifs.error(player, 'Скупщик не найден', 'Скупщик');
        if (player.pawnshopBrokerId !== broker.id) return notifs.error(player, 'Вы отошли слишком далеко', broker.title);

        pawnshops.sellItems(player, broker, 1, true);
    },
    "pawnshops.sell.all": (player, brokerId) => {
        if (!player.character) return;
        const broker = pawnshops.getBroker(brokerId);
        if (!broker) return notifs.error(player, 'Скупщик не найден', 'Скупщик');
        if (player.pawnshopBrokerId !== broker.id) return notifs.error(player, 'Вы отошли слишком далеко', broker.title);

        pawnshops.sellItems(player, broker, Infinity, false);
    },
    "playerQuit": (player) => {
        if (player.pawnshopBrokerId) delete player.pawnshopBrokerId;
    }
};
