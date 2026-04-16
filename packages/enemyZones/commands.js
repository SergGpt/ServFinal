"use strict";

function isAdmin(player, out) {
    if (!player || !player.character || Number(player.character.admin) < 2) {
        if (out && player) out.error('Недостаточно прав', player);
        return false;
    }
    return true;
}

module.exports = {
    '/enemyzone': {
        access: 2,
        description: 'Открыть меню создания/настройки зон вражеских NPC.',
        args: '',
        handler: (player, _args, out) => {
            if (!isAdmin(player, out)) return;
            player.call('enemyzone:client:openMenu', []);
            out.info('Открыто меню Enemy Zones', player);
        },
    },

    '/enemyzone.create': {
        access: 2,
        description: 'Создать черновик зоны',
        args: '[name]:s',
        handler: (player, args) => {
            if (!player || !player.character || Number(player.character.admin) < 2) return;
            mp.events.call('enemyzone:menu:action', player, 'create', JSON.stringify({ name: args[0] || 'Enemy Zone' }));
        },
    },

    '/enemyzone.addpoint': {
        access: 2,
        description: 'Добавить точку текущего полигона зоны',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'addpoint', '{}'),
    },

    '/enemyzone.setcount': {
        access: 2,
        description: 'Установить количество NPC в зоне',
        args: '[count]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'setcount', JSON.stringify({ count: Number(args[0]) || 3 })),
    },

    '/enemyzone.setrespawn': {
        access: 2,
        description: 'Установить респавн NPC в секундах',
        args: '[seconds]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'setrespawn', JSON.stringify({ respawnSec: Number(args[0]) || 60 })),
    },

    '/enemyzone.save': {
        access: 2,
        description: 'Сохранить черновик зоны в БД',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'save', '{}'),
    },

    '/enemyzone.list': {
        access: 2,
        description: 'Показать список зон',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'list', '{}'),
    },

    '/enemyzone.goto': {
        access: 2,
        description: 'Телепорт к зоне',
        args: '[id]:n',
        handler: (player, args) => mp.events.call('enemyzone:menu:action', player, 'goto', JSON.stringify({ id: Number(args[0]) })),
    },

    '/enemyzone.reload': {
        access: 2,
        description: 'Перезагрузить зоны из БД',
        args: '',
        handler: (player) => mp.events.call('enemyzone:menu:action', player, 'reload', '{}'),
    },

    '/ez': {
        access: 2,
        description: 'Алиас для /enemyzone',
        args: '',
        handler: (player) => player.call('enemyzone:client:openMenu', []),
    },
};
