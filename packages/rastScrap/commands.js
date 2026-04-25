const rastScrap = require('./index');

module.exports = {
    "/scrapcollect": {
        access: 0,
        description: "Собрать металлолом на свалке (для фракции Rast)",
        args: "",
        handler: (player) => {
            rastScrap.collect(player);
        }
    },
    "/rastdumpadd": {
        access: 6,
        description: "Добавить точку свалки",
        args: "[radius]:n [cooldownSec]:n",
        handler: async (player, args, out) => {
            const point = await rastScrap.createDump(player, parseFloat(args[0]) || 2, parseInt(args[1]) || 30);
            out.info(`Добавлена точка свалки #${point.id}`);
        }
    },
    "/scrapdumpadd": {
        access: 6,
        description: "Добавить точку свалки (alias)",
        args: "[radius]:n [cooldownSec]:n",
        handler: async (player, args, out) => {
            const point = await rastScrap.createDump(player, parseFloat(args[0]) || 2, parseInt(args[1]) || 30);
            out.info(`Добавлена точка свалки #${point.id}`);
        }
    },
    "/rastdumpdel": {
        access: 6,
        description: "Удалить точку свалки",
        args: "[id]:n",
        handler: async (player, args, out) => {
            const ok = await rastScrap.deleteDump(parseInt(args[0]));
            if (!ok) return out.error(`Точка #${args[0]} не найдена`, player);
            out.info(`Точка свалки #${args[0]} удалена`);
        }
    },
    "/rastdumptp": {
        access: 6,
        description: "Телепорт к точке свалки",
        args: "[id]:n",
        handler: (player, args, out) => {
            const dump = rastScrap.getDumpById(parseInt(args[0]));
            if (!dump) return out.error(`Точка #${args[0]} не найдена`, player);
            player.position = new mp.Vector3(dump.dbPoint.x, dump.dbPoint.y, dump.dbPoint.z + 1);
            player.dimension = dump.dbPoint.d;
            out.info(`Телепорт к свалке #${args[0]}`);
        }
    },
    "/rastdumpset": {
        access: 6,
        description: "Переместить точку свалки в вашу позицию",
        args: "[id]:n",
        handler: async (player, args, out) => {
            const point = await rastScrap.updateDumpPos(parseInt(args[0]), player);
            if (!point) return out.error(`Точка #${args[0]} не найдена`, player);
            out.info(`Точка #${point.id} обновлена`);
        }
    },
    "/rastdumplist": {
        access: 6,
        description: "Список точек свалки",
        args: "",
        handler: (player, args, out) => {
            const rows = rastScrap.dumps.map((x) => x.dbPoint);
            if (!rows.length) return out.info('Точки свалки не добавлены', player);

            const text = rows
                .map((p) => `${p.id}) [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}] d:${p.d} r:${p.radius} cd:${p.cooldownSec}`)
                .join('<br/>');
            out.log(text, player);
        }
    }
};
