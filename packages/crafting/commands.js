const crafting = require('./index');

module.exports = {
    "/craftadd": {
        access: 6,
        description: "Добавить точку крафта еды",
        args: "[radius]:n",
        handler: async (player, args, out) => {
            const point = await crafting.createPoint(player, 'food', parseFloat(args[0]) || 2);
            out.info(`Добавлена точка крафта #${point.id} (${point.type})`);
        }
    },
    "/craftdel": {
        access: 6,
        description: "Удалить точку крафта",
        args: "[id]:n",
        handler: async (player, args, out) => {
            const id = parseInt(args[0]);
            const ok = await crafting.deletePoint(id);
            if (!ok) return out.error(`Точка крафта #${id} не найдена`, player);
            out.info(`Точка крафта #${id} удалена`);
        }
    },
    "/craftlist": {
        access: 6,
        description: "Список точек крафта",
        args: "",
        handler: (player, args, out) => {
            if (!crafting.points.length) return out.info('Точки крафта не добавлены', player);
            const text = crafting.points
                .map(({ dbPoint }) => `${dbPoint.id}) ${dbPoint.type} [${dbPoint.x.toFixed(2)}, ${dbPoint.y.toFixed(2)}, ${dbPoint.z.toFixed(2)}] d:${dbPoint.d} r:${dbPoint.radius}`)
                .join('<br/>');
            out.log(text, player);
        }
    }
};
