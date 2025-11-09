"use strict";

let notifs = call("notifications");
let money = call("money");
let jobs = call("jobs");
let timer = call("timer");

const JOB_ID = 5;

module.exports = {
    jobId: JOB_ID,
    harvestPerSeed: 1,
    seedsPrice: 25,
    exchangeRateRange: [45, 95],
    exchangeChangeInterval: 60 * 60 * 1000,
    baseGrowthRange: [60 * 1000, 120 * 1000],
    baseCooldownRange: [60 * 1000, 120 * 1000],
    levelReductionMs: 2000,
    minProcessTime: 10 * 1000,
    harvestsPerLevel: 100,
    maxLevel: 20,
    farmMenuPos: new mp.Vector3(1960.572, 5163.742, 47.879 - 1),
    vendorPos: new mp.Vector3(1956.281, 5157.392, 47.879 - 1),
    plotsData: [
        { x: 1955.971, y: 5167.531, z: 47.879 },
        { x: 1958.412, y: 5169.893, z: 47.879 },
        { x: 1960.947, y: 5172.225, z: 47.879 },
        { x: 1963.324, y: 5174.594, z: 47.879 },
        { x: 1965.781, y: 5176.942, z: 47.879 },
        { x: 1968.267, y: 5179.286, z: 47.879 },
        { x: 1970.684, y: 5181.613, z: 47.879 },
        { x: 1973.169, y: 5183.971, z: 47.879 },
        { x: 1975.603, y: 5186.305, z: 47.879 },
        { x: 1978.062, y: 5188.655, z: 47.879 },
        { x: 1980.506, y: 5191.008, z: 47.879 },
        { x: 1982.968, y: 5193.329, z: 47.879 },
    ],

    plots: [],
    exchangeRate: 60,
    exchangeTimer: null,

    init() {
        this.createFarmMenuZone();
        this.createVendorZone();
        this.createPlots();
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
        this.plots.forEach(plot => {
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
        });
    },

    createFarmMenuZone() {
        const pos = this.farmMenuPos;
        mp.markers.new(1, pos, 0.75, { color: [120, 200, 80, 120] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        colshape.onEnter = (player) => {
            if (!this.isFarmer(player)) return;
            this.showMainMenu(player);
        };
        colshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('farms.menu.hide');
        };
        mp.blips.new(501, this.adjustBlipPos(pos), {
            name: "Ферма",
            color: 25,
            shortRange: true,
            scale: 0.9
        });
    },

    createVendorZone() {
        const pos = this.vendorPos;
        mp.markers.new(1, pos, 0.75, { color: [200, 140, 40, 120] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        colshape.onEnter = (player) => {
            if (!this.isFarmer(player)) return;
            this.showVendorMenu(player);
        };
        colshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('farms.vendor.hide');
        };
        mp.blips.new(431, this.adjustBlipPos(pos), {
            name: "Скупщик урожая",
            color: 11,
            shortRange: true,
            scale: 0.9
        });
    },

    adjustBlipPos(pos) {
        return new mp.Vector3(pos.x, pos.y, pos.z + 1.5);
    },

    createPlots() {
        this.plots = this.plotsData.map((plotData, index) => {
            const position = new mp.Vector3(plotData.x, plotData.y, plotData.z);
            const colshape = mp.colshapes.newSphere(position.x, position.y, position.z, 1.2);
            colshape.farmPlotId = index;
            colshape.onEnter = (player) => this.onPlotEnter(player, index);
            colshape.onExit = (player) => this.onPlotExit(player, index);

            return {
                index,
                position,
                state: 'empty',
                ownerId: null,
                ownerName: null,
                readyAt: null,
                cooldownAt: null,
                colshape,
                growthTimer: null,
                cooldownTimer: null,
            };
        });
    },

    startJob(player) {
        const data = this.ensureJobData(player);
        data.seeds = data.seeds || 0;
        data.harvest = data.harvest || 0;
        this.syncPlotsForPlayer(player);
        this.sendMenuUpdate(player);
        notifs.info(player, 'Вы приступили к работе фермера', 'Ферма');
    },

    stopJob(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
        if (player.farmJob) delete player.farmJob;
        player.call('farms.reset');
        player.call('farms.menu.hide');
        player.call('farms.vendor.hide');
    },

    cleanupPlayer(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
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
                plot.state = 'empty';
                this.broadcastPlotUpdate(index);
            }
        });
    },

    ensureJobData(player) {
        if (!player.farmJob) {
            player.farmJob = {
                seeds: 0,
                harvest: 0,
            };
        }
        return player.farmJob;
    },

    isFarmer(player) {
        return player && player.character && player.character.job === this.jobId;
    },

    onPlotEnter(player, index) {
        if (!this.isFarmer(player)) return;
        const plot = this.plots[index];
        if (!plot) return;
        const info = this.serializePlotForPlayer(plot, player);
        player.call('farms.plot.enter', [index, info]);
    },

    onPlotExit(player, index) {
        if (!player || !player.character) return;
        player.call('farms.plot.exit', [index]);
    },

    plantSeed(player, index) {
        if (!this.isFarmer(player)) return;
        const plot = this.plots[index];
        if (!plot) return notifs.error(player, 'Грядка не найдена', 'Ферма');
        if (plot.state !== 'empty') {
            if (plot.state === 'growing') return notifs.warning(player, 'Эта грядка уже занята посевами', 'Ферма');
            if (plot.state === 'ready') return notifs.warning(player, 'Сначала соберите урожай с этой грядки', 'Ферма');
            if (plot.state === 'cooldown') return notifs.warning(player, 'Грядка восстанавливается', 'Ферма');
            return notifs.warning(player, 'Эта грядка недоступна', 'Ферма');
        }

        const data = this.ensureJobData(player);
        if (!data.seeds || data.seeds <= 0) return notifs.warning(player, 'У вас нет семян', 'Ферма');

        const level = this.getPlayerLevel(player);
        const growthTime = this.getProcessTime(this.baseGrowthRange, level);

        plot.state = 'growing';
        plot.ownerId = player.id;
        plot.ownerName = player.name;
        plot.readyAt = Date.now() + growthTime;
        plot.growthTimer = timer.add(() => this.setPlotReady(index), growthTime);

        data.seeds--;
        this.broadcastPlotUpdate(index);
        this.sendMenuUpdate(player);
        this.refreshPlayerPlots(player);
        notifs.info(player, `Семя посажено. Время роста ~ ${Math.round(growthTime / 1000)} сек.`, 'Ферма');
    },

    setPlotReady(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.growthTimer = null;
        if (plot.state !== 'growing') return;

        plot.state = 'ready';
        plot.readyAt = null;
        const owner = this.getPlotOwner(plot.ownerId);
        if (owner) {
            notifs.success(owner, `Грядка №${index + 1} готова к сбору`, 'Ферма');
            owner.call('farms.plot.ready', [index]);
        }
        this.broadcastPlotUpdate(index);
    },

    harvestPlot(player, index) {
        if (!this.isFarmer(player)) return;
        const plot = this.plots[index];
        if (!plot) return notifs.error(player, 'Грядка не найдена', 'Ферма');
        if (plot.state !== 'ready') {
            if (plot.state === 'growing') return notifs.warning(player, 'Урожай еще созревает', 'Ферма');
            if (plot.state === 'cooldown') return notifs.warning(player, 'Грядка восстанавливается', 'Ферма');
            return notifs.warning(player, 'Эта грядка пока недоступна', 'Ферма');
        }
        if (plot.ownerId !== player.id) return notifs.error(player, 'Вы не сажали эту грядку', 'Ферма');

        plot.state = 'cooldown';
        plot.ownerId = null;
        plot.ownerName = null;
        const level = this.getPlayerLevel(player);
        const cooldownTime = this.getProcessTime(this.baseCooldownRange, level);
        plot.cooldownAt = Date.now() + cooldownTime;
        if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
        plot.cooldownTimer = timer.add(() => this.resetPlot(index), cooldownTime);

        this.registerHarvest(player, this.harvestPerSeed);
        notifs.success(player, 'Вы собрали урожай', 'Ферма');
        this.broadcastPlotUpdate(index);
    },

    resetPlot(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.cooldownTimer = null;
        plot.cooldownAt = null;
        if (plot.state !== 'cooldown') return;
        plot.state = 'empty';
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

    buySeeds(player, amount) {
        if (!this.isFarmer(player)) return;
        amount = parseInt(amount);
        if (isNaN(amount) || amount <= 0) return notifs.error(player, 'Некорректное количество семян', 'Ферма');
        amount = Math.clamp(amount, 1, 100);
        const price = amount * this.seedsPrice;
        money.removeCash(player, price, (res) => {
            if (!res) return notifs.error(player, 'Недостаточно наличных', 'Ферма');
            const data = this.ensureJobData(player);
            data.seeds = (data.seeds || 0) + amount;
            this.sendMenuUpdate(player);
            this.refreshPlayerPlots(player);
            notifs.success(player, `Куплено ${amount} семян`, 'Ферма');
        }, 'Покупка семян');
    },

    sellHarvest(player) {
        if (!this.isFarmer(player)) return;
        const data = this.ensureJobData(player);
        if (!data.harvest || data.harvest <= 0) return notifs.warning(player, 'У вас нет урожая для продажи', 'Ферма');
        const amount = data.harvest;
        const payout = amount * this.exchangeRate;
        money.addCash(player, payout, (res) => {
            if (!res) return notifs.error(player, 'Не удалось выдать деньги', 'Ферма');
            data.harvest = 0;
            this.sendMenuUpdate(player);
            notifs.success(player, `Вы продали ${amount} ед. урожая за $${payout}`, 'Ферма');
        }, 'Продажа урожая');
    },

    showMainMenu(player) {
        if (!this.isFarmer(player)) return;
        this.sendMenuUpdate(player);
        player.call('farms.menu.show', [this.collectMenuData(player)]);
    },

    showVendorMenu(player) {
        if (!this.isFarmer(player)) return;
        this.sendMenuUpdate(player);
        player.call('farms.vendor.show', [this.collectMenuData(player)]);
    },

    syncPlotsForPlayer(player) {
        if (!this.isFarmer(player)) return;
        const positions = this.plotsData.map(plot => ({ x: plot.x, y: plot.y, z: plot.z }));
        player.call('farms.plots.init', [positions]);
        this.refreshPlayerPlots(player);
    },

    refreshPlayerPlots(player) {
        if (!this.isFarmer(player)) return;
        this.plots.forEach((plot, index) => {
            const info = this.serializePlotForPlayer(plot, player);
            player.call('farms.plot.update', [index, info]);
        });
    },

    broadcastPlotUpdate(index) {
        const plot = this.plots[index];
        if (!plot) return;
        mp.players.forEach(player => {
            if (!this.isFarmer(player)) return;
            const info = this.serializePlotForPlayer(plot, player);
            player.call('farms.plot.update', [index, info]);
        });
    },

    serializePlotForPlayer(plot, player) {
        const result = {
            state: 'busy',
            action: null,
            timeLeft: null,
            owner: plot.ownerName,
        };
        if (!plot) return result;
        const now = Date.now();
        switch (plot.state) {
            case 'empty':
                result.state = 'available';
                result.owner = null;
                result.action = this.ensureJobData(player).seeds > 0 ? 'plant' : null;
                break;
            case 'growing':
                if (plot.ownerId === player.id) {
                    result.state = 'growing';
                    result.owner = null;
                    result.timeLeft = Math.max(0, plot.readyAt - now);
                } else {
                    result.state = 'busy';
                }
                break;
            case 'ready':
                if (plot.ownerId === player.id) {
                    result.state = 'ready';
                    result.owner = null;
                    result.action = 'harvest';
                } else {
                    result.state = 'busy';
                }
                break;
            case 'cooldown':
                result.state = 'cooldown';
                result.owner = null;
                result.timeLeft = Math.max(0, (plot.cooldownAt || now) - now);
                break;
            default:
                result.state = 'busy';
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
        const nextLevelExp = Math.min(this.maxLevel * expPerLevel, (level + 1) * expPerLevel);
        const progress = level >= this.maxLevel ? 1 : (exp - level * expPerLevel) / expPerLevel;
        const totalHarvest = Math.floor(exp / this.getHarvestExp(1));
        const toNext = level >= this.maxLevel ? 0 : Math.max(0, (level + 1) * this.harvestsPerLevel - totalHarvest);

        return {
            level,
            maxLevel: this.maxLevel,
            progress: Math.round(progress * 100),
            seeds: data.seeds || 0,
            harvest: data.harvest || 0,
            totalHarvest: totalHarvest,
            toNext,
            exchangeRate: this.exchangeRate,
            seedPrice: this.seedsPrice,
            estimatedReward: (data.harvest || 0) * this.exchangeRate,
            expPercent: Math.round((exp / (this.maxLevel * expPerLevel)) * 100),
        };
    },

    sendMenuUpdate(player) {
        if (!this.isFarmer(player)) return;
        const info = this.collectMenuData(player);
        player.call('farms.menu.update', [info]);
    },

    updateExchangeRate(initial = false) {
        const [min, max] = this.exchangeRateRange;
        this.exchangeRate = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!initial) {
            mp.players.forEach(player => {
                if (!this.isFarmer(player)) return;
                notifs.info(player, `Курс скупщика обновился: $${this.exchangeRate}`, 'Ферма');
                this.sendMenuUpdate(player);
            });
        }
    },
};
