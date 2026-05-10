let cargo = require('./index');

module.exports = {
    "/cargoroutes": {
        access: 6,
        description: "Открыть меню настройки маршрутов черного рынка грузоперевозок",
        args: "",
        handler: async (player) => {
            await cargo.showAdminRouteMenu(player);
        }
    },
    "/cargoroutereward": {
        access: 6,
        description: "Установить награду маршрута черного рынка",
        args: "[routeId]:n [reward]:n",
        handler: async (player, args) => {
            await cargo.setAdminReward(player, parseInt(args[0]), parseInt(args[1]));
        }
    },
};
