const crafting = require('./index');

module.exports = {
    "/craftadd": {
        access: 6,
        description: "Добавить Black Zone точку крафта еды",
        args: "[variant] [radius]:n",
        handler: async (player, args, out) => {
            const variant = args[0] || 'survivor_camp';
            const point = await crafting.createPoint(player, 'food', variant, parseFloat(args[1]) || 2);
            out.info(`Добавлена точка крафта #${point.id} (${point.variant}). Варианты: ${crafting.getAvailableVariants().join(', ')}`);
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
                .map(({ dbPoint }) => `${dbPoint.id}) ${dbPoint.type}/${dbPoint.variant} [${dbPoint.x.toFixed(2)}, ${dbPoint.y.toFixed(2)}, ${dbPoint.z.toFixed(2)}] h:${(dbPoint.h || 0).toFixed(1)} d:${dbPoint.d} r:${dbPoint.radius}`)
                .join('<br/>');
            out.log(text, player);
        }
    },
    "/craftvariants": {
        access: 6,
        description: "Показать варианты кухонь Black Zone",
        args: "",
        handler: (player, args, out) => {
            out.info(`Доступные варианты: ${crafting.getAvailableVariants().join(', ')}`, player);
        }
    }
};
