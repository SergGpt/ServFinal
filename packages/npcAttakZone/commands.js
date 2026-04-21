let moduleApi = require('./index');

module.exports = {
    '/npcattakzone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            if (!player || !player.character || player.character.admin < 6) return;
            player.call('npcattakzone.menu.show', [moduleApi.getZoneData()]);
        },
    },
    '/npczone': {
        description: 'Настройка зоны спавна NPC (select menu)',
        args: '',
        access: 6,
        handler: (player) => {
            if (!player || !player.character || player.character.admin < 6) return;
            player.call('npcattakzone.menu.show', [moduleApi.getZoneData()]);
        },
    },
};
