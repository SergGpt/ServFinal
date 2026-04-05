const drift = call('drift');

module.exports = {
    "/driftwsadd": {
        access: 6,
        description: "Создать drift workshop на текущей позиции",
        args: "[радиус]:n? [название]",
        handler: async (player, args, out) => {
            const radius = args[0] || 3.0;
            const name = args.slice(1).join(' ') || 'Drift Workshop';
            await mp.events.call('drift.workshop.create', player, name, radius);
            out.info(`Запрос на создание drift workshop отправлен (${name}, radius ${radius})`, player);
        }
    },
    "/driftwslist": {
        access: 6,
        description: "Показать список drift workshop из БД",
        args: "",
        handler: (player, args, out) => {
            const list = drift.getWorkshops();
            if (!list.length) return out.info('Drift workshop не найдены', player);
            list.forEach((point) => {
                out.info(`#${point.id} ${point.name} | ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${point.z.toFixed(2)} | r:${point.radius}`, player);
            });
        }
    },
};
