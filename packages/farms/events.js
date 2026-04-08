let farms = require('./index');

module.exports = {
    'init': async () => {
        await farms.init();
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
        if (player.character.job === farms.jobId) {
            farms.startJob(player);
        } else {
            farms.stopJob(player);
        }
    },
    'farms.job.stop': (player) => {
        farms.stopJob(player);
    },
    'farms.employment': (player) => {
        if (!player || !player.character) return;
        if (player.character.job === farms.jobId) {
            mp.events.call('jobs.leave', player);
        } else {
            mp.events.call('jobs.set', player, farms.jobId);
        }
    },
    'farms.seed.buy': (player, seedId, amount) => {
        farms.buySeeds(player, seedId, amount);
    },
    'farms.plot.plant': (player, index, seedId) => {
        farms.plantSeed(player, parseInt(index), seedId);
    },
    'farms.plot.harvest': (player, index) => {
        farms.harvestPlot(player, parseInt(index));
    },
    'farms.sell': (player) => {
        farms.sellHarvest(player);
    },
    'farms.menu.sync': (player) => {
        farms.sendMenuUpdate(player);
    },
    'farms.zone.set': (player, zoneJson) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let zoneData = null;
        try { zoneData = JSON.parse(zoneJson); } catch (e) {}
        if (!zoneData) return;
        farms.setPlantZone({
            x: parseFloat(zoneData.x) || 0,
            y: parseFloat(zoneData.y) || 0,
            z: parseFloat(zoneData.z) || 0,
            dx: Math.max(1, parseFloat(zoneData.dx) || 1),
            dy: Math.max(1, parseFloat(zoneData.dy) || 1),
            dz: Math.max(1, parseFloat(zoneData.dz) || 1),
        });
    },
    'farms.zone.menu.open': (player) => {
        if (!player || !player.character || player.character.admin < 6) return;
        player.call('farms.zone.menu.show', [farms.getPlantZoneData()]);
    },
    'farms.zone.menu.save': async (player, zoneJson) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let zoneData = null;
        try { zoneData = JSON.parse(zoneJson); } catch (e) {}
        if (!zoneData) return;
        farms.setPlantZone({
            x: parseFloat(zoneData.x) || 0,
            y: parseFloat(zoneData.y) || 0,
            z: parseFloat(zoneData.z) || 0,
            dx: Math.max(1, parseFloat(zoneData.dx) || 1),
            dy: Math.max(1, parseFloat(zoneData.dy) || 1),
            dz: Math.max(1, parseFloat(zoneData.dz) || 1),
        });
        const saved = await farms.savePlantZoneToDb();
        if (saved) player.utils.success('Зона фермы сохранена в БД');
        else player.utils.error('Не удалось сохранить зону фермы в БД');
        player.call('farms.zone.menu.show', [farms.getPlantZoneData()]);
    },
};
