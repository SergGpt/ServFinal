let autoRobber;
let initTimer = null;

function getAutoRobber() {
    if (!autoRobber) {
        autoRobber = require('./index');
    }
    return autoRobber;
}

function scheduleInit() {
    if (initTimer) return;
    initTimer = setTimeout(() => {
        initTimer = null;
        module.exports.init();
    }, 100);
}

module.exports = {
    init: () => {
        const mod = getAutoRobber();
        if (mod.init()) {
            inited(__dirname);
        } else {
            scheduleInit();
        }
    },
    playerEnterColshape: (player, shape) => {
        if (!player.character) return;
        const mod = getAutoRobber();
        if (shape === mod.startColshape) {
            mod.onStartColshapeEnter(player);
        }
        if (shape === mod.deliveryColshape) {
            mod.completeOrder(player);
        }
    },
    playerExitColshape: (player, shape) => {
        if (!player.character) return;
        const mod = getAutoRobber();
        if (shape === mod.startColshape) {
            mod.onStartColshapeExit(player);
        }
    },
    'autoroober.order.request': (player) => {
        getAutoRobber().createOrder(player);
    },
    'autoroober.order.expired': (player) => {
        getAutoRobber().expireOrder(player, 'time');
    },
    playerQuit: (player) => {
        getAutoRobber().cleanupPlayer(player);
    },
    'death.spawn': (player) => {
        getAutoRobber().cleanupPlayer(player);
    },
    playerStartEnterVehicle: (player, vehicle, seat) => {
        if (seat !== 0) return;
        getAutoRobber().onVehicleStartEnter(player, vehicle);
    },
    playerEnterVehicle: (player, vehicle, seat) => {
        getAutoRobber().onVehicleEnter(player, vehicle, seat);
    },
};
