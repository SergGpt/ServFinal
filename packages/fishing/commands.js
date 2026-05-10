const fishing = require('./index');

module.exports = {
    "/gotofisher": {
        access: 6,
        args: "[id]:n",
        handler: (player, args) => {
            let position = fishing.getFisherPosition(parseInt(args[0]));
            if (position) player.position = position;
        }
    },
    "/resetfishrecords": {
        access: 6,
        description: "Сбросить таблицу рекордов рыбалки",
        args: "",
        handler: async (player, args, out) => {
            await fishing.resetRecords('admin_command');
            out.info(`${player.name} сбросил таблицу рекордов рыбалки`);
        }
    },
}
