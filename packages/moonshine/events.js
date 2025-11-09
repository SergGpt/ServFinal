let moonshine = require('./index');

module.exports = {
    'init': () => {
        moonshine.init();
        inited(__dirname);
    },
    'shutdown': () => {
        moonshine.shutdown();
    },
    'playerQuit': (player) => {
        moonshine.cleanupPlayer(player);
    },
    'playerDeath': (player) => {
        moonshine.clearMoonshineEffect(player);
    },
    'player.job.changed': (player) => {
        if (!player || !player.character) return;
        if (player.character.job === moonshine.jobId) {
            moonshine.startJob(player);
        } else {
            moonshine.stopJob(player);
        }
    },
    'moonshine.job.stop': (player) => {
        moonshine.stopJob(player);
    },
    'moonshine.seed.buy': (player, amount) => {
        moonshine.buySeeds(player, amount);
    },
    'moonshine.plot.plant': (player, index) => {
        moonshine.plantSeed(player, parseInt(index));
    },
    'moonshine.plot.harvest': (player, index) => {
        moonshine.harvestPlot(player, parseInt(index));
    },
    'moonshine.menu.sync': (player) => {
        moonshine.sendMenuUpdate(player);
    },
    'moonshine.craft.menu': (player) => {
        moonshine.showCraftMenu(player);
    },
    'moonshine.craft.request': (player, amount) => {
        moonshine.craftMoonshine(player, amount);
    },
    'moonshine.consume': (player, item) => {
        moonshine.consumeMoonshine(player, item);
    }
};
