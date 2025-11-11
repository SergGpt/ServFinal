"use strict";

const farms = require('./index');
const jobs  = call('jobs');

module.exports = {
    'init': () => {
        farms.init();
        inited(__dirname);
    },
    'shutdown': () => {
        farms.shutdown();
    },
    'playerQuit': (player) => {
        farms.cleanupPlayer(player);
    },
    'player.job.changed': (player) => {
        if (!player || !player.character) return;
        if (player.character.job === farms.jobId) farms.startJob(player);
        else farms.stopJob(player);
    },

    // Устроиться фермером (через вашу систему работ -> сохранение в БД)
    'farms.job.join': (player) => {
        if (!player?.character) return;
        if (player.character.job === farms.jobId) return;
        const job = jobs.getJob(farms.jobId);
        if (!job) return;
        jobs.addMember(player, job); // сохранит и вызовет player.job.changed
    },

    // Явные действия
    'farms.job.stop': (player) => farms.stopJob(player),
    'farms.seed.buy': (player, amount) => farms.buySeeds(player, amount),
    'farms.plot.plant': (player, index) => farms.plantSeed(player, parseInt(index)),
    'farms.plot.harvest': (player, index) => farms.harvestPlot(player, parseInt(index)),
    'farms.sell': (player) => farms.sellHarvest(player),
    'farms.menu.sync': (player) => farms.sendMenuUpdate(player),
};
