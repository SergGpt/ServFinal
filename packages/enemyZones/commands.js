'use strict';

module.exports = {
    '/enemyzone': {
        access: 2,
        description: 'Открыть select-menu редактора enemy NPC зон.',
        args: '',
        handler: (player) => mp.events.call('enemyzone:open', player),
    },

    '/enemyzone.create': {
        access: 2,
        description: 'Создать черновик новой enemy NPC зоны.',
        args: '[name]',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'create', args.join(' ') || `EnemyZone_${Date.now()}`),
    },

    '/enemyzone.addpoint': {
        access: 2,
        description: 'Добавить точку полигона в текущую позицию.',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'addpoint'),
    },

    '/enemyzone.setcount': {
        access: 2,
        description: 'Установить количество NPC [1-20].',
        args: '[1-20]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'setcount', args[0]),
    },

    '/enemyzone.setrespawn': {
        access: 2,
        description: 'Установить respawn в секундах [10-300].',
        args: '[10-300]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'setrespawn', args[0]),
    },

    '/enemyzone.save': {
        access: 2,
        description: 'Сохранить черновик зоны в БД.',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'save'),
    },

    '/enemyzone.list': {
        access: 2,
        description: 'Список enemy NPC зон.',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'list'),
    },

    '/enemyzone.goto': {
        access: 2,
        description: 'Телепорт к зоне по ID.',
        args: '[id]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'goto', args[0]),
    },
};
