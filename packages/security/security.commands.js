module.exports = {
    '/s_zoneeditor': {
        access: 2,
        description: 'Открыть редактор security-зоны.',
        args: '',
        handler: (player, args, out) => {
            try {
                mp.events.call('security:editor:open', player);
                if (out?.info) out.info(`${player.name} вызвал /s_zoneeditor`);
            } catch (error) {
                if (out?.error) out.error(`Ошибка /s_zoneeditor: ${error.message}`, player);
            }
        },
    },
    '/s_respawn': {
        access: 2,
        description: 'Пересоздать NPC ближайшей security-зоны в текущем dimension.',
        args: '',
        handler: (player, args, out) => {
            try {
                mp.events.call('security:respawn:nearest', player);
                if (out?.info) out.info(`${player.name} вызвал /s_respawn`);
            } catch (error) {
                if (out?.error) out.error(`Ошибка /s_respawn: ${error.message}`, player);
            }
        },
    },
};
