module.exports = {
    '/farmzone': {
        description: 'Редактор зоны посадки фермы',
        args: '',
        access: 6,
        handler: (player) => {
            player.call('farms.zone.editor.toggle');
        },
    },
};
