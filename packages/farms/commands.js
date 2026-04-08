module.exports = {
    '/farmsetup': {
        description: 'Настройка NPC и зоны посадки фермы (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('farms.zone.menu.show.request');
        },
    },
    '/farmzone': {
        description: 'Настройка NPC и зоны посадки фермы (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('farms.zone.menu.show.request');
        },
    },
};
