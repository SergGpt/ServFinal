module.exports = {
    '/npcattakzone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            if (!player || !player.character || player.character.admin < 6) return;
            mp.events.call('npcattakzone.menu.open', player);
        },
    },
    '/npczone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            if (!player || !player.character || player.character.admin < 6) return;
            mp.events.call('npcattakzone.menu.open', player);
        },
    },
    '/npcaz': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            if (!player || !player.character || player.character.admin < 6) return;
            mp.events.call('npcattakzone.menu.open', player);
        },
    },
};
