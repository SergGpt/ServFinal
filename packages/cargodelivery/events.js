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
    init: () => {
        const mod = getCargo();
        if (mod.init()) {
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
    playerQuit: (player) => {
        getCargo().cleanupPlayer(player);
    },
    'death.spawn': (player) => {
        getCargo().cleanupPlayer(player);
    },
};
