"use strict";

const notifs = require('../notifications');
const jobs = require('../jobs');
const money = require('../money');

const AUTO_ROOBER_JOB_ID = 11; // наша новая работа из БД

// Точка, где берём задание
const START_POS = new mp.Vector3(158.976, -3082.372, 6.014);

let startColshape = null;

module.exports = {
    init: async () => {
        // блип
        mp.blips.new(669, START_POS, {
            name: 'Автоугон',
            color: 1,
            shortRange: true
        });

        // колшейп
        startColshape = mp.colshapes.newSphere(START_POS.x, START_POS.y, START_POS.z, 1.5);

        console.log('[Autoroober] init done');
        inited(__dirname);
    },

    // игрок вошёл в колшейп
    "playerEnterColshape": (player, shape) => {
        if (shape !== startColshape) return;
        if (player.vehicle) return;

        // проверяем, что он УЖЕ устроен на работу 11
        if (!player.character || player.character.job !== AUTO_ROOBER_JOB_ID) {
            return notifs.error(player, 'Сначала устройся на работу "Автоугонщик" (id 11)', 'Автоугон');
        }

        // показать меню на клиенте
        player.call('roober.showMenu');
    },

    // ушёл — спрятали
    "playerExitColshape": (player, shape) => {
        if (shape !== startColshape) return;
        player.call('roober.hideMenu');
    },

    // клиент нажал "Взять заказ"
    "roober.order.start": (player) => {
        if (!player.character || player.character.job !== AUTO_ROOBER_JOB_ID) {
            return notifs.error(player, 'Ты не автоугонщик', 'Автоугон');
        }

        // пока просто проверка — потом сюда добавим спавн
        notifs.success(player, 'Заказ принят (тест)', 'Автоугон');
    },

    // клиент нажал "Отмена"
    "roober.order.cancel": (player) => {
        player.call('roober.hideMenu');
        notifs.info(player, 'Заказ отменён', 'Автоугон');
    },
};
