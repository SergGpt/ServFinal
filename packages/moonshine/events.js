const moonshine = require('./index');

module.exports = {
    init: () => {
        moonshine.init();
        inited(__dirname);
    },
    shutdown: () => {
        moonshine.shutdown();
    },
    playerQuit: (player) => {
        moonshine.cleanupPlayer(player);
    },
    playerDeath: (player) => {
        moonshine.clearMoonshineEffect(player);
        moonshine.abortCraft(player, 'death', true);
    },
    playerDimensionChange: (player) => {
        moonshine.clearMoonshineEffect(player);
        moonshine.abortCraft(player, 'dimension', true);
    },
    'player.job.changed': (player) => {
        if (!player || !player.character) return;
        if (moonshine.isWorker(player)) {
            moonshine.startWork(player);
        } else {
            moonshine.stopWork(player);
        }
    },
    'moonshine.plot.plant': (player, index) => {
        moonshine.plantSeed(player, index);
    },
    'moonshine.plot.harvest': (player, index) => {
        moonshine.harvestPlot(player, index);
    },
    'moonshine.menu.sync': (player) => {
        moonshine.sendMenuUpdate(player);
    },
    'moonshine.seed.buy': (player, amount) => {
        moonshine.buySeeds(player, amount);
    },
    'moonshine.vendor.open': (player) => {
        moonshine.openVendor(player);
    },
    'moonshine.craft.menu': (player) => {
        moonshine.openCraftMenu(player);
    },
    'moonshine.craft.start': (player) => {
        moonshine.startCraft(player);
    },
    'moonshine.craft.cancel': (player) => {
        moonshine.abortCraft(player, 'cancel', true);
    },
    'moonshine.consume': (player, item) => {
        moonshine.consumeMoonshine(player, item);
    },
};
