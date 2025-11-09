"use strict";

const tennis = require('./index');
const notifications = call('notifications');

module.exports = {
    "/tennis": {
        access: 0,
        args: "[invite/accept/leave] [id]",
        description: "Управление матчами в теннис",
        handler: (player, args) => {
            if (!player.character) return;
            const action = (args[0] || '').toLowerCase();
            switch (action) {
                case 'invite':
                    tennis.handleInvite(player, args[1]);
                    break;
                case 'accept':
                    tennis.handleAccept(player);
                    break;
                case 'leave':
                    tennis.handleLeave(player);
                    break;
                default:
                    notifications.info(player, 'Используйте /tennis invite [id], /tennis accept или /tennis leave', 'Теннис');
                    break;
            }
        }
    }
};
