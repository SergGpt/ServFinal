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
    'farms.seed.buy': (player, seedPayload, amount) => {
        if (typeof seedPayload === "string" && amount === undefined) {
            try {
                const parsed = JSON.parse(seedPayload);
                if (parsed && typeof parsed === "object") {
                    return farms.buySeeds(player, parsed.seedId, parsed.amount);
                }
            } catch (e) {}
        }
        if (seedPayload && typeof seedPayload === "object" && amount === undefined) {
            return farms.buySeeds(player, seedPayload.seedId, seedPayload.amount);
        }
        farms.buySeeds(player, seedPayload, amount);
    },
    'farms.menu.open': (player) => {
        if (!player || !player.character || !player.farmAtMenuZone) return;
        farms.showMainMenu(player);
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
    'farms.plots.set': (player, pointsJson) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let points = null;
        try { points = typeof pointsJson === "string" ? JSON.parse(pointsJson) : pointsJson; } catch (e) {}
        if (!Array.isArray(points) || points.length < 1) return;
        const ok = farms.resetPlotsData(points);
        if (!ok) return player.utils.error("Не удалось обновить позиции грядок");
        player.utils.success(`Позиции грядок обновлены: ${points.length} шт.`);
    },
    'farms.zone.set': (player, zoneJson) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let zoneData = null;
        try { zoneData = JSON.parse(zoneJson); } catch (e) {}
        if (!zoneData) return;
        if (Array.isArray(zoneData.points) && zoneData.points.length >= 3) {
            const points = zoneData.points
                .map((point) => ({
                    x: parseFloat(point.x) || 0,
                    y: parseFloat(point.y) || 0,
                    z: parseFloat(point.z) || 0,
                }))
                .filter((point, index, arr) => index === arr.findIndex((p) => p.x === point.x && p.y === point.y && p.z === point.z));
            if (points.length < 3) return;
            const minZ = parseFloat(zoneData.minZ);
            const maxZ = parseFloat(zoneData.maxZ);
            farms.setPlantZone({
                points,
                minZ: Number.isFinite(minZ) ? minZ : Math.min(...points.map((p) => p.z)) - 1,
                maxZ: Number.isFinite(maxZ) ? maxZ : Math.max(...points.map((p) => p.z)) + 2,
            });
            return;
        }
        farms.setPlantZone({
            x: parseFloat(zoneData.x) || 0,
            y: parseFloat(zoneData.y) || 0,
            z: parseFloat(zoneData.z) || 0,
            dx: Math.max(1, parseFloat(zoneData.dx) || 1),
            dy: Math.max(1, parseFloat(zoneData.dy) || 1),
            dz: Math.max(1, parseFloat(zoneData.dz) || 1),
            points: null,
            minZ: null,
            maxZ: null,
        });
    },
    'farms.zone.menu.open': (player) => {
        if (!player || !player.character || player.character.admin < 6) return;
        const zoneData = farms.getPlantZoneData();
        zoneData.npcPos = { x: farms.farmMenuPos.x, y: farms.farmMenuPos.y, z: farms.farmMenuPos.z };
        player.call('farms.zone.menu.show', [zoneData]);
    },
    'farms.zone.menu.save': async (player, zoneJson) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let zoneData = null;
        try { zoneData = JSON.parse(zoneJson); } catch (e) {}
        if (!zoneData) return;
        if (zoneData.npcPos) farms.setFarmMenuPosition(zoneData.npcPos);

        if (Array.isArray(zoneData.points) && zoneData.points.length >= 3) {
            farms.setPlantZone({
                points: zoneData.points.map((p) => ({
                    x: parseFloat(p.x) || 0,
                    y: parseFloat(p.y) || 0,
                    z: parseFloat(p.z) || 0,
                })),
                minZ: parseFloat(zoneData.minZ) || null,
                maxZ: parseFloat(zoneData.maxZ) || null,
            });
        } else {
            farms.setPlantZone({
                x: parseFloat(zoneData.x) || 0,
                y: parseFloat(zoneData.y) || 0,
                z: parseFloat(zoneData.z) || 0,
                dx: Math.max(1, parseFloat(zoneData.dx) || 1),
                dy: Math.max(1, parseFloat(zoneData.dy) || 1),
                dz: Math.max(1, parseFloat(zoneData.dz) || 1),
                points: null,
                minZ: null,
                maxZ: null,
            });
        }
        const saved = await farms.savePlantZoneToDb();
        if (saved) player.utils.success('Зона фермы сохранена в БД');
        else player.utils.error('Не удалось сохранить зону фермы в БД');
        const payload = farms.getPlantZoneData();
        payload.npcPos = { x: farms.farmMenuPos.x, y: farms.farmMenuPos.y, z: farms.farmMenuPos.z };
        player.call('farms.zone.menu.show', [payload]);
    },
};
