"use strict";

const config = require('./config');

const notifs = call('notifications');
const money = call('money');
const jobs = call('jobs');
const timer = call('timer');
const inventory = call('inventory');
const logger = call('logger');

const MODULE_NAME = 'Самогоноварение';

const STAGES = {
    EMPTY: 'empty',
    SEEDED: 'seeded',
    SPROUT: 'sprout',
    MATURE: 'mature',
};

const CRAFT_STATES = {
    IDLE: 'idle',
    PROCESS: 'processing',
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getTodayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

module.exports = {
    config,
    plots: [],
    plotsById: new Map(),
    activeByOwner: new Map(),
    seedPurchases: new Map(),
    activeCrafts: new Map(),
    vendorColshape: null,
    vendorMarker: null,
    vendorBlip: null,
    menuColshape: null,
    menuMarker: null,
    menuBlip: null,
    craftColshape: null,
    craftMarker: null,
    craftBlip: null,

    async init() {
        this.resetState();
        this.createVendorZone();
        this.createMenuZone();
        this.createCraftZone();
        await this.loadPlotsFromDatabase();
        await this.restoreState().catch(err => console.error('[MOONSHINE] restoreState error', err));

        mp.players.forEach(player => {
            if (!player || !player.character) return;
            if (this.isWorker(player)) {
                this.startWork(player);
            }
        });
    },

    shutdown() {
        this.plots.forEach(plot => {
            this.disposePlot(plot);
        });
        this.destroyVendorZone();
        this.destroyMenuZone();
        this.destroyCraftZone();
        this.activeCrafts.forEach(session => {
            if (session && session.timer) timer.remove(session.timer);
        });
        this.activeCrafts.clear();
        this.seedPurchases.clear();
    },

    resetState() {
        if (this.plots.length) {
            this.plots.forEach(plot => this.disposePlot(plot));
        }
        this.destroyVendorZone();
        this.destroyMenuZone();
        this.destroyCraftZone();
        this.plots = [];
        this.plotsById.clear();
        this.activeByOwner.clear();
        this.seedPurchases.clear();
        this.activeCrafts.clear();
        this.vendorColshape = null;
        this.vendorMarker = null;
        this.vendorBlip = null;
        this.menuColshape = null;
        this.menuMarker = null;
        this.menuBlip = null;
        this.craftColshape = null;
        this.craftMarker = null;
        this.craftBlip = null;
    },

    isWorker(player) {
        if (!player || !player.character) return false;
        if (!this.config.requireEmployment) return true;
        return player.character.job === this.config.jobId;
    },

    ensurePlayerData(player) {
        if (!player.moonshineData) {
            player.moonshineData = {
                totalPlanted: 0,
                totalHarvested: 0,
                totalBrewed: 0,
                lastCraftExp: 0,
            };
        }
        return player.moonshineData;
    },

    async loadPlotsFromDatabase() {
        try {
            const records = await db.Models.MoonshinePlot.findAll({ order: [['id', 'ASC']] });
            records.forEach(record => this.createPlotFromRecord(record));
            console.log(`[MOONSHINE] Загружено участков: ${records.length}`);
        } catch (err) {
            console.error('[MOONSHINE] Не удалось загрузить участки', err);
        }
    },

    createPlotFromRecord(record) {
        if (!record) return null;
        const index = this.plots.length;
        const id = record.id;
        const position = new mp.Vector3(Number(record.x), Number(record.y), Number(record.z));
        const radius = Number(record.radius) || this.config.defaultPlotRadius || 1.5;
        const colshape = mp.colshapes.newSphere(position.x, position.y, position.z, radius);
        const plot = {
            id,
            index,
            position,
            radius,
            colshape,
            stage: STAGES.EMPTY,
            ownerId: null,
            ownerName: null,
            stageStartedAt: null,
            nextStageAt: null,
            graceEndsAt: null,
            witherAt: null,
            stageTimer: null,
            witherTimer: null,
        };
        colshape.moonshinePlotId = id;
        colshape.onEnter = (player) => this.onPlotEnter(player, plot);
        colshape.onExit = (player) => this.onPlotExit(player, plot);
        this.plots.push(plot);
        this.plotsById.set(id, plot);

        return plot;
    },

    checkPlotPresence(player) {
        if (!player || !player.position || !this.isWorker(player)) return;
        this.plots.forEach(plot => {
            if (!plot || !plot.position) return;
            const dx = player.position.x - plot.position.x;
            const dy = player.position.y - plot.position.y;
            const dz = player.position.z - plot.position.z;
            if ((dx * dx + dy * dy + dz * dz) <= (plot.radius * plot.radius)) {
                this.onPlotEnter(player, plot);
            }
        });
    },

    async addPlot(position, radius = null) {
        if (!position) throw new Error('Position is required');
        const defaultRadius = this.config.defaultPlotRadius || 1.5;
        let value = Number(radius);
        if (!value || !isFinite(value) || value <= 0) {
            value = defaultRadius;
        }
        try {
            const record = await db.Models.MoonshinePlot.create({
                x: Number(position.x),
                y: Number(position.y),
                z: Number(position.z),
                radius: value,
            });
            const plot = this.createPlotFromRecord(record);
            if (plot) {
                mp.players.forEach(player => this.syncPlotsForPlayer(player));
            }
            return plot;
        } catch (err) {
            console.error('[MOONSHINE] Не удалось создать участок', err);
            throw err;
        }
    },

    destroyVendorZone() {
        try {
            if (this.vendorMarker) this.vendorMarker.destroy();
            if (this.vendorColshape) this.vendorColshape.destroy();
            if (this.vendorBlip) this.vendorBlip.destroy();
        } catch (err) {
            console.warn('[MOONSHINE] Failed to destroy vendor zone', err);
        }
        this.vendorMarker = null;
        this.vendorColshape = null;
        this.vendorBlip = null;
    },

    destroyMenuZone() {
        try {
            if (this.menuMarker) this.menuMarker.destroy();
            if (this.menuColshape) this.menuColshape.destroy();
            if (this.menuBlip) this.menuBlip.destroy();
        } catch (err) {
            console.warn('[MOONSHINE] Failed to destroy menu zone', err);
        }
        mp.players.forEach(player => {
            if (!player || !mp.players.exists(player)) return;
            if (!player.character) return;
            if (player.moonshineAtMenuZone) {
                player.moonshineAtMenuZone = false;
                try {
                    player.call('moonshine.menu.exit');
                    player.call('moonshine.menu.hide');
                } catch (e) {
                    // ignore call errors
                }
            }
        });
        this.menuMarker = null;
        this.menuColshape = null;
        this.menuBlip = null;
    },

    destroyCraftZone() {
        try {
            if (this.craftMarker) this.craftMarker.destroy();
            if (this.craftColshape) this.craftColshape.destroy();
            if (this.craftBlip) this.craftBlip.destroy();
        } catch (err) {
            console.warn('[MOONSHINE] Failed to destroy craft zone', err);
        }
        this.craftMarker = null;
        this.craftColshape = null;
        this.craftBlip = null;
    },

    disposePlot(plot) {
        if (!plot) return;
        this.clearPlotTimers(plot);
        try {
            if (plot.colshape) plot.colshape.destroy();
        } catch (err) {
            console.warn('[MOONSHINE] Failed to destroy plot colshape', err);
        }
        plot.colshape = null;
    },

    createVendorZone() {
        const pos = this.config.vendor.position;
        if (!pos) return;
        this.destroyVendorZone();
        const vector = new mp.Vector3(pos.x, pos.y, pos.z);
        this.vendorMarker = mp.markers.new(1, vector, 0.75, { color: [120, 200, 80, 120] });
        this.vendorColshape = mp.colshapes.newSphere(vector.x, vector.y, vector.z, 1.5);
        this.vendorColshape.onEnter = (player) => {
            if (!this.isWorker(player)) return;
            player.call('moonshine.vendor.enter');
        };
        this.vendorColshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('moonshine.vendor.exit');
        };
        this.vendorBlip = mp.blips.new(431, new mp.Vector3(vector.x, vector.y, vector.z + 1.5), {
            name: 'Продавец семян',
            color: 11,
            shortRange: true,
            scale: 0.9,
        });
    },

    createMenuZone() {
        const menuConfig = this.config.menu || {};
        const pos = menuConfig.position;
        if (!pos) return;
        this.destroyMenuZone();
        const vector = new mp.Vector3(pos.x, pos.y, pos.z);
        const radius = Number(menuConfig.radius) || 1.5;
        this.menuMarker = mp.markers.new(1, vector, 0.75, { color: [80, 180, 255, 120] });
        this.menuColshape = mp.colshapes.newSphere(vector.x, vector.y, vector.z, radius);
        this.menuColshape.onEnter = (player) => {
            if (!player || !player.character) return;
            player.moonshineAtMenuZone = true;
            player.call('moonshine.menu.enter');
            this.sendMenuUpdate(player);
        };
        this.menuColshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.moonshineAtMenuZone = false;
            player.call('moonshine.menu.exit');
            player.call('moonshine.menu.hide');
        };
        const blipCfg = menuConfig.blip || {};
        const sprite = blipCfg.sprite != null ? blipCfg.sprite : 566;
        const color = blipCfg.color != null ? blipCfg.color : 46;
        const scale = blipCfg.scale != null ? blipCfg.scale : 0.9;
        const name = blipCfg.name || 'Самогонщик';
        this.menuBlip = mp.blips.new(sprite, new mp.Vector3(vector.x, vector.y, vector.z + 1.5), {
            name,
            color,
            shortRange: true,
            scale,
        });
        const radiusSq = radius * radius;
        mp.players.forEach(player => {
            if (!player || !player.character || !player.position) return;
            const dx = player.position.x - vector.x;
            const dy = player.position.y - vector.y;
            const dz = player.position.z - vector.z;
            if ((dx * dx + dy * dy + dz * dz) <= radiusSq) {
                this.menuColshape.onEnter(player);
            }
        });
    },

    createCraftZone() {
        const pos = this.config.craft.position;
        if (!pos) return;
        this.destroyCraftZone();
        const vector = new mp.Vector3(pos.x, pos.y, pos.z);
        this.craftMarker = mp.markers.new(1, vector, 0.75, { color: [255, 140, 40, 120] });
        this.craftColshape = mp.colshapes.newSphere(vector.x, vector.y, vector.z, 1.5);
        this.craftColshape.onEnter = (player) => {
            if (!this.isWorker(player)) return;
            player.call('moonshine.craft.enter');
        };
        this.craftColshape.onExit = (player) => {
            if (!player || !player.character) return;
            player.call('moonshine.craft.exit');
            this.abortCraft(player, 'left_area', true);
        };
        this.craftBlip = mp.blips.new(436, new mp.Vector3(vector.x, vector.y, vector.z + 1.5), {
            name: 'Самогонный аппарат',
            color: 5,
            shortRange: true,
            scale: 0.9,
        });
    },

    async restoreState() {
        try {
            const plants = await db.Models.MoonshinePlant.findAll();
            const now = Date.now();
            for (const record of plants) {
                const plot = this.plotsById.get(record.plotId);
                if (!plot) {
                    await record.destroy();
                    continue;
                }
                let stage = record.stage || STAGES.SEEDED;
                let stageStartedAt = Number(record.stageStartedAt) || Number(record.seededAt) || now;
                let nextStageAt = Number(record.nextStageAt) || null;
                let graceEndsAt = Number(record.graceEndsAt) || null;
                let witherAt = Number(record.witherAt) || null;

                const seededDuration = this.config.planting.seededToSproutMs;
                const sproutDuration = this.config.planting.sproutToMatureMs;

                if (stage === STAGES.SEEDED && nextStageAt && now >= nextStageAt) {
                    stage = STAGES.SPROUT;
                    stageStartedAt = nextStageAt;
                    nextStageAt = stageStartedAt + sproutDuration;
                }

                if (stage === STAGES.SPROUT && nextStageAt && now >= nextStageAt) {
                    stage = STAGES.MATURE;
                    stageStartedAt = nextStageAt;
                    graceEndsAt = stageStartedAt + this.config.planting.gracePeriodMs;
                    witherAt = stageStartedAt + this.config.planting.witherAfterMs;
                    nextStageAt = null;
                }

                if (stage === STAGES.MATURE && witherAt && now >= witherAt) {
                    await record.destroy();
                    this.logEvent(`Посев #${plot.id} завял (просрочено восстановление)`, record.ownerId);
                    continue;
                }

                plot.stage = stage;
                plot.ownerId = record.ownerId;
                plot.ownerName = record.ownerName;
                plot.stageStartedAt = stageStartedAt;
                plot.nextStageAt = nextStageAt;
                plot.graceEndsAt = graceEndsAt;
                plot.witherAt = witherAt;

                if (plot.ownerId) {
                    this.activeByOwner.set(plot.ownerId, (this.activeByOwner.get(plot.ownerId) || 0) + 1);
                }

                if (stage === STAGES.SEEDED || stage === STAGES.SPROUT) {
                    const duration = stage === STAGES.SEEDED ? seededDuration : sproutDuration;
                    const endAt = stage === STAGES.SEEDED ? (stageStartedAt + seededDuration) : (stageStartedAt + sproutDuration);
                    plot.nextStageAt = endAt;
                    const remaining = clamp(endAt - now, 500, duration);
                    plot.stageTimer = timer.add(() => this.advanceStage(plot), remaining);
                } else if (stage === STAGES.MATURE && witherAt) {
                    const remaining = clamp(witherAt - now, 500, this.config.planting.witherAfterMs);
                    plot.witherTimer = timer.add(() => this.handleWither(plot), remaining);
                }

                await record.update({
                    stage,
                    stageStartedAt,
                    nextStageAt: plot.nextStageAt,
                    graceEndsAt: plot.graceEndsAt,
                    witherAt: plot.witherAt,
                });
            }
        } catch (err) {
            console.error('[MOONSHINE] Failed to restore state', err);
        }
    },

    clearPlotTimers(plot) {
        if (!plot) return;
        if (plot.stageTimer) {
            timer.remove(plot.stageTimer);
            plot.stageTimer = null;
        }
        if (plot.witherTimer) {
            timer.remove(plot.witherTimer);
            plot.witherTimer = null;
        }
    },

    onPlotEnter(player, plot) {
        if (!this.isWorker(player)) return;
        const info = this.serializePlot(plot, player);
        player.call('moonshine.plot.enter', [plot.index, info]);
    },

    onPlotExit(player, plot) {
        if (!player || !player.character) return;
        player.call('moonshine.plot.exit', [plot.index]);
    },

    serializePlot(plot, player) {
        const now = Date.now();
        const info = {
            state: plot.stage,
            ownerId: plot.ownerId,
            ownerName: plot.ownerName,
            timeLeft: 0,
            action: null,
        };

        let nextTime = null;
        if (plot.stage === STAGES.SEEDED || plot.stage === STAGES.SPROUT) {
            nextTime = plot.nextStageAt;
        } else if (plot.stage === STAGES.MATURE) {
            nextTime = plot.witherAt;
        }
        if (nextTime) {
            info.timeLeft = Math.max(0, nextTime - now);
        }

        const characterId = player && player.character ? player.character.id : null;
        const hasSeed = this.hasItem(player, this.config.items.seed);
        const maxReached = this.getActiveByOwner(characterId) >= this.config.planting.maxActivePerPlayer;

        if (plot.stage === STAGES.EMPTY) {
            if (!maxReached && hasSeed) info.action = 'plant';
            info.state = 'empty';
        }

        if (plot.stage === STAGES.SEEDED || plot.stage === STAGES.SPROUT) {
            info.state = plot.stage;
        }

        if (plot.stage === STAGES.MATURE) {
            const isOwner = characterId && plot.ownerId === characterId;
            const graceActive = plot.graceEndsAt && now < plot.graceEndsAt;
            if (isOwner || !graceActive) {
                info.action = 'harvest';
            }
            info.graceEndsIn = graceActive ? plot.graceEndsAt - now : 0;
        }

        if (plot.stage !== STAGES.EMPTY && plot.ownerId && plot.ownerName) {
            info.owner = plot.ownerName;
        }

        return info;
    },

    broadcastPlotUpdate(plot) {
        if (!plot) return;
        mp.players.forEach(player => {
            if (!this.isWorker(player)) return;
            const info = this.serializePlot(plot, player);
            player.call('moonshine.plot.update', [plot.index, info]);
        });
    },

    syncPlotsForPlayer(player) {
        if (!this.isWorker(player)) return;
        const positions = this.plots.map(plot => ({ x: plot.position.x, y: plot.position.y, z: plot.position.z }));
        player.call('moonshine.plots.init', [positions]);
        this.refreshPlotsForPlayer(player);
        this.syncPlotStages(player);
        this.checkPlotPresence(player);
    },

    syncPlotStages(player) {
        if (!this.isWorker(player)) return;
        const stages = this.plots.map(plot => ({
            index: plot.index,
            stage: plot.stage || STAGES.EMPTY,
        }));
        player.call('cane:stageSync', [stages]);
    },

    emitStageUpdate(plot, targets = null) {
        if (!plot) return;
        const payload = [plot.index, plot.stage || STAGES.EMPTY];
        if (targets) {
            const list = Array.isArray(targets) ? targets : [targets];
            list.forEach(player => {
                if (!player || !mp.players.exists(player)) return;
                if (!this.isWorker(player)) return;
                player.call('cane:stageUpdate', payload);
            });
            return;
        }
        mp.players.forEach(player => {
            if (!this.isWorker(player)) return;
            player.call('cane:stageUpdate', payload);
        });
    },

    refreshPlotsForPlayer(player) {
        if (!this.isWorker(player)) return;
        this.plots.forEach(plot => {
            const info = this.serializePlot(plot, player);
            player.call('moonshine.plot.update', [plot.index, info]);
        });
    },

    getActiveByOwner(characterId) {
        if (!characterId) return 0;
        return this.activeByOwner.get(characterId) || 0;
    },

    adjustActiveByOwner(characterId, delta) {
        if (!characterId) return;
        const current = this.getActiveByOwner(characterId) + delta;
        if (current <= 0) this.activeByOwner.delete(characterId);
        else this.activeByOwner.set(characterId, current);
    },

    async getDailyPurchase(player) {
        if (!player || !player.character) {
            return { used: 0, remaining: this.config.vendor.dailyLimit, record: null };
        }
        const today = getTodayKey();
        const key = `${player.character.id}:${today}`;
        let record = this.seedPurchases.get(key);
        if (!record) {
            record = await db.Models.MoonshineSeedPurchase.findOne({ where: { characterId: player.character.id, date: today } });
            if (record) this.seedPurchases.set(key, record);
        }
        const used = record ? (record.amount || 0) : 0;
        const remaining = Math.max(0, this.config.vendor.dailyLimit - used);
        return { used, remaining, record };
    },

    async plantSeed(player, plotIndex) {
        if (!this.isWorker(player)) return;
        const plot = this.plots[parseInt(plotIndex)];
        if (!plot) return notifs.error(player, 'Грядка не найдена', MODULE_NAME);
        if (plot.stage !== STAGES.EMPTY) return notifs.warning(player, 'Грядка занята', MODULE_NAME);
        if (!player.character) return;

        const characterId = player.character.id;
        const limit = this.config.planting.maxActivePerPlayer;
        if (this.getActiveByOwner(characterId) >= limit) {
            return notifs.warning(player, `Достигнут лимит активных посадок (${limit})`, MODULE_NAME);
        }

        const seedRemoved = await this.consumeItems(player, this.config.items.seed, 1);
        if (!seedRemoved) {
            return notifs.error(player, 'Нет семян тростника', MODULE_NAME);
        }

        const now = Date.now();
        const seededDuration = this.config.planting.seededToSproutMs;
        const nextStageAt = now + seededDuration;

        this.clearPlotTimers(plot);
        plot.stage = STAGES.SEEDED;
        plot.ownerId = characterId;
        plot.ownerName = player.name;
        plot.stageStartedAt = now;
        plot.nextStageAt = nextStageAt;
        plot.graceEndsAt = null;
        plot.witherAt = null;
        plot.stageTimer = timer.add(() => this.advanceStage(plot), seededDuration);

        await db.Models.MoonshinePlant.upsert({
            plotId: plot.id,
            stage: STAGES.SEEDED,
            ownerId: characterId,
            ownerName: player.name,
            seededAt: now,
            stageStartedAt: now,
            nextStageAt,
            graceEndsAt: null,
            witherAt: null,
        });

        this.adjustActiveByOwner(characterId, 1);
        this.ensurePlayerData(player).totalPlanted += 1;

        player.call('cane:plant', [plot.id]);
        this.emitStageUpdate(plot);
        this.broadcastPlotUpdate(plot);
        this.sendMenuUpdate(player);
        notifs.info(player, 'Вы посадили семя тростника', MODULE_NAME);
        this.logEvent(`Персонаж ${player.name} посадил семя на грядке #${plot.id}`, characterId);
    },

    async advanceStage(plot) {
        if (!plot) return;
        this.clearPlotTimers(plot);
        const now = Date.now();
        const record = await db.Models.MoonshinePlant.findOne({ where: { plotId: plot.id } });
        if (!record) {
            plot.stage = STAGES.EMPTY;
            plot.ownerId = null;
            plot.ownerName = null;
            this.broadcastPlotUpdate(plot);
            return;
        }

        if (plot.stage === STAGES.SEEDED) {
            plot.stage = STAGES.SPROUT;
            plot.stageStartedAt = now;
            plot.nextStageAt = now + this.config.planting.sproutToMatureMs;
            record.stage = STAGES.SPROUT;
            record.stageStartedAt = plot.stageStartedAt;
            record.nextStageAt = plot.nextStageAt;
            await record.save();
            plot.stageTimer = timer.add(() => this.advanceStage(plot), this.config.planting.sproutToMatureMs);
            this.emitStageUpdate(plot);
            this.broadcastPlotUpdate(plot);
            this.logEvent(`Грядка #${plot.id} перешла в стадию ростка`, plot.ownerId);
            return;
        }

        if (plot.stage === STAGES.SPROUT) {
            plot.stage = STAGES.MATURE;
            plot.stageStartedAt = now;
            plot.nextStageAt = null;
            plot.graceEndsAt = now + this.config.planting.gracePeriodMs;
            plot.witherAt = now + this.config.planting.witherAfterMs;
            record.stage = STAGES.MATURE;
            record.stageStartedAt = plot.stageStartedAt;
            record.nextStageAt = null;
            record.graceEndsAt = plot.graceEndsAt;
            record.witherAt = plot.witherAt;
            await record.save();
            plot.witherTimer = timer.add(() => this.handleWither(plot), this.config.planting.witherAfterMs);
            this.emitStageUpdate(plot);
            this.broadcastPlotUpdate(plot);
            if (plot.ownerId != null) {
                const owner = this.findOnlineByCharacterId(plot.ownerId);
                if (owner) notifs.success(owner, `Грядка #${plot.id} созрела`, MODULE_NAME);
            }
            this.logEvent(`Грядка #${plot.id} созрела`, plot.ownerId);
            return;
        }
    },

    async handleWither(plot) {
        this.clearPlotTimers(plot);
        if (!plot || plot.stage !== STAGES.MATURE) return;
        await db.Models.MoonshinePlant.destroy({ where: { plotId: plot.id } });
        const ownerId = plot.ownerId;
        plot.stage = STAGES.EMPTY;
        plot.ownerId = null;
        plot.ownerName = null;
        plot.stageStartedAt = null;
        plot.nextStageAt = null;
        plot.graceEndsAt = null;
        plot.witherAt = null;
        this.adjustActiveByOwner(ownerId, -1);
        this.emitStageUpdate(plot);
        this.broadcastPlotUpdate(plot);
        this.logEvent(`Грядка #${plot.id} завяла`, ownerId);
    },

    async harvestPlot(player, plotIndex) {
        if (!this.isWorker(player)) return;
        const plot = this.plots[parseInt(plotIndex)];
        if (!plot) return notifs.error(player, 'Грядка не найдена', MODULE_NAME);
        if (plot.stage !== STAGES.MATURE) return notifs.warning(player, 'Грядка не готова к сбору', MODULE_NAME);
        if (!player.character) return;

        const now = Date.now();
        const isOwner = plot.ownerId === player.character.id;
        const graceActive = plot.graceEndsAt && now < plot.graceEndsAt;
        if (graceActive && !isOwner) {
            return notifs.warning(player, 'Урожай пока доступен только посадившему игроку', MODULE_NAME);
        }

        const record = await db.Models.MoonshinePlant.findOne({ where: { plotId: plot.id } });
        if (!record) {
            plot.stage = STAGES.EMPTY;
            plot.ownerId = null;
            plot.ownerName = null;
            this.broadcastPlotUpdate(plot);
            return notifs.error(player, 'Информация о грядке утеряна', MODULE_NAME);
        }

        const [minYield, maxYield] = this.config.planting.harvestYield;
        const amount = clamp(Math.floor(Math.random() * (maxYield - minYield + 1)) + minYield, minYield, maxYield);

        const result = await this.addStackableItem(player, this.config.items.cane, amount);
        if (!result.success) {
            return notifs.error(player, result.error || 'Недостаточно места', MODULE_NAME);
        }

        player.call('cane:harvest', [plot.id, amount]);
        await db.Models.MoonshinePlant.destroy({ where: { plotId: plot.id } });

        const ownerId = plot.ownerId;
        this.adjustActiveByOwner(ownerId, -1);

        this.clearPlotTimers(plot);
        plot.stage = STAGES.EMPTY;
        plot.ownerId = null;
        plot.ownerName = null;
        plot.stageStartedAt = null;
        plot.nextStageAt = null;
        plot.graceEndsAt = null;
        plot.witherAt = null;

        const stats = this.ensurePlayerData(player);
        stats.totalHarvested += amount;

        this.emitStageUpdate(plot);
        this.broadcastPlotUpdate(plot);
        this.sendMenuUpdate(player);
        notifs.success(player, `Вы собрали ${amount} ед. тростника`, MODULE_NAME);
        this.logEvent(`Персонаж ${player.name} собрал ${amount} ед. тростника с грядки #${plot.id}`, player.character.id);
    },

    findOnlineByCharacterId(characterId) {
        if (characterId == null) return null;
        let found = null;
        mp.players.forEach(player => {
            if (!player || !player.character) return;
            if (player.character.id === characterId) {
                found = player;
            }
        });
        return found;
    },

    async buySeeds(player, amount) {
        if (!this.isWorker(player)) return;
        if (!player.character) return;
        amount = parseInt(amount);
        if (isNaN(amount) || amount <= 0) return notifs.error(player, 'Некорректное количество', MODULE_NAME);
        amount = clamp(amount, 1, this.config.vendor.dailyLimit);

        const { used: already, record } = await this.getDailyPurchase(player);
        const today = getTodayKey();
        const key = `${player.character.id}:${today}`;
        let purchase = record;

        const limit = this.config.vendor.dailyLimit;
        if (already + amount > limit) {
            return notifs.warning(player, `Лимит ${limit} семян в сутки. Доступно: ${Math.max(0, limit - already)}`, MODULE_NAME);
        }

        const price = amount * this.config.vendor.pricePerSeed;
        money.removeCash(player, price, async (success) => {
            if (!success) return notifs.error(player, 'Недостаточно наличных', MODULE_NAME);

            const result = await this.addStackableItem(player, this.config.items.seed, amount);
            if (!result.success) {
                money.addCash(player, price, () => {}, 'Возврат за семена');
                return notifs.error(player, result.error || 'Ошибка добавления семян', MODULE_NAME);
            }

            if (!purchase) {
                purchase = await db.Models.MoonshineSeedPurchase.create({
                    characterId: player.character.id,
                    date: today,
                    amount: 0,
                });
            }

            purchase.amount = already + amount;
            await purchase.save();
            this.seedPurchases.set(key, purchase);
            player.moonshineDailyRemaining = Math.max(0, limit - purchase.amount);
            this.sendMenuUpdate(player);
            notifs.success(player, `Куплено ${amount} семян`, MODULE_NAME);
            this.logEvent(`Персонаж ${player.name} купил ${amount} семян тростника за $${price}`, player.character.id);
        }, 'Покупка семян тростника');
    },

    collectMenuData(player) {
        const stats = this.ensurePlayerData(player);
        const seeds = this.getInventoryCount(player, this.config.items.seed);
        const cane = this.getInventoryCount(player, this.config.items.cane);
        const bottles = this.getInventoryCount(player, this.config.items.emptyBottle);
        const skillPercent = this.getSkillPercent(player);
        const maxOutput = this.getCraftOutput(skillPercent);
        const active = this.getActiveByOwner(player.character ? player.character.id : null);
        const seedsRemaining = player.moonshineDailyRemaining != null ? player.moonshineDailyRemaining : null;
        delete player.moonshineDailyRemaining;

        const currentJobId = player.character ? player.character.job : null;
        const employed = currentJobId === this.config.jobId;
        const canJoin = !currentJobId || employed;
        const currentJobName = currentJobId ? jobs.getJobNameById(currentJobId) : null;

        return {
            seeds,
            cane,
            bottles,
            skillPercent,
            craftOutput: maxOutput,
            totalPlanted: stats.totalPlanted,
            totalHarvested: stats.totalHarvested,
            totalBrewed: stats.totalBrewed,
            activePlots: active,
            maxPlots: this.config.planting.maxActivePerPlayer,
            seedPrice: this.config.vendor.pricePerSeed,
            dailyLimit: this.config.vendor.dailyLimit,
            seedsRemaining,
            employed,
            canJoin,
            currentJobName,
        };
    },

    sendMenuUpdate(player) {
        if (!player || !player.character) return;
        const info = this.collectMenuData(player);
        player.call('moonshine.menu.update', [info]);
    },

    openMainMenu(player) {
        if (!player || !player.character) return;
        const info = this.collectMenuData(player);
        player.call('moonshine.menu.show', [info]);
    },

    async openVendor(player) {
        if (!this.isWorker(player)) return;
        const info = await this.getDailyPurchase(player);
        player.moonshineDailyRemaining = info.remaining;
        const data = this.collectMenuData(player);
        player.call('moonshine.vendor.show', [data]);
    },

    startWork(player) {
        this.ensurePlayerData(player);
        this.syncPlotsForPlayer(player);
        this.sendMenuUpdate(player);
        player.moonshineJob = true;
        notifs.info(player, 'Вы приступили к работе варщика', MODULE_NAME);
        if (player.moonshineAtMenuZone) {
            this.openMainMenu(player);
        }
    },

    stopWork(player) {
        if (!player) return;
        delete player.moonshineJob;
        player.call('moonshine.reset');
        player.call('moonshine.menu.hide');
        player.call('moonshine.vendor.exit');
        player.call('moonshine.craft.exit');
        player.call('moonshine.craft.ui.hide');
        this.abortCraft(player, 'job_change', true);
        this.sendMenuUpdate(player);
        if (player.moonshineAtMenuZone) {
            player.call('moonshine.menu.enter');
        }
    },

    cleanupPlayer(player) {
        if (!player) return;
        this.abortCraft(player, 'disconnect', true);
        this.clearMoonshineEffect(player);
        delete player.moonshineJob;
        delete player.moonshineDrinkCooldown;
        if (player.moonshineAtMenuZone) player.moonshineAtMenuZone = false;
    },

    joinJob(player) {
        if (!player || !player.character) return;
        if (player.character.job === this.config.jobId) {
            return notifs.warning(player, 'Вы уже работаете самогонщиком', MODULE_NAME);
        }
        if (player.character.job && player.character.job !== this.config.jobId) {
            const current = jobs.getJobNameById(player.character.job) || 'другой работе';
            return notifs.error(player, `Вы уже трудоустроены (${current})`, MODULE_NAME);
        }
        mp.events.call('jobs.set', player, this.config.jobId);
    },

    leaveJob(player) {
        if (!player || !player.character) return;
        if (player.character.job !== this.config.jobId) {
            return notifs.error(player, 'Вы не работаете самогонщиком', MODULE_NAME);
        }
        mp.events.call('jobs.leave', player);
    },

    openCraftMenu(player) {
        if (!this.isWorker(player)) return;
        const data = this.collectCraftData(player);
        player.call('moonshine.craft.menu.show', [data]);
    },

    collectCraftData(player) {
        const cane = this.getInventoryCount(player, this.config.items.cane);
        const bottles = this.getInventoryCount(player, this.config.items.emptyBottle);
        const skill = this.getSkillPercent(player);
        const output = this.getCraftOutput(skill);
        const busy = this.activeCrafts.has(player.id);

        return {
            cane,
            bottles,
            skillPercent: skill,
            output,
            state: busy ? CRAFT_STATES.PROCESS : CRAFT_STATES.IDLE,
            duration: this.config.craft.durationMs,
            caneRequired: this.config.craft.caneRequired,
            bottlesRequired: this.config.craft.bottlesRequired,
        };
    },

    getSkillPercent(player) {
        const skill = jobs.getJobSkill(player, this.config.jobId);
        if (!skill) return 0;
        return clamp(Math.round(skill.exp), 0, 100);
    },

    getCraftOutput(skillPercent) {
        if (skillPercent > 60) return 3;
        if (skillPercent > 30) return 2;
        return 1;
    },

    async startCraft(player) {
        if (!this.isWorker(player)) return;
        if (!player.character) return;
        if (this.activeCrafts.has(player.id)) {
            return notifs.warning(player, 'Процесс уже запущен', MODULE_NAME);
        }

        const caneNeeded = this.config.craft.caneRequired;
        const bottlesNeeded = this.config.craft.bottlesRequired;

        if (!this.hasItem(player, this.config.items.cane, caneNeeded)) {
            return notifs.error(player, 'Недостаточно сырья', MODULE_NAME);
        }
        if (!this.hasItem(player, this.config.items.emptyBottle, bottlesNeeded)) {
            return notifs.error(player, 'Нет пустых бутылок', MODULE_NAME);
        }

        const caneRemoved = await this.consumeItems(player, this.config.items.cane, caneNeeded);
        if (!caneRemoved) {
            return notifs.error(player, 'Не удалось изъять тростник', MODULE_NAME);
        }
        const bottlesRemoved = await this.consumeItems(player, this.config.items.emptyBottle, bottlesNeeded);
        if (!bottlesRemoved) {
            await this.addStackableItem(player, this.config.items.cane, caneNeeded);
            return notifs.error(player, 'Не удалось изъять бутылки', MODULE_NAME);
        }

        const sessionId = `${player.id}-${Date.now()}`;
        const duration = this.config.craft.durationMs;
        const finishTime = Date.now() + duration;
        const session = {
            id: sessionId,
            playerId: player.id,
            characterId: player.character.id,
            cane: caneNeeded,
            bottles: bottlesNeeded,
            finishTime,
            timer: timer.add(() => this.finishCraft(player, sessionId), duration),
        };
        this.activeCrafts.set(player.id, session);
        player.call('moonshine.craft.ui.start', [sessionId, duration]);
        player.call('moonshine.craft.menu.update', [this.collectCraftData(player)]);
        this.sendMenuUpdate(player);
        this.logEvent(`Персонаж ${player.name} начал варку (партия 1)`, player.character.id);
    },

    async finishCraft(player, sessionId) {
        const session = this.activeCrafts.get(player.id);
        if (!session || session.id !== sessionId) return;
        this.activeCrafts.delete(player.id);

        const output = this.getCraftOutput(this.getSkillPercent(player));
        const result = await this.addStackableItem(player, this.config.items.moonshineBottle, output);
        if (!result.success) {
            await this.addStackableItem(player, this.config.items.cane, session.cane);
            await this.addStackableItem(player, this.config.items.emptyBottle, session.bottles);
            notifs.error(player, result.error || 'Недостаточно места для самогона', MODULE_NAME);
            this.logEvent(`Варка отменена: ${result.error || 'нет места'}`, player.character.id);
            player.call('moonshine.craft.ui.fail', [result.error || 'Нет места']);
            player.call('moonshine.craft.menu.update', [this.collectCraftData(player)]);
            return;
        }

        this.grantCraftExperience(player);
        const stats = this.ensurePlayerData(player);
        stats.totalBrewed += output;
        this.sendMenuUpdate(player);
        player.call('moonshine.craft.menu.update', [this.collectCraftData(player)]);
        notifs.success(player, `Самогон готов: ${output} бутыл.`, MODULE_NAME);
        player.call('moonshine.craft.ui.success', [output]);
        this.logEvent(`Персонаж ${player.name} завершил варку: ${output} бутылок`, player.character.id);
    },

    abortCraft(player, reason, refund) {
        const session = this.activeCrafts.get(player.id);
        if (!session) return;
        if (session.timer) timer.remove(session.timer);
        this.activeCrafts.delete(player.id);
        if (refund) {
            this.addStackableItem(player, this.config.items.cane, session.cane);
            this.addStackableItem(player, this.config.items.emptyBottle, session.bottles);
        }
        player.call('moonshine.craft.ui.abort', [reason || 'abort']);
        player.call('moonshine.craft.menu.update', [this.collectCraftData(player)]);
        this.sendMenuUpdate(player);
        this.logEvent(`Варка отменена (${reason || 'неизвестно'})`, session.characterId);
    },

    grantCraftExperience(player) {
        const skill = jobs.getJobSkill(player, this.config.jobId);
        if (!skill) return;
        const data = this.ensurePlayerData(player);
        const now = Date.now();
        if (data.lastCraftExp && now - data.lastCraftExp < this.config.craft.xpCooldownMs) {
            return;
        }
        const craftExp = this.config.craft.xpGain;
        const maxExp = 100;
        const oldExp = skill.exp;
        const desired = Math.min(maxExp, oldExp + craftExp);
        const target = oldExp + (desired - oldExp) / jobs.bonusSkill;
        jobs.setJobExp(player, skill, target);
        data.lastCraftExp = now;
    },

    sendBuffState(player) {
        if (!player || !mp.players.exists(player)) return;
        const effect = player.moonshineEffect;
        const state = effect ? {
            active: true,
            remainingMs: Math.max(0, effect.endTime - Date.now()),
        } : { active: false, remainingMs: 0 };
        player.call('moonshine:buffState', [state]);
    },

    applyMoonshineEffect(player) {
        if (!player || !player.character) return;
        const current = player.moonshineEffect;
        if (current && current.timer) timer.remove(current.timer);
        const now = Date.now();
        const effect = {
            endTime: now + this.config.effect.durationMs,
            baseMaxHealth: current && current.baseMaxHealth ? current.baseMaxHealth : 100,
            speedMultiplier: this.config.effect.speedMultiplier,
            timer: timer.addInterval(() => this.checkMoonshineEffect(player), 1000),
        };
        player.moonshineEffect = effect;
        const desiredHealth = Math.max(Number(player.health) || 0, effect.baseMaxHealth);
        player.health = Math.min(this.config.effect.maxHealth, desiredHealth);
        player.setVariable('moonshine.effect', {
            active: true,
            speedMultiplier: this.config.effect.speedMultiplier,
            expires: effect.endTime,
        });
        this.sendBuffState(player);
    },

    checkMoonshineEffect(player) {
        if (!player || !mp.players.exists(player)) return;
        const effect = player.moonshineEffect;
        if (!effect) return;
        if (!player.character) {
            this.clearMoonshineEffect(player);
            return;
        }
        const base = effect.baseMaxHealth || 100;
        const threshold = Math.max(1, Math.floor(base * (this.config.effect.healthThresholdPercent / 100)));
        if (player.health <= threshold) {
            notifs.warning(player, 'Эффект самогона рассеялся', MODULE_NAME);
            this.clearMoonshineEffect(player);
            return;
        }
        if (Date.now() >= effect.endTime) {
            notifs.info(player, 'Эффект самогона завершён', MODULE_NAME);
            this.clearMoonshineEffect(player);
            return;
        }
        this.sendBuffState(player);
    },

    clearMoonshineEffect(player) {
        if (!player) return;
        const effect = player.moonshineEffect;
        if (effect && effect.timer) timer.remove(effect.timer);
        if (player && mp.players.exists(player)) {
            const base = effect && effect.baseMaxHealth ? effect.baseMaxHealth : 100;
            if (player.health > base) player.health = Math.min(player.health, base);
            player.setVariable('moonshine.effect', null);
        }
        delete player.moonshineEffect;
        this.sendBuffState(player);
    },

    consumeFromStack(player, item, amount = 1) {
        if (!item) return false;
        const param = inventory.getParam(item, 'count');
        if (param) {
            const current = parseInt(param.value) || 0;
            if (current < amount) return false;
            const next = current - amount;
            if (next > 0) inventory.updateParam(player, item, 'count', next);
            else inventory.deleteItem(player, item);
            return true;
        }
        inventory.deleteItem(player, item);
        return true;
    },

    async drinkMoonshine(player, itemSqlId = null) {
        if (!player || !player.character) return false;

        const bottleId = this.config.items.moonshineBottle;
        if (!this.hasItem(player, bottleId, 1)) {
            notifs.error(player, 'Предмет не найден.', MODULE_NAME);
            return false;
        }

        if (player.health <= 0 || player.getVariable && player.getVariable('cuffs')) {
            notifs.error(player, 'Нельзя использовать сейчас.', MODULE_NAME);
            return false;
        }

        const now = Date.now();
        const cooldown = this.config.effect.useCooldownMs || 1500;
        if (player.moonshineDrinkCooldown && now < player.moonshineDrinkCooldown) {
            notifs.warning(player, 'Подождите немного, чтобы снова выпить.', MODULE_NAME);
            return false;
        }

        let targetItem = null;
        if (itemSqlId != null) {
            const sqlId = parseInt(itemSqlId);
            const item = isNaN(sqlId) ? null : inventory.getItem(player, sqlId);
            if (item && item.itemId === bottleId) targetItem = item;
        }
        if (!targetItem) {
            const items = inventory.getArrayByItemId(player, bottleId);
            if (items && items.length) targetItem = items[0];
        }
        if (!targetItem) {
            notifs.error(player, 'Предмет не найден.', MODULE_NAME);
            return false;
        }

        if (!this.consumeFromStack(player, targetItem, 1)) {
            notifs.error(player, 'Нельзя использовать сейчас.', MODULE_NAME);
            return false;
        }

        player.moonshineDrinkCooldown = now + cooldown;

        const alreadyActive = !!player.moonshineEffect;
        this.applyMoonshineEffect(player);
        inventory.notifyOverhead(player, "Выпил 'Самогон'");
        if (alreadyActive) {
            notifs.info(player, 'У вас уже активен эффект — продлил действие.', MODULE_NAME);
        } else {
            notifs.success(player, 'Вы выпили самогон', MODULE_NAME);
        }
        this.logEvent(`Персонаж ${player.name} выпил самогон`, player.character.id);
        return true;
    },

    async consumeMoonshine(player, item) {
        const sqlId = item ? item.sqlId : null;
        return this.drinkMoonshine(player, sqlId);
    },

    hasItem(player, itemId, amount = 1) {
        return this.getInventoryCount(player, itemId) >= amount;
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

    async addStackableItem(player, itemId, amount) {
        const info = inventory.getInventoryItem(itemId);
        if (!info) return { success: false, error: 'Неизвестный предмет' };
        const nextWeight = inventory.getCommonWeight(player) + info.weight * amount;
        if (nextWeight > inventory.maxPlayerWeight) {
            return { success: false, error: `Превышение веса (${nextWeight.toFixed(2)} из ${inventory.maxPlayerWeight} кг)` };
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

    logEvent(text, characterId = null) {
        try {
            logger.log(text, 'moonshine', characterId);
        } catch (e) {
            console.warn('[MOONSHINE] logger error', e);
        }
    },
};
