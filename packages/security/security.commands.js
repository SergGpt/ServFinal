module.exports = {
    "/s_addzone": {
        access: 2,
        description: "Создать security-зону радиусом 100м на позиции игрока.",
        args: "[name]",
        handler: async (player, args, out) => {
            try {
                const name = args.length ? args.join(' ') : null;
                await mp.events.call('security:zone:add', player, name);
                if (out?.info) out.info(`${player.name} вызвал /s_addzone ${args.join(' ')}`.trim());
            } catch (e) {
                if (out?.error) out.error(`Ошибка /s_addzone: ${e && e.message ? e.message : e}`, player);
            }
        }
    },
    "/s_respawn": {
        access: 2,
        description: "Удалить и пересоздать охрану в активных security-зонах.",
        args: "",
        handler: async (player, args, out) => {
            try {
                await mp.events.call('security:respawn', player);
                if (out?.info) out.info(`${player.name} вызвал /s_respawn`);
            } catch (e) {
                if (out?.error) out.error(`Ошибка /s_respawn: ${e && e.message ? e.message : e}`, player);
            }
        }
    }
};
