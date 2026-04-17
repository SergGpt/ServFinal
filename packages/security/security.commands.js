const { addZone, respawnAll, isSecurityInitialized } = require('./security.controller');

module.exports = {
    "/s_addzone": {
        access: 1,
        description: "Создать security-зону радиусом 100м на позиции игрока.",
        args: "[name:s?]",
        handler: async (player, args, out) => {
            try {
                if (!isSecurityInitialized()) {
                    return out?.error
                        ? out.error('Security-модуль ещё не инициализирован. Повторите через пару секунд.', player)
                        : null;
                }

                const rawName = Array.isArray(args) ? args.join(' ').trim() : '';
                const name = rawName.length ? rawName : null;
                const zone = await addZone(player, name);

                if (zone) {
                    player.call('chat.message.push', [`!{#99ff99}[SECURITY] Зона создана: ID ${zone.id}, радиус ${zone.radius}`]);
                    if (out?.info) out.info(`${player.name} создал security-зону id=${zone.id}`, player);
                }
            } catch (e) {
                if (out?.error) out.error(`Ошибка /s_addzone: ${e && e.message ? e.message : e}`, player);
            }
        }
    },
    "/s_respawn": {
        access: 1,
        description: "Удалить и пересоздать охрану в активных security-зонах.",
        args: "",
        handler: async (player, _args, out) => {
            try {
                if (!isSecurityInitialized()) {
                    return out?.error
                        ? out.error('Security-модуль ещё не инициализирован. Повторите через пару секунд.', player)
                        : null;
                }

                const count = respawnAll();
                player.call('chat.message.push', [`!{#99ff99}[SECURITY] Перезапущены NPC в ${count} зон(ах).`]);
                if (out?.info) out.info(`${player.name} вызвал /s_respawn`, player);
            } catch (e) {
                if (out?.error) out.error(`Ошибка /s_respawn: ${e && e.message ? e.message : e}`, player);
            }
        }
    }
};
