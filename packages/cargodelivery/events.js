let cargo;
let initTimer = null;

function getCargo() {
    if (!cargo) cargo = require('./index');
    return cargo;
}

function scheduleInit() {
    if (initTimer) return;
    initTimer = setTimeout(() => {
        initTimer = null;
        module.exports.init();
    }, 200);
}

module.exports = {
    init: async () => {
        const mod = getCargo();
        if (await mod.init()) {
            inited(__dirname);
        } else {
            scheduleInit();
        }
    },
    playerEnterColshape: (player, shape) => {
        if (!player.character) return;
        const mod = getCargo();
        if (shape === mod.boardColshape) mod.onBoardEnter(player);
        if (shape === mod.rentColshape) mod.onRentEnter(player);
        mod.onPlayerEnterColshape(player, shape);
    },
    playerExitColshape: (player, shape) => {
        if (!player.character) return;
        const mod = getCargo();
        if (shape === mod.boardColshape) mod.onBoardExit(player);
        if (shape === mod.rentColshape) mod.onRentExit(player);
        mod.onPlayerExitColshape(player, shape);
    },
    'cargo.contract.accept': (player) => {
        getCargo().acceptContract(player);
    },
    'cargo.mule.rent': (player) => {
        getCargo().rentMule(player);
    },
    'cargo.pickup.load': (player) => {
        getCargo().loadCargo(player);
    },
    'cargo.admin.route.create': async (player) => {
        if (!player.character || player.character.admin < 6) return;
        await getCargo().createAdminRoute(player);
    },
    'cargo.admin.route.dropoff.add': async (player, routeId) => {
        if (!player.character || player.character.admin < 6) return;
        await getCargo().addAdminDropoff(player, parseInt(routeId));
    },
    'cargo.admin.routes.refresh': async (player) => {
        if (!player.character || player.character.admin < 6) return;
        await getCargo().showAdminRouteMenu(player);
    },
    playerQuit: (player) => {
        getCargo().cleanupPlayer(player);
    },
    'death.spawn': (player) => {
        getCargo().cleanupPlayer(player);
    },
};
