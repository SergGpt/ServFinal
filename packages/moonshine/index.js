"use strict";

let notifs = call("notifications");
let money = call("money");
let jobs = call("jobs");
let timer = call("timer");
let inventory = call("inventory");

const JOB_ID = 12;
const SEED_ITEM_ID = 300;
const CANE_ITEM_ID = 301;
const BOTTLE_ITEM_ID = 246;
const MOONSHINE_ITEM_ID = 303;

module.exports = {
    jobId: JOB_ID,
    seedItemId: SEED_ITEM_ID,
    caneItemId: CANE_ITEM_ID,
    bottleItemId: BOTTLE_ITEM_ID,
    moonshineItemId: MOONSHINE_ITEM_ID,

    harvestPerSeed: 1,
    seedsPrice: 45,
    canePerMoonshine: 3,
    craftExp: 0.5,
    exchangeRate: 0,

    baseGrowthRange: [60 * 1000, 120 * 1000],
    baseCooldownRange: [60 * 1000, 120 * 1000],
    levelReductionMs: 2000,
    minProcessTime: 10 * 1000,
    harvestsPerLevel: 100,
    maxLevel: 20,

    farmMenuPos: new mp.Vector3(1479.9052734375, 1154.0726318359375, 114.30072021484375 - 1),
    vendorPos: new mp.Vector3(1479.9052734375, 1154.0726318359375, 114.30072021484375 - 1),
    craftPos: new mp.Vector3(1479.9052734375, 1154.0726318359375, 114.30072021484375 - 1),

    plotsData: [
        { x: 1471.312, y: 1160.544, z: 114.322 },
        { x: 1473.812, y: 1158.112, z: 114.312 },
        { x: 1476.256, y: 1155.713, z: 114.305 },
        { x: 1478.731, y: 1153.278, z: 114.296 },
        { x: 1481.228, y: 1150.848, z: 114.287 },
        { x: 1483.69, y: 1148.441, z: 114.278 },
        { x: 1486.167, y: 1146.002, z: 114.269 },
        { x: 1488.67, y: 1143.58, z: 114.26 },
        { x: 1491.132, y: 1141.173, z: 114.251 },
        { x: 1493.625, y: 1138.741, z: 114.242 },
        { x: 1496.108, y: 1136.323, z: 114.233 },
        { x: 1498.57, y: 1133.903, z: 114.224 },
    ],

    plots: [],
    craftColshape: null,

    init() {
        this.createFarmMenuZone();
        this.createVendorZone();
        this.createCraftZone();
        this.createPlots();

        mp.players.forEach(player => {
            if (!player || !player.character) return;
            if (player.character.job === this.jobId) {
                this.startJob(player);
            }
        });

    },

    shutdown() {
        this.plots.forEach(plot => {
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
        });
        if (this.craftColshape) {
            this.craftColshape.onEnter = null;
            this.craftColshape.onExit = null;
        }
    },

    ensureJobData(player) {
        if (!player.moonshineJob) {
            player.moonshineJob = {
                totalHarvest: 0,
                totalBrewed: 0,
            };
        }
        return player.moonshineJob;
    },

    isMoonshiner(player) {
        return player && player.character && player.character.job === this.jobId;
    },

    createFarmMenuZone() {
        const pos = this.farmMenuPos;
        mp.markers.new(1, pos, 0.75, { color: [200, 170, 60, 120] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        colshape.onEnter = (player) => {
            if (!this.isMoonshiner(player)) return;
            this.showMainMenu(player);
        };
        colshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('moonshine.menu.hide');
        };
        mp.blips.new(496, this.adjustBlipPos(pos), {
            name: "Плантация тростника",
            color: 52,
            shortRange: true,
            scale: 0.9,
        });
    },

    createVendorZone() {
        const pos = this.vendorPos;
        mp.markers.new(1, pos, 0.75, { color: [120, 200, 80, 120] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        colshape.onEnter = (player) => {
            if (!this.isMoonshiner(player)) return;
            this.showVendorMenu(player);
        };
        colshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('moonshine.vendor.hide');
        };
        mp.blips.new(431, this.adjustBlipPos(pos), {
            name: "Семена тростника",
            color: 11,
            shortRange: true,
            scale: 0.9,
        });
    },

    createCraftZone() {
        const pos = this.craftPos;
        mp.markers.new(1, pos, 0.75, { color: [255, 140, 40, 120] });
        const colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
        colshape.onEnter = (player) => {
            if (!this.isMoonshiner(player)) return;
            player.call('moonshine.craft.enter');
        };
        colshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('moonshine.craft.exit');
        };
        this.craftColshape = colshape;
        mp.blips.new(436, this.adjustBlipPos(pos), {
            name: "Самогонный аппарат",
            color: 5,
            shortRange: true,
            scale: 0.9,
        });
    },

    createPlots() {
        this.plots = this.plotsData.map((plotData, index) => {
            const position = new mp.Vector3(plotData.x, plotData.y, plotData.z);
            const colshape = mp.colshapes.newSphere(position.x, position.y, position.z, 1.2);
            colshape.moonshinePlotId = index;
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

    adjustBlipPos(pos) {
        return new mp.Vector3(pos.x, pos.y, pos.z + 1.5);
    },

    startJob(player) {
        const data = this.ensureJobData(player);
        data.totalHarvest = data.totalHarvest || 0;
        data.totalBrewed = data.totalBrewed || 0;
        this.syncPlotsForPlayer(player);
        this.sendMenuUpdate(player);
        notifs.info(player, 'Вы приступили к работе варщика', 'Самогоноварение');
    },

    stopJob(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
        if (player.moonshineJob) delete player.moonshineJob;
        this.clearMoonshineEffect(player);
        player.call('moonshine.reset');
        player.call('moonshine.menu.hide');
        player.call('moonshine.vendor.hide');
        player.call('moonshine.craft.exit');
        player.call('moonshine.craft.menu.hide');
    },

    cleanupPlayer(player) {
        if (!player) return;
        this.releasePlayerPlots(player);
        this.clearMoonshineEffect(player);
    },

    releasePlayerPlots(player) {
        if (!player) return;
        this.plots.forEach((plot, index) => {
            if (plot.ownerId === player.id) {
                if (plot.growthTimer) timer.remove(plot.growthTimer);
                if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
                plot.growthTimer = null;
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

    onPlotEnter(player, index) {
        if (!this.isMoonshiner(player)) return;
        const plot = this.plots[index];
        if (!plot) return;
        const info = this.serializePlotForPlayer(plot, player);
        player.call('moonshine.plot.enter', [index, info]);
    },

    onPlotExit(player, index) {
        if (!player || !player.character) return;
        player.call('moonshine.plot.exit', [index]);
    },

    async plantSeed(player, index) {
        try {
            if (!this.isMoonshiner(player)) return;
            const plot = this.plots[index];
            if (!plot) return notifs.error(player, 'Грядка не найдена', 'Самогоноварение');
            if (plot.state !== 'empty') {
                if (plot.state === 'growing') return notifs.warning(player, 'Эта грядка уже засажена', 'Самогоноварение');
                if (plot.state === 'ready') return notifs.warning(player, 'Сначала соберите урожай', 'Самогоноварение');
                if (plot.state === 'cooldown') return notifs.warning(player, 'Грядка восстанавливается', 'Самогоноварение');
                return notifs.warning(player, 'Эта грядка недоступна', 'Самогоноварение');
            }

            if (!(await this.consumeItems(player, this.seedItemId, 1))) {
                return notifs.warning(player, 'У вас нет семян тростника', 'Самогоноварение');
            }

            const level = this.getPlayerLevel(player);
            const growthTime = this.getProcessTime(this.baseGrowthRange, level);

            plot.state = 'growing';
            plot.ownerId = player.id;
            plot.ownerName = player.name;
            plot.readyAt = Date.now() + growthTime;
            plot.growthTimer = timer.add(() => this.setPlotReady(index), growthTime);

            this.broadcastPlotUpdate(index);
            this.sendMenuUpdate(player);
            this.refreshPlayerPlots(player);
            notifs.info(player, `Семя посажено. Время роста ~ ${Math.round(growthTime / 1000)} сек.`, 'Самогоноварение');
        } catch (err) {
            console.error('[MOONSHINE] plantSeed error:', err);
            notifs.error(player, 'Ошибка посадки. Сообщите администрации.', 'Самогоноварение');
        }
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
            notifs.success(owner, `Грядка №${index + 1} готова к сбору`, 'Самогоноварение');
            owner.call('moonshine.plot.ready', [index]);
        }
        this.broadcastPlotUpdate(index);
    },

    async harvestPlot(player, index) {
        try {
            if (!this.isMoonshiner(player)) return;
            const plot = this.plots[index];
            if (!plot) return notifs.error(player, 'Грядка не найдена', 'Самогоноварение');
            if (plot.state !== 'ready') {
                if (plot.state === 'growing') return notifs.warning(player, 'Урожай еще созревает', 'Самогоноварение');
                if (plot.state === 'cooldown') return notifs.warning(player, 'Грядка восстанавливается', 'Самогоноварение');
                return notifs.warning(player, 'Эта грядка пока недоступна', 'Самогоноварение');
            }
            if (plot.ownerId !== player.id) return notifs.error(player, 'Вы не сажали эту грядку', 'Самогоноварение');

            const giveResult = await this.addStackableItem(player, this.caneItemId, this.harvestPerSeed);
            if (!giveResult.success) {
                return notifs.error(player, giveResult.error || 'Недостаточно места для урожая', 'Самогоноварение');
            }

            plot.state = 'cooldown';
            plot.ownerId = null;
            plot.ownerName = null;
            const level = this.getPlayerLevel(player);
            const cooldownTime = this.getProcessTime(this.baseCooldownRange, level);
            plot.cooldownAt = Date.now() + cooldownTime;
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
            plot.cooldownTimer = timer.add(() => this.resetPlot(index), cooldownTime);

            this.registerHarvest(player, this.harvestPerSeed);
            notifs.success(player, 'Вы собрали сахарный тростник', 'Самогоноварение');
            this.broadcastPlotUpdate(index);
            this.sendMenuUpdate(player);
        } catch (err) {
            console.error('[MOONSHINE] harvestPlot error:', err);
            notifs.error(player, 'Ошибка сбора. Сообщите администрации.', 'Самогоноварение');
        }
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
        data.totalHarvest = (data.totalHarvest || 0) + amount;

        const skill = jobs.getJobSkill(player, this.jobId);
        if (skill) {
            const harvestExp = this.getHarvestExp(amount);
            const maxExp = this.maxLevel * this.getExpPerLevel();
            const oldExp = skill.exp;
            const desired = Math.min(maxExp, oldExp + harvestExp);
            const target = oldExp + (desired - oldExp) / jobs.bonusSkill;
            jobs.setJobExp(player, skill, target);
        }
    },

    getHarvestExp(amount) {
        return amount * (this.getExpPerLevel() / this.harvestsPerLevel);
    },

    async buySeeds(player, amount) {
        try {
            if (!this.isMoonshiner(player)) return;
            amount = parseInt(amount);
            if (isNaN(amount) || amount <= 0) return notifs.error(player, 'Некорректное количество семян', 'Самогоноварение');
            amount = Math.clamp(amount, 1, 100);
            const price = amount * this.seedsPrice;
            money.removeCash(player, price, async (res) => {
                if (!res) return notifs.error(player, 'Недостаточно наличных', 'Самогоноварение');
                const giveResult = await this.addStackableItem(player, this.seedItemId, amount);
                if (!giveResult.success) {
                    money.addCash(player, price, () => {}, 'Возврат за семена');
                    return notifs.error(player, giveResult.error || 'Ошибка добавления семян', 'Самогоноварение');
                }
                notifs.success(player, `Куплено ${amount} семян тростника`, 'Самогоноварение');
                this.sendMenuUpdate(player);
            }, 'Покупка семян тростника');
        } catch (err) {
            console.error('[MOONSHINE] buySeeds error:', err);
            notifs.error(player, 'Ошибка покупки семян. Сообщите администрации.', 'Самогоноварение');
        }
    },

    showMainMenu(player) {
        if (!this.isMoonshiner(player)) return;
        this.sendMenuUpdate(player);
        player.call('moonshine.menu.show', [this.collectMenuData(player)]);
    },

    showVendorMenu(player) {
        if (!this.isMoonshiner(player)) return;
        this.sendMenuUpdate(player);
        player.call('moonshine.vendor.show', [this.collectMenuData(player)]);
    },

    showCraftMenu(player) {
        if (!this.isMoonshiner(player)) return;
        const data = this.collectCraftData(player);
        player.call('moonshine.craft.menu.show', [data]);
    },

    async craftMoonshine(player, amount) {
        try {
            if (!this.isMoonshiner(player)) return;
            amount = parseInt(amount);
            if (isNaN(amount) || amount <= 0) return;
            const data = this.collectCraftData(player);
            if (data.maxBatch <= 0) return notifs.warning(player, 'У вас недостаточно навыка для варки', 'Самогоноварение');
            amount = Math.clamp(amount, 1, data.maxBatch);

            const caneNeeded = this.canePerMoonshine * amount;
            if (data.cane < caneNeeded) return notifs.warning(player, 'Недостаточно сахарного тростника', 'Самогоноварение');
            if (data.bottles < amount) return notifs.warning(player, 'Не хватает пустых бутылок', 'Самогоноварение');

            const removeCane = await this.consumeItems(player, this.caneItemId, caneNeeded);
            if (!removeCane) return notifs.error(player, 'Не удалось изъять тростник', 'Самогоноварение');
            const removeBottle = await this.consumeItems(player, this.bottleItemId, amount);
            if (!removeBottle) {
                await this.addStackableItem(player, this.caneItemId, caneNeeded);
                return notifs.error(player, 'Не удалось изъять бутылки', 'Самогоноварение');
            }

            const addProduct = await this.addStackableItem(player, this.moonshineItemId, amount);
            if (!addProduct.success) {
                await this.addStackableItem(player, this.caneItemId, caneNeeded);
                await this.addStackableItem(player, this.bottleItemId, amount);
                return notifs.error(player, addProduct.error || 'Не удалось выдать самогон', 'Самогоноварение');
            }

            const dataStore = this.ensureJobData(player);
            dataStore.totalBrewed = (dataStore.totalBrewed || 0) + amount;

            const skill = jobs.getJobSkill(player, this.jobId);
            if (skill) {
                const craftExp = amount * this.craftExp;
                const maxExp = this.maxLevel * this.getExpPerLevel();
                const oldExp = skill.exp;
                const desired = Math.min(maxExp, oldExp + craftExp);
                const target = oldExp + (desired - oldExp) / jobs.bonusSkill;
                jobs.setJobExp(player, skill, target);
            }

            notifs.success(player, `Вы изготовили ${amount} бутыл. самогона`, 'Самогоноварение');
            this.sendMenuUpdate(player);
            player.call('moonshine.craft.menu.update', [this.collectCraftData(player)]);
        } catch (err) {
            console.error('[MOONSHINE] craftMoonshine error:', err);
            notifs.error(player, 'Ошибка варки. Сообщите администрации.', 'Самогоноварение');
        }
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
                result.action = this.hasItem(player, this.seedItemId, 1) ? 'plant' : null;
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

    broadcastPlotUpdate(index) {
        const plot = this.plots[index];
        if (!plot) return;
        mp.players.forEach(player => {
            if (!this.isMoonshiner(player)) return;
            const info = this.serializePlotForPlayer(plot, player);
            player.call('moonshine.plot.update', [index, info]);
        });
    },

    syncPlotsForPlayer(player) {
        if (!this.isMoonshiner(player)) return;
        const positions = this.plotsData.map(plot => ({ x: plot.x, y: plot.y, z: plot.z }));
        player.call('moonshine.plots.init', [positions]);
        this.refreshPlayerPlots(player);
    },

    refreshPlayerPlots(player) {
        if (!this.isMoonshiner(player)) return;
        this.plots.forEach((plot, index) => {
            const info = this.serializePlotForPlayer(plot, player);
            player.call('moonshine.plot.update', [index, info]);
        });
    },

    collectMenuData(player) {
        const data = this.ensureJobData(player);
        const skill = jobs.getJobSkill(player, this.jobId);
        const exp = skill ? skill.exp : 0;
        const expPerLevel = this.getExpPerLevel();
        const level = Math.min(this.maxLevel, Math.floor(exp / expPerLevel));
        const nextLevelExp = Math.min(this.maxLevel * expPerLevel, (level + 1) * expPerLevel);
        const progress = level >= this.maxLevel ? 1 : (exp - level * expPerLevel) / expPerLevel;
        const toNext = level >= this.maxLevel ? 0 : Math.max(0, Math.round(nextLevelExp - exp));
        const seeds = this.getInventoryCount(player, this.seedItemId);
        const cane = this.getInventoryCount(player, this.caneItemId);
        const bottles = this.getInventoryCount(player, this.bottleItemId);
        const skillPercent = Math.round(Math.min(100, exp));

        return {
            level,
            maxLevel: this.maxLevel,
            progress: Math.round(progress * 100),
            seeds,
            cane,
            bottles,
            totalHarvest: data.totalHarvest || 0,
            totalBrewed: data.totalBrewed || 0,
            toNext,
            seedPrice: this.seedsPrice,
            canePerBatch: this.canePerMoonshine,
            skillPercent,
            maxBatch: this.getMaxBatch(skillPercent),
        };
    },

    collectCraftData(player) {
        const menu = this.collectMenuData(player);
        const options = [];
        if (menu.maxBatch >= 1) options.push('1 бутылка');
        if (menu.maxBatch >= 2) options.push('2 бутылки');
        if (menu.maxBatch >= 3) options.push('3 бутылки');
        return {
            cane: menu.cane,
            bottles: menu.bottles,
            skillPercent: menu.skillPercent,
            maxBatch: menu.maxBatch,
            canePerBatch: this.canePerMoonshine,
            options,
        };
    },

    sendMenuUpdate(player) {
        if (!this.isMoonshiner(player)) return;
        const info = this.collectMenuData(player);
        player.call('moonshine.menu.update', [info]);
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

    getProcessTime(range, level) {
        const min = range[0];
        const max = range[1];
        const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
        const reduced = randomTime - level * this.levelReductionMs;
        return Math.max(this.minProcessTime, reduced);
    },

    getPlotOwner(ownerId) {
        if (ownerId == null) return null;
        return mp.players.at(ownerId);
    },

    getInventoryCount(player, itemId) {
        const items = inventory.getArrayByItemId(player, itemId);
        if (!items || !items.length) return 0;
        return items.reduce((sum, item) => {
            const param = inventory.getParam(item, 'count');
            if (param) return sum + parseInt(param.value) || 0;
            return sum + 1;
        }, 0);
    },

    hasItem(player, itemId, amount = 1) {
        return this.getInventoryCount(player, itemId) >= amount;
    },

    async addStackableItem(player, itemId, amount) {
        const info = inventory.getInventoryItem(itemId);
        if (!info) return { success: false, error: 'Неизвестный предмет' };
        const nextWeight = inventory.getCommonWeight(player) + info.weight * amount;
        if (nextWeight > inventory.maxPlayerWeight) {
            return { success: false, error: `Превышение по весу (${nextWeight.toFixed(2)} из ${inventory.maxPlayerWeight} кг)` };
        }
        const existing = inventory.getItemByItemId(player, itemId);
        if (existing) {
            const param = inventory.getParam(existing, 'count');
            if (param) {
                const current = parseInt(param.value) || 0;
                inventory.updateParam(player, existing, 'count', current + amount);
                return { success: true, stacked: true };
            }
        }
        let error = null;
        await inventory.addItem(player, itemId, { count: amount }, (e) => { error = e; });
        if (error) return { success: false, error };
        return { success: true };
    },

    async consumeItems(player, itemId, amount) {
        if (!this.hasItem(player, itemId, amount)) return false;
        let remaining = amount;
        const items = inventory.getArrayByItemId(player, itemId);
        for (let i = 0; i < items.length && remaining > 0; i++) {
            const item = items[i];
            const param = inventory.getParam(item, 'count');
            if (param) {
                const current = parseInt(param.value) || 0;
                if (current > remaining) {
                    inventory.updateParam(player, item, 'count', current - remaining);
                    remaining = 0;
                } else {
                    inventory.deleteItem(player, item);
                    remaining -= current;
                }
            } else {
                inventory.deleteItem(player, item);
                remaining -= 1;
            }
        }
        return remaining <= 0;
    },

    getMaxBatch(skillPercent) {
        if (skillPercent >= 100) return 3;
        if (skillPercent > 30) return 2;
        return 1;
    },

    applyMoonshineEffect(player) {
        if (!player || !player.character) return;
        this.clearMoonshineEffect(player);
        const duration = 3 * 60 * 1000;
        const effect = {
            endTime: Date.now() + duration,
            timer: null,
        };
        player.moonshineEffect = effect;
        player.health = Math.min(120, Math.max(player.health, 120));
        player.setVariable('moonshine.effect', { active: true, speedMultiplier: 1.1, expires: effect.endTime });
        effect.timer = timer.addInterval(() => this.checkMoonshineEffect(player), 1000);
    },

    checkMoonshineEffect(player) {
        if (!player || !mp.players.exists(player)) return;
        const effect = player.moonshineEffect;
        if (!effect) return;
        if (!player.character) {
            this.clearMoonshineEffect(player);
            return;
        }
        if (player.health <= 10) {
            notifs.warning(player, 'Самогон перестал действовать', 'Самогоноварение');
            this.clearMoonshineEffect(player);
            return;
        }
        if (Date.now() >= effect.endTime) {
            notifs.info(player, 'Эффект самогона закончился', 'Самогоноварение');
            this.clearMoonshineEffect(player);
        }
    },

    clearMoonshineEffect(player) {
        const effect = player && player.moonshineEffect;
        if (!effect) return;
        if (effect.timer) timer.remove(effect.timer);
        delete player.moonshineEffect;
        if (player && mp.players.exists(player)) {
            if (player.health > 100) player.health = Math.min(player.health, 100);
            player.setVariable('moonshine.effect', null);
        }
    },

    async consumeMoonshine(player, item) {
        if (!player || !player.character) return;
        const header = 'Самогон';
        const itemName = inventory.getName(item.itemId);
        const performDrink = (target) => {
            if (!target || !target.character) return;
            inventory.deleteItem(target, item);
            inventory.notifyOverhead(target, `Выпил '${itemName}'`);
            notifs.success(target, `Вы выпили ${itemName}`, header);
            this.applyMoonshineEffect(target);
            target.call('inventory.setHandsBlock', [false, true]);
        };

        if (!player.vehicle) {
            const time = 7000;
            mp.players.forEachInRange(player.position, 20, rec => {
                rec.call('animations.play', [player.id, {
                    dict: 'amb@code_human_wander_drinking_fat@female@idle_a',
                    name: 'idle_c',
                    speed: 1,
                    flag: 49,
                }, time]);
            });
            const playerId = player.id;
            const characterId = player.character.id;
            timer.add(() => {
                const rec = mp.players.at(playerId);
                if (!rec || !rec.character || rec.character.id !== characterId) return;
                performDrink(rec);
            }, time);
        } else {
            performDrink(player);
        }
    },
};
