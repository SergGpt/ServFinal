"use strict";

module.exports = {
    '/enemyzone': {
        access: 2,
        description: 'Показать статус статической зоны enemy NPC.',
        args: '',
        handler: (player, _args, out) => {
            if (!player || !player.character || Number(player.character.admin) < 2) return;
            mp.events.call('enemyzone:menu:action', player, 'list', '{}');
            out.info('Статическая зона активна: -2288.1455, 3019.8230, 32.8100 (радиус 150м)', player);
        },
    },

    '/enemyzone.goto': {
        access: 2,
        description: 'Телепорт в центр статической зоны enemy NPC.',
        args: '',
        handler: (player) => {
            mp.events.call('enemyzone:menu:action', player, 'goto', '{}');
        },
    },

    '/enemyzone.reload': {
        access: 2,
        description: 'Переспавнить NPC статической зоны.',
        args: '',
        handler: (player) => {
            mp.events.call('enemyzone:menu:action', player, 'reload', '{}');
            player.call('selectMenu.notification', ['NPC зоны перезапущены']);
        },
    },

    '/ez': {
        access: 2,
        description: 'Алиас /enemyzone',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'list', '{}'),
    },
};
