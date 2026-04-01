const notifs = call('notifications');

module.exports = {
    '/caseeditor': {
        access: 5,
        description: 'Открыть редактор кейсов',
        args: '',
        handler: (player) => {
            player.call('lootcases.admin.editor.open');
            notifs.info(player, 'Редактор кейсов открыт во вкладке Донат', 'Кейсы');
        }
    }
};
