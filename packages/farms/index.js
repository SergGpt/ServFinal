"use strict";

let notifs = call("notifications");
let money = call("money");
let jobs = call("jobs");
let timer = call("timer");

const JOB_ID = 5;
const FIELD_CENTER = { x: 2050.4384765625, y: 4920.4482421875, z: 40.96115493774414 };
const PLOT_GRID_SIZE = 10;
const PLOT_SPACING = 1.5;

function generatePlots(center, size, spacing) {
    const offsetBase = (size - 1) / 2;
    const result = [];
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const offsetX = (col - offsetBase) * spacing;
            const offsetY = (row - offsetBase) * spacing;
            result.push({
                x: parseFloat((center.x + offsetX).toFixed(12)),
                y: parseFloat((center.y + offsetY).toFixed(12)),
                z: center.z,
            });
        }
    }
    return result;
}

module.exports = {
    jobId: JOB_ID,
    exchangeRateRange: [45, 95],
    exchangeChangeInterval: 10 * 60 * 1000,
    levelReductionMs: 2000,
    minProcessTime: 10 * 1000,
    harvestsPerLevel: 100,
    maxLevel: 20,
    farmMenuPos: new mp.Vector3(2023.072998046875, 4976.62158203125, 41.22634506225586 - 1),
    fieldCenter: new mp.Vector3(FIELD_CENTER.x, FIELD_CENTER.y, FIELD_CENTER.z),
    plotsData: generatePlots(FIELD_CENTER, PLOT_GRID_SIZE, PLOT_SPACING),
    seedTypes: [
        {
            id: "potato",
            name: "Картофель",
            buyPrice: 20,
            harvestYield: 1,
            growthRange: [45 * 1000, 75 * 1000],
            cooldownRange: [30 * 1000, 60 * 1000],
            objectModel: "prop_veg_crop_03_pump",
        },
        {
            id: "cabbage",
            name: "Капуста",
            buyPrice: 45,
            harvestYield: 3,
            growthRange: [120 * 1000, 180 * 1000],
            cooldownRange: [60 * 1000, 120 * 1000],
            objectModel: "prop_veg_crop_04_leaf",
        },
        {
            id: "corn",
            name: "Кукуруза",
            buyPrice: 70,
            harvestYield: 5,
            growthRange: [210 * 1000, 300 * 1000],
            cooldownRange: [90 * 1000, 150 * 1000],
            objectModel: "prop_veg_crop_02",
        }
    ],
    plantZone: {
        x: 2043.5,
        y: 4913.5,
        z: 39.5,
        dx: 14.0,
        dy: 14.0,
        dz: 5.0,
    },

    plots: [],
    exchangeRate: 60,
    exchangeTimer: null,
    marketSoldInCycle: 0,
    marketHistory: [],
    farmColshape: null,
    farmMarker: null,
    farmBlip: null,
    plantZoneColshape: null,

    async init() {
        this.createFarmMenuZone();
        this.createPlots();
        await this.loadPlantZoneFromDb();
        this.createPlantZone();
        this.updateExchangeRate(true);
        this.exchangeTimer = timer.addInterval(() => this.updateExchangeRate(), this.exchangeChangeInterval);

        mp.players.forEach(player => {
            if (!player || !player.character) return;
            if (player.character.job === this.jobId) {
                this.startJob(player);
            }
        });
    },

    shutdown() {
        if (this.exchangeTimer) timer.remove(this.exchangeTimer);
        this.destroyFarmZone();
        this.destroyPlantZone();

        this.plots.forEach(plot => {
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
            this.destroyPlotObject(plot);
        });
    },

    createFarmMenuZone() {
        this.destroyFarmZone();
        const pos = this.farmMenuPos;
        this.farmMarker = mp.markers.new(1, pos, 0.75, { color: [120, 200, 80, 120] });
        this.farmColshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        this.farmColshape.onEnter = (player) => {
            if (!player || !player.character) return;
            player.farmAtMenuZone = true;
            player.call("farms.menu.enter");
        };
        this.farmColshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.farmAtMenuZone = false;
            player.call("farms.menu.exit");
        };
        this.farmBlip = mp.blips.new(501, this.adjustBlipPos(pos), {
            name: "Фермер",
            color: 25,
            shortRange: true,
            scale: 0.9,
        });
    },

    destroyFarmZone() {
        if (this.farmMarker) {
            try { this.farmMarker.destroy(); } catch (e) {}
            this.farmMarker = null;
        }
        if (this.farmColshape) {
            try { this.farmColshape.destroy(); } catch (e) {}
            this.farmColshape = null;
        }
        if (this.farmBlip) {
            try { this.farmBlip.destroy(); } catch (e) {}
            this.farmBlip = null;
        }
    },


    async loadPlantZoneFromDb() {
        try {
            const model = await db.Models.FarmZone.findOne({ where: { id: 1 } });
            if (!model) {
                await db.Models.FarmZone.create({ id: 1, x: this.plantZone.x, y: this.plantZone.y, z: this.plantZone.z, dx: this.plantZone.dx, dy: this.plantZone.dy, dz: this.plantZone.dz, dimension: 0 });
                return;
            }
            this.plantZone = {
                x: model.x,
                y: model.y,
                z: model.z,
                dx: model.dx,
                dy: model.dy,
                dz: model.dz,
            };
        } catch (e) {
            console.log('[farms] failed load farm zone from DB', e.message);
        }
    },

    async savePlantZoneToDb() {
        try {
            const payload = {
                x: this.plantZone.x,
                y: this.plantZone.y,
                z: this.plantZone.z,
                dx: this.plantZone.dx,
                dy: this.plantZone.dy,
                dz: this.plantZone.dz,
                dimension: 0,
            };
            const model = await db.Models.FarmZone.findOne({ where: { id: 1 } });
            if (model) await model.update(payload);
            else await db.Models.FarmZone.create(Object.assign({ id: 1 }, payload));
            return true;
        } catch (e) {
            console.log('[farms] failed save farm zone to DB', e.message);
            return false;
        }
    },

    getPlantZoneData() {
        const z = this.plantZone;
        return { x: z.x, y: z.y, z: z.z, dx: z.dx, dy: z.dy, dz: z.dz };
    },
    createPlantZone() {
        this.destroyPlantZone();
        const z = this.plantZone;
        this.plantZoneColshape = mp.colshapes.newCuboid(z.x, z.y, z.z, z.dx, z.dy, z.dz, 0);
        this.plantZoneColshape.onEnter = (player) => {
            if (!player) return;
            player.farmInPlantZone = true;
        };
        this.plantZoneColshape.onExit = (player) => {
            if (!player) return;
            player.farmInPlantZone = false;
        };
        this.broadcastPlantZone();
    },

    destroyPlantZone() {
        if (this.plantZoneColshape) {
            try { this.plantZoneColshape.destroy(); } catch (e) {}
            this.plantZoneColshape = null;
        }
    },

    setPlantZone(zoneData) {
        this.plantZone = Object.assign({}, this.plantZone, zoneData || {});
        this.createPlantZone();
    },

    broadcastPlantZone(target = null) {
        const z = this.plantZone;
        const payload = { x: z.x, y: z.y, z: z.z, dx: z.dx, dy: z.dy, dz: z.dz };
        if (target) return target.call("farms.zone.sync", [payload]);
        mp.players.forEach(player => {
            if (!player) return;
            player.call("farms.zone.sync", [payload]);
        });
    },

    adjustBlipPos(pos) {
        return new mp.Vector3(pos.x, pos.y, pos.z + 1.5);
    },

    createPlots() {
        this.plots = this.plotsData.map((plotData, index) => {
            const position = new mp.Vector3(plotData.x, plotData.y, plotData.z);
            return {
                index,
                position,
                state: "empty",
                ownerId: null,
                ownerName: null,
                readyAt: null,
                cooldownAt: null,
                seedType: null,
                object: null,
                growthTimer: null,
                cooldownTimer: null,
            };
        });
    },

    resetPlotsData(positions) {
        if (!Array.isArray(positions) || !positions.length) return false;

        this.plots.forEach((plot, index) => {
            if (!plot) return;
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
            this.destroyPlotObject(plot);
            this.broadcastPlotUpdate(index);
        });

        this.plotsData = positions.map((pos) => ({
            x: parseFloat(pos.x) || 0,
            y: parseFloat(pos.y) || 0,
            z: parseFloat(pos.z) || 0,
        }));
        this.createPlots();
        mp.players.forEach((player) => {
            if (!this.isFarmer(player)) return;
            this.syncPlotsForPlayer(player);
        });
        return true;
    },

    startJob(player) {
        const data = this.ensureJobData(player);
        data.seeds = data.seeds || {};
        data.harvest = data.harvest || 0;
        this.syncPlotsForPlayer(player);
        this.sendMenuUpdate(player);
        player.call("farms.employment.hide");
        this.broadcastPlantZone(player);
        if (player.farmAtMenuZone) {
            this.showMainMenu(player);
        }
        notifs.info(player, "Вы приступили к работе фермера", "Ферма");
    },

    stopJob(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
        if (player.farmJob) delete player.farmJob;
        player.call("farms.reset");
        player.call("farms.menu.hide");
        if (player.farmAtMenuZone) {
            player.call("farms.employment.show");
        } else {
            player.call("farms.employment.hide");
        }
    },

    cleanupPlayer(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
        if (player.farmAtMenuZone) player.farmAtMenuZone = false;
        if (player.farmInPlantZone) player.farmInPlantZone = false;
    },

    releasePlayerPlots(player) {
        if (!player) return;
        this.plots.forEach((plot, index) => {
            if (plot.ownerId === player.id) {
                if (plot.growthTimer) timer.remove(plot.growthTimer);
                plot.growthTimer = null;
                if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
                plot.cooldownTimer = null;
                plot.ownerId = null;
                plot.ownerName = null;
                plot.readyAt = null;
                plot.cooldownAt = null;
                plot.seedType = null;
                plot.state = "empty";
                this.destroyPlotObject(plot);
                this.broadcastPlotUpdate(index);
            }
        });
    },

    ensureJobData(player) {
        if (!player.farmJob) {
            player.farmJob = {
                seeds: {},
                harvest: 0,
            };
        }
        if (!player.farmJob.seeds) player.farmJob.seeds = {};
        return player.farmJob;
    },

    isFarmer(player) {
        return player && player.character && player.character.job === this.jobId;
    },

    getSeedType(seedId) {
        return this.seedTypes.find(seed => seed.id === seedId) || null;
    },

    getTotalSeeds(data) {
        if (!data || !data.seeds) return 0;
        return Object.values(data.seeds).reduce((acc, value) => acc + (parseInt(value) || 0), 0);
    },

    playerHasAnySeeds(player) {
        return this.getTotalSeeds(this.ensureJobData(player)) > 0;
    },

    isPlayerInsidePlantZone(player) {
        if (!player) return false;
        const pos = player.position;
        const z = this.plantZone;
        return pos.x >= z.x && pos.x <= z.x + z.dx &&
            pos.y >= z.y && pos.y <= z.y + z.dy &&
            pos.z >= z.z && pos.z <= z.z + z.dz;
    },

    plantSeed(player, index, seedId) {
        if (!this.isFarmer(player)) return;
        const plot = this.plots[index];
        if (!plot) return notifs.error(player, "Грядка не найдена", "Ферма");
        if (!this.isPlayerInsidePlantZone(player)) return notifs.warning(player, "Сажать можно только внутри зоны посадки", "Ферма");
        if (plot.state !== "empty") {
            if (plot.state === "growing") return notifs.warning(player, "Эта грядка уже занята посевами", "Ферма");
            if (plot.state === "ready") return notifs.warning(player, "Сначала соберите урожай с этой грядки", "Ферма");
            if (plot.state === "cooldown") return notifs.warning(player, "Грядка восстанавливается", "Ферма");
            return notifs.warning(player, "Эта грядка недоступна", "Ферма");
        }

        const data = this.ensureJobData(player);
        const type = this.getSeedType(seedId) || this.seedTypes[0];
        if (!data.seeds[type.id] || data.seeds[type.id] <= 0) return notifs.warning(player, `У вас нет семян: ${type.name}`, "Ферма");

        const level = this.getPlayerLevel(player);
        const growthTime = this.getProcessTime(type.growthRange, level);

        plot.state = "growing";
        plot.ownerId = player.id;
        plot.ownerName = player.name;
        plot.seedType = type.id;
        plot.readyAt = Date.now() + growthTime;
        plot.growthTimer = timer.add(() => this.setPlotReady(index), growthTime);
        this.createPlotObject(plot, type.objectModel);

        data.seeds[type.id]--;
        this.broadcastPlotUpdate(index);
        this.sendMenuUpdate(player);
        this.refreshPlayerPlots(player);
        notifs.info(player, `${type.name} посажен(а). Рост ~ ${Math.round(growthTime / 1000)} сек.`, "Ферма");
    },

    setPlotReady(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.growthTimer = null;
        if (plot.state !== "growing") return;

        plot.state = "ready";
        plot.readyAt = null;
        const owner = this.getPlotOwner(plot.ownerId);
        if (owner) {
            notifs.success(owner, `Грядка №${index + 1} готова к сбору`, "Ферма");
            owner.call("farms.plot.ready", [index]);
        }
        this.broadcastPlotUpdate(index);
    },

    harvestPlot(player, index) {
        if (!this.isFarmer(player)) return;
        const plot = this.plots[index];
        if (!plot) return notifs.error(player, "Грядка не найдена", "Ферма");
        if (plot.state !== "ready") {
            if (plot.state === "growing") return notifs.warning(player, "Урожай еще созревает", "Ферма");
            if (plot.state === "cooldown") return notifs.warning(player, "Грядка восстанавливается", "Ферма");
            return notifs.warning(player, "Эта грядка пока недоступна", "Ферма");
        }

        const ownerId = plot.ownerId;
        const ownerName = plot.ownerName;
        const type = this.getSeedType(plot.seedType) || this.seedTypes[0];

        plot.state = "cooldown";
        plot.ownerId = null;
        plot.ownerName = null;
        plot.seedType = null;
        const level = this.getPlayerLevel(player);
        const cooldownTime = this.getProcessTime(type.cooldownRange, level);
        plot.cooldownAt = Date.now() + cooldownTime;
        if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
        plot.cooldownTimer = timer.add(() => this.resetPlot(index), cooldownTime);
        this.destroyPlotObject(plot);

        this.registerHarvest(player, type.harvestYield);
        notifs.success(player, `Вы собрали ${type.name}: +${type.harvestYield} к сбыту`, "Ферма");

        if (ownerId != null && ownerId !== player.id) {
            const owner = this.getPlotOwner(ownerId);
            notifs.warning(player, `Это была грядка игрока ${ownerName || "неизвестно"}`, "Ферма");
            if (owner) notifs.warning(owner, `${player.name} сорвал ваш урожай`, "Ферма");
        }

        this.broadcastPlotUpdate(index);
    },

    resetPlot(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.cooldownTimer = null;
        plot.cooldownAt = null;
        if (plot.state !== "cooldown") return;
        plot.state = "empty";
        this.broadcastPlotUpdate(index);
    },

    registerHarvest(player, amount) {
        const data = this.ensureJobData(player);
        data.harvest = (data.harvest || 0) + amount;

        const skill = jobs.getJobSkill(player, this.jobId);
        if (skill) {
            const harvestExp = this.getHarvestExp(amount);
            const maxExp = this.maxLevel * this.getExpPerLevel();
            const oldExp = skill.exp;
            const desired = Math.min(maxExp, oldExp + harvestExp);
            const target = oldExp + (desired - oldExp) / jobs.bonusSkill;
            jobs.setJobExp(player, skill, target);
        }
        this.sendMenuUpdate(player);
    },

    getHarvestExp(amount) {
        return amount * (this.getExpPerLevel() / this.harvestsPerLevel);
    },

    buySeeds(player, seedId, amount) {
        if (!this.isFarmer(player)) return;
        const type = this.getSeedType(seedId);
        if (!type) return notifs.error(player, "Тип семян не найден", "Ферма");

        amount = parseInt(amount);
        if (isNaN(amount) || amount <= 0) return notifs.error(player, "Некорректное количество семян", "Ферма");
        amount = Math.clamp(amount, 1, 100);
        const price = amount * type.buyPrice;

        money.removeCash(player, price, (res) => {
            if (!res) return notifs.error(player, "Недостаточно наличных", "Ферма");
            const data = this.ensureJobData(player);
            data.seeds[type.id] = (data.seeds[type.id] || 0) + amount;
            this.sendMenuUpdate(player);
            this.refreshPlayerPlots(player);
            notifs.success(player, `Куплено ${amount} семян (${type.name})`, "Ферма");
        }, `Покупка семян (${type.name})`);
    },

    sellHarvest(player) {
        if (!this.isFarmer(player)) return;
        const data = this.ensureJobData(player);
        if (!data.harvest || data.harvest <= 0) return notifs.warning(player, "У вас нет урожая для продажи", "Ферма");
        const amount = data.harvest;
        const payout = amount * this.exchangeRate;
        money.addCash(player, payout, (res) => {
            if (!res) return notifs.error(player, "Не удалось выдать деньги", "Ферма");
            data.harvest = 0;
            this.marketSoldInCycle += amount;
            this.sendMenuUpdate(player);
            notifs.success(player, `Вы продали ${amount} ед. урожая за $${payout}`, "Ферма");
        }, "Продажа урожая");
    },

    showMainMenu(player) {
        this.sendMenuUpdate(player);
        if (!this.isFarmer(player)) {
            player.call("farms.employment.show");
            return;
        }
        player.call("farms.employment.hide");
        player.call("farms.menu.show", [this.collectMenuData(player)]);
    },

    syncPlotsForPlayer(player) {
        if (!this.isFarmer(player)) return;
        const positions = this.plotsData.map(plot => ({ x: plot.x, y: plot.y, z: plot.z }));
        player.call("farms.plots.init", [positions]);
        this.refreshPlayerPlots(player);
    },

    refreshPlayerPlots(player) {
        if (!this.isFarmer(player)) return;
        this.plots.forEach((plot, index) => {
            const info = this.serializePlotForPlayer(plot, player);
            player.call("farms.plot.update", [index, info]);
        });
    },

    broadcastPlotUpdate(index) {
        const plot = this.plots[index];
        if (!plot) return;
        mp.players.forEach(player => {
            if (!this.isFarmer(player)) return;
            const info = this.serializePlotForPlayer(plot, player);
            player.call("farms.plot.update", [index, info]);
        });
    },

    serializePlotForPlayer(plot, player) {
        const result = {
            state: "busy",
            action: null,
            owner: plot.ownerName,
            ownerMine: plot.ownerId === player.id,
            seedType: plot.seedType,
            seedName: null,
            readyAt: null,
            cooldownAt: null,
        };
        if (!plot) return result;

        const type = this.getSeedType(plot.seedType);
        if (type) result.seedName = type.name;

        switch (plot.state) {
            case "empty":
                result.state = "available";
                result.owner = null;
                result.action = this.playerHasAnySeeds(player) ? "plant" : null;
                break;
            case "growing":
                result.state = plot.ownerId === player.id ? "growing" : "growing_foreign";
                result.readyAt = plot.readyAt;
                break;
            case "ready":
                result.state = plot.ownerId === player.id ? "ready" : "ready_foreign";
                result.action = "harvest";
                break;
            case "cooldown":
                result.state = "cooldown";
                result.owner = null;
                result.cooldownAt = plot.cooldownAt;
                break;
            default:
                result.state = "busy";
                break;
        }
        return result;
    },

    getPlotOwner(ownerId) {
        if (ownerId == null) return null;
        return mp.players.at(ownerId);
    },

    getProcessTime(range, level) {
        const min = range[0];
        const max = range[1];
        const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
        const reduced = randomTime - level * this.levelReductionMs;
        return Math.max(this.minProcessTime, reduced);
    },

    getPlayerLevel(player) {
        const skill = jobs.getJobSkill(player, this.jobId);
        if (!skill) return 0;
        const expPerLevel = this.getExpPerLevel();
        return Math.min(this.maxLevel, Math.floor(skill.exp / expPerLevel));
    },

    getExpPerLevel() {
        return 100 / this.maxLevel;
    },

    collectMenuData(player) {
        const data = this.ensureJobData(player);
        const skill = jobs.getJobSkill(player, this.jobId);
        const exp = skill ? skill.exp : 0;
        const expPerLevel = this.getExpPerLevel();
        const level = Math.min(this.maxLevel, Math.floor(exp / expPerLevel));
        const progress = level >= this.maxLevel ? 1 : (exp - level * expPerLevel) / expPerLevel;
        const totalHarvest = Math.floor(exp / this.getHarvestExp(1));
        const toNext = level >= this.maxLevel ? 0 : Math.max(0, (level + 1) * this.harvestsPerLevel - totalHarvest);
        const seedsByType = {};
        this.seedTypes.forEach(seed => {
            seedsByType[seed.id] = data.seeds[seed.id] || 0;
        });

        return {
            employed: this.isFarmer(player),
            level,
            maxLevel: this.maxLevel,
            progress: Math.round(progress * 100),
            seeds: this.getTotalSeeds(data),
            seedsByType,
            seedTypes: this.seedTypes.map(seed => ({ id: seed.id, name: seed.name, buyPrice: seed.buyPrice, harvestYield: seed.harvestYield })),
            harvest: data.harvest || 0,
            totalHarvest,
            toNext,
            exchangeRate: this.exchangeRate,
            estimatedReward: (data.harvest || 0) * this.exchangeRate,
            marketHistory: this.marketHistory,
            marketSoldInCycle: this.marketSoldInCycle,
        };
    },

    sendMenuUpdate(player) {
        if (!player || !player.character) return;
        const info = this.collectMenuData(player);
        player.call("farms.menu.update", [info]);
    },

    updateExchangeRate(initial = false) {
        const [min, max] = this.exchangeRateRange;
        if (!initial) {
            const pressure = Math.min(20, Math.floor(this.marketSoldInCycle / 5));
            const drift = Math.floor(Math.random() * 11) - 5;
            this.exchangeRate = Math.clamp(this.exchangeRate - pressure + drift, min, max);
        } else {
            this.exchangeRate = Math.floor(Math.random() * (max - min + 1)) + min;
        }

        this.marketHistory.push({
            ts: Date.now(),
            rate: this.exchangeRate,
            sold: this.marketSoldInCycle,
        });
        if (this.marketHistory.length > 12) this.marketHistory.shift();
        this.marketSoldInCycle = 0;

        if (!initial) {
            mp.players.forEach(player => {
                if (!this.isFarmer(player)) return;
                notifs.info(player, `Курс скупщика обновился: $${this.exchangeRate}`, "Ферма");
                this.sendMenuUpdate(player);
            });
        }
    },

    createPlotObject(plot, modelName) {
        this.destroyPlotObject(plot);
        try {
            plot.object = mp.objects.new(mp.joaat(modelName), new mp.Vector3(plot.position.x, plot.position.y, plot.position.z - 1.0), {
                rotation: new mp.Vector3(0, 0, 0),
                dimension: 0,
            });
        } catch (e) {
            plot.object = null;
        }
    },

    destroyPlotObject(plot) {
        if (!plot || !plot.object) return;
        try { plot.object.destroy(); } catch (e) {}
        plot.object = null;
    },
};
