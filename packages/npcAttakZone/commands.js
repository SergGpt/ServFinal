module.exports = {
    '/npcattakzone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('npcattakzone.menu.show.request');
        },
    },
    '/npczone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('npcattakzone.menu.show.request');
        },
    },
};
