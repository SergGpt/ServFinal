module.exports = {
    '/farmzone': {
        description: 'Настройка зоны посадки фермы (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('farms.zone.menu.show.request');
        },
    },
};
