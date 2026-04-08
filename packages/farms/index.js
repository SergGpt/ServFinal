"use strict";

let notifs = call("notifications");
let money = call("money");
let jobs = call("jobs");
let timer = call("timer");
let inventory = call("inventory");

const JOB_ID = 5;
const FIELD_CENTER = { x: 2050.4384765625, y: 4920.4482421875, z: 40.96115493774414 };
const PLOT_GRID_SIZE = 10;
const PLOT_SPACING = 1.5;
const READY_STAGE_MS = 60 * 1000;
const OVERRIPE_STAGE_MS = 45 * 1000;

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

function isPointInsidePolygon2d(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = Number(points[i].x) || 0;
        const yi = Number(points[i].y) || 0;
        const xj = Number(points[j].x) || 0;
        const yj = Number(points[j].y) || 0;
        const intersect = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.000001) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

module.exports = {
    jobId: JOB_ID,
    exchangeRateRange: [45, 95],
    exchangeChangeInterval: 10 * 60 * 1000,
    levelReductionMs: 2000,
    minProcessTime: 10 * 1000,
    harvestsPerLevel: 100,
    maxLevel: 20,
    farmMenuPos: null,
    fieldCenter: new mp.Vector3(FIELD_CENTER.x, FIELD_CENTER.y, FIELD_CENTER.z),
    plotsData: [],
    seedTypes: [
        {
            id: "potato",
            name: "Картофель",
            buyPrice: 20,
            harvestYield: 1,
            seedItemId: 400,
            harvestItemId: 401,
            growthRange: [45 * 1000, 75 * 1000],
            cooldownRange: [30 * 1000, 60 * 1000],
            objectModel: "prop_veg_crop_03_pump",
        },
        {
            id: "cabbage",
            name: "Капуста",
            buyPrice: 45,
            harvestYield: 3,
            seedItemId: 402,
            harvestItemId: 403,
            growthRange: [120 * 1000, 180 * 1000],
            cooldownRange: [60 * 1000, 120 * 1000],
            objectModel: "prop_veg_crop_04_leaf",
        },
        {
            id: "corn",
            name: "Кукуруза",
            buyPrice: 70,
            harvestYield: 5,
            seedItemId: 404,
            harvestItemId: 405,
            growthRange: [210 * 1000, 300 * 1000],
            cooldownRange: [90 * 1000, 150 * 1000],
            objectModel: "prop_veg_crop_02",
        }
    ],
    plantZone: null,

    plots: [],
    exchangeRate: 60,
    exchangeTimer: null,
    marketSoldInCycle: 0,
    marketHistory: [],
    farmColshape: null,
    farmMarker: null,
    farmBlip: null,
    plantZoneColshape: null,
    farmZoneColumns: null,
    pendingPlotState: null,
    plotStateSaveTimer: null,

    buildPlotsFromLegacyZone(points, minZ, maxZ) {
        if (!Array.isArray(points) || points.length < 3) return [];
        const xs = points.map((p) => Number(p.x) || 0);
        const ys = points.map((p) => Number(p.y) || 0);
        const zs = points.map((p) => Number(p.z) || 0);
        const minX = Math.min.apply(null, xs);
        const maxX = Math.max.apply(null, xs);
        const minY = Math.min.apply(null, ys);
        const maxY = Math.max.apply(null, ys);
        const zoneMinZ = Number.isFinite(Number(minZ)) ? Number(minZ) : Math.min.apply(null, zs) - 1;
        const zoneMaxZ = Number.isFinite(Number(maxZ)) ? Number(maxZ) : Math.max.apply(null, zs) + 2;
        const targetZ = Number((((zoneMinZ + zoneMaxZ) / 2)).toFixed(3));
        const spacing = PLOT_SPACING;
        const result = [];
        for (let x = minX; x <= maxX; x += spacing) {
            for (let y = minY; y <= maxY; y += spacing) {
                if (!isPointInsidePolygon2d(x, y, points)) continue;
                result.push({
                    x: Number(x.toFixed(3)),
                    y: Number(y.toFixed(3)),
                    z: targetZ,
                });
            }
        }
        return result;
    },

    async init() {
        await this.ensureFarmZoneColumns();
        await this.loadPlantZoneFromDb();
        this.createFarmMenuZone();
        this.createPlots();
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

    async ensureFarmZoneColumns() {
        try {
            const [rows] = await db.sequelize.query("SHOW COLUMNS FROM farm_zones");
            const cols = new Set((rows || []).map((row) => String(row.Field || "")));
            this.farmZoneColumns = cols;
            const addColumnIfMissing = async (name, sqlType) => {
                if (cols.has(name)) return;
                await db.sequelize.query(`ALTER TABLE farm_zones ADD COLUMN ${name} ${sqlType} NULL`);
                cols.add(name);
            };
            await addColumnIfMissing("points", "LONGTEXT");
            await addColumnIfMissing("minZ", "FLOAT");
            await addColumnIfMissing("maxZ", "FLOAT");
            await addColumnIfMissing("npcX", "FLOAT");
            await addColumnIfMissing("npcY", "FLOAT");
            await addColumnIfMissing("npcZ", "FLOAT");
            await addColumnIfMissing("plotState", "LONGTEXT");
            this.farmZoneColumns = cols;
        } catch (e) {
            console.log("[farms] ensure farm_zones columns failed", e.message);
        }
    },

    shutdown() {
        if (this.exchangeTimer) timer.remove(this.exchangeTimer);
        if (this.plotStateSaveTimer) timer.remove(this.plotStateSaveTimer);
        this.plotStateSaveTimer = null;
        this.destroyFarmZone();
        this.destroyPlantZone();

        this.plots.forEach(plot => {
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
            if (plot.ripeTimer) timer.remove(plot.ripeTimer);
            if (plot.overripeTimer) timer.remove(plot.overripeTimer);
            this.destroyPlotObject(plot);
        });
    },

    createFarmMenuZone() {
        this.destroyFarmZone();
        if (!this.farmMenuPos) return;
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
                this.plantZone = null;
                this.farmMenuPos = null;
                this.plotsData = [];
                this.plots = [];
                return;
            }
            this.plantZone = {
                x: model.x,
                y: model.y,
                z: model.z,
                dx: model.dx,
                dy: model.dy,
                dz: model.dz,
                points: null,
                minZ: null,
                maxZ: null,
            };
            if (this.farmZoneColumns && this.farmZoneColumns.has("points") && model.points) {
                try {
                    const points = JSON.parse(model.points);
                    if (Array.isArray(points) && points.length) {
                        const rawPoints = points.map((p) => ({
                            x: parseFloat(p.x) || 0,
                            y: parseFloat(p.y) || 0,
                            z: parseFloat(p.z) || 0,
                        }));
                        const looksLikeLegacyZone = rawPoints.length >= 3 && !model.plotState;
                        this.plotsData = looksLikeLegacyZone
                            ? this.buildPlotsFromLegacyZone(rawPoints, model.minZ, model.maxZ)
                            : rawPoints;
                        this.plantZone.points = points;
                    }
                } catch (e) {}
            }
            if (this.farmZoneColumns && this.farmZoneColumns.has("minZ")) this.plantZone.minZ = model.minZ;
            if (this.farmZoneColumns && this.farmZoneColumns.has("maxZ")) this.plantZone.maxZ = model.maxZ;
            if (this.farmZoneColumns && this.farmZoneColumns.has("npcX") && model.npcX != null) {
                this.farmMenuPos = new mp.Vector3(model.npcX, model.npcY, model.npcZ);
            } else {
                this.farmMenuPos = null;
            }
            if (this.farmZoneColumns && this.farmZoneColumns.has("plotState") && model.plotState) {
                try {
                    const parsed = JSON.parse(model.plotState);
                    this.pendingPlotState = Array.isArray(parsed) ? parsed : null;
                } catch (e) {
                    this.pendingPlotState = null;
                }
            } else {
                this.pendingPlotState = null;
            }
        } catch (e) {
            console.log('[farms] failed load farm zone from DB', e.message);
        }
    },

    async savePlantZoneToDb() {
        try {
            const payload = {
                x: this.plantZone ? this.plantZone.x : 0,
                y: this.plantZone ? this.plantZone.y : 0,
                z: this.plantZone ? this.plantZone.z : 0,
                dx: this.plantZone ? this.plantZone.dx : 1,
                dy: this.plantZone ? this.plantZone.dy : 1,
                dz: this.plantZone ? this.plantZone.dz : 1,
                dimension: 0,
            };
            if (this.farmZoneColumns && this.farmZoneColumns.has("points")) payload.points = this.plotsData && this.plotsData.length ? JSON.stringify(this.plotsData) : null;
            if (this.farmZoneColumns && this.farmZoneColumns.has("minZ")) payload.minZ = this.plantZone ? this.plantZone.minZ : null;
            if (this.farmZoneColumns && this.farmZoneColumns.has("maxZ")) payload.maxZ = this.plantZone ? this.plantZone.maxZ : null;
            if (this.farmZoneColumns && this.farmZoneColumns.has("npcX")) {
                payload.npcX = this.farmMenuPos ? this.farmMenuPos.x : null;
                payload.npcY = this.farmMenuPos ? this.farmMenuPos.y : null;
                payload.npcZ = this.farmMenuPos ? this.farmMenuPos.z : null;
            }
            if (this.farmZoneColumns && this.farmZoneColumns.has("plotState")) {
                payload.plotState = JSON.stringify(this.serializeRuntimePlotState());
            }
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
        if (!z) return { x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, points: null, minZ: null, maxZ: null };
        return {
            x: z.x, y: z.y, z: z.z, dx: z.dx, dy: z.dy, dz: z.dz,
            points: this.plotsData.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            minZ: z.minZ,
            maxZ: z.maxZ,
        };
    },
    createPlantZone() {
        this.destroyPlantZone();
        const z = this.plantZone;
        if (!z) return;
        if (Array.isArray(z.points) && z.points.length >= 3) {
            this.broadcastPlantZone();
            return;
        }
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
        const baseZone = this.plantZone || { x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, points: null, minZ: null, maxZ: null };
        this.plantZone = Object.assign({}, baseZone, zoneData || {});
        this.createPlantZone();
    },

    setFarmMenuPosition(pos) {
        if (!pos) return;
        this.farmMenuPos = new mp.Vector3(parseFloat(pos.x) || 0, parseFloat(pos.y) || 0, parseFloat(pos.z) || 0);
        this.createFarmMenuZone();
        this.broadcastPlantZone();
    },

    broadcastPlantZone(target = null) {
        if (!this.plantZone) return;
        const z = this.plantZone;
        const payload = {
            x: z.x, y: z.y, z: z.z, dx: z.dx, dy: z.dy, dz: z.dz,
            points: Array.isArray(z.points) ? z.points : null,
            minZ: z.minZ,
            maxZ: z.maxZ,
            npcPos: this.farmMenuPos ? { x: this.farmMenuPos.x, y: this.farmMenuPos.y, z: this.farmMenuPos.z } : null,
        };
        if (target) return target.call("farms.zone.sync", [payload]);
        mp.players.forEach(player => {
            if (!player) return;
            player.call("farms.zone.sync", [payload]);
        });
    },

    reconcilePlotState(index, notifyOwner = false) {
        const plot = this.plots[index];
        if (!plot) return false;
        const now = Date.now();
        let changed = false;

        if (plot.state === "growing" && plot.readyAt && plot.readyAt <= now) {
            if (plot.growthTimer) {
                timer.remove(plot.growthTimer);
                plot.growthTimer = null;
            }
            plot.state = "ready";
            plot.readyAt = null;
            plot.ripeEndsAt = now + READY_STAGE_MS;
            if (plot.ripeTimer) timer.remove(plot.ripeTimer);
            plot.ripeTimer = timer.add(() => this.setPlotOverripe(index), READY_STAGE_MS);
            changed = true;
            if (notifyOwner) {
                const owner = this.getPlotOwner(plot.ownerId);
                if (owner) {
                    notifs.success(owner, `Грядка №${index + 1} созрела (60 сек до перезревания)`, "Ферма");
                    owner.call("farms.plot.ready", [index]);
                }
            }
        }

        if (plot.state === "ready" && plot.ripeEndsAt && plot.ripeEndsAt <= now) {
            if (plot.ripeTimer) {
                timer.remove(plot.ripeTimer);
                plot.ripeTimer = null;
            }
            plot.state = "overripe";
            plot.ripeEndsAt = null;
            plot.overripeEndsAt = now + OVERRIPE_STAGE_MS;
            if (plot.overripeTimer) timer.remove(plot.overripeTimer);
            plot.overripeTimer = timer.add(() => this.expireOverripePlot(index), OVERRIPE_STAGE_MS);
            changed = true;
        }

        if (plot.state === "overripe" && plot.overripeEndsAt && plot.overripeEndsAt <= now) {
            this.expireOverripePlot(index);
            changed = true;
        }

        return changed;
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
                ripeEndsAt: null,
                overripeEndsAt: null,
                cooldownAt: null,
                seedType: null,
                seedItemId: null,
                plantedPos: null,
                plantRadius: null,
                object: null,
                growthTimer: null,
                cooldownTimer: null,
                ripeTimer: null,
                overripeTimer: null,
            };
        });
        this.applyRuntimePlotState();
    },

    serializeRuntimePlotState() {
        return this.plots.map(plot => ({
            state: plot.state,
            ownerId: plot.ownerId,
            ownerName: plot.ownerName,
            seedType: plot.seedType,
            seedItemId: plot.seedItemId,
            plantedPos: plot.plantedPos,
            plantRadius: plot.plantRadius,
            readyAt: plot.readyAt,
            ripeEndsAt: plot.ripeEndsAt,
            overripeEndsAt: plot.overripeEndsAt,
            cooldownAt: plot.cooldownAt,
        }));
    },

    schedulePlotStateSave() {
        if (!this.farmZoneColumns || !this.farmZoneColumns.has("plotState")) return;
        if (this.plotStateSaveTimer) return;
        this.plotStateSaveTimer = timer.add(async () => {
            this.plotStateSaveTimer = null;
            await this.savePlantZoneToDb();
        }, 1200);
    },

    applyRuntimePlotState() {
        if (!Array.isArray(this.pendingPlotState) || !this.pendingPlotState.length) return;
        const now = Date.now();
        for (let i = 0; i < this.plots.length; i++) {
            const plot = this.plots[i];
            const saved = this.pendingPlotState[i];
            if (!plot || !saved || typeof saved !== "object") continue;
            if (saved.state !== "growing" && saved.state !== "ready" && saved.state !== "overripe" && saved.state !== "cooldown") continue;

            plot.state = saved.state;
            plot.ownerId = saved.ownerId != null ? Number(saved.ownerId) : null;
            plot.ownerName = saved.ownerName || null;
            plot.seedType = saved.seedType || null;
            plot.seedItemId = saved.seedItemId != null ? Number(saved.seedItemId) : null;
            plot.plantedPos = saved.plantedPos || null;
            plot.plantRadius = saved.plantRadius != null ? Number(saved.plantRadius) : null;
            plot.readyAt = saved.readyAt ? Number(saved.readyAt) : null;
            plot.ripeEndsAt = saved.ripeEndsAt ? Number(saved.ripeEndsAt) : null;
            plot.overripeEndsAt = saved.overripeEndsAt ? Number(saved.overripeEndsAt) : null;
            plot.cooldownAt = saved.cooldownAt ? Number(saved.cooldownAt) : null;

            const type = this.getSeedType(plot.seedType);
            if (type && (plot.state === "growing" || plot.state === "ready" || plot.state === "overripe")) {
                this.createPlotObject(plot, type.objectModel);
            }
            if (plot.state === "growing" && plot.readyAt) {
                const left = Math.max(0, plot.readyAt - now);
                plot.growthTimer = timer.add(() => this.setPlotReady(i), left);
            } else if (plot.state === "ready" && plot.ripeEndsAt) {
                const left = Math.max(0, plot.ripeEndsAt - now);
                plot.ripeTimer = timer.add(() => this.setPlotOverripe(i), left);
            } else if (plot.state === "overripe" && plot.overripeEndsAt) {
                const left = Math.max(0, plot.overripeEndsAt - now);
                plot.overripeTimer = timer.add(() => this.expireOverripePlot(i), left);
            } else if (plot.state === "cooldown" && plot.cooldownAt) {
                const left = Math.max(0, plot.cooldownAt - now);
                plot.cooldownTimer = timer.add(() => this.resetPlot(i), left);
            }
            this.reconcilePlotState(i, false);
        }
        this.pendingPlotState = null;
    },

    findNearestPlotIndexByPos(position, radius = 1.4) {
        if (!position) return -1;
        let nearest = -1;
        let best = radius;
        for (let i = 0; i < this.plots.length; i++) {
            const plot = this.plots[i];
            if (!plot || !plot.position) continue;
            const dx = plot.position.x - position.x;
            const dy = plot.position.y - position.y;
            const dz = plot.position.z - position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= best) {
                best = dist;
                nearest = i;
            }
        }
        return nearest;
    },

    findNearestHarvestablePlotIndex(position, radius = 4.0) {
        if (!position) return -1;
        let nearest = -1;
        let best = radius;
        for (let i = 0; i < this.plots.length; i++) {
            const plot = this.plots[i];
            if (!plot || !plot.position) continue;
            if (plot.state !== "ready" && plot.state !== "overripe") continue;
            const dx = plot.position.x - position.x;
            const dy = plot.position.y - position.y;
            const dz = plot.position.z - position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= best) {
                best = dist;
                nearest = i;
            }
        }
        return nearest;
    },

    addPlotAtPosition(position) {
        if (!position) return -1;
        const nearest = this.findNearestPlotIndexByPos(position, 1.2);
        return nearest;
    },

    resetPlotsData(positions) {
        if (!Array.isArray(positions) || !positions.length) return false;

        this.plots.forEach((plot, index) => {
            if (!plot) return;
            if (plot.growthTimer) timer.remove(plot.growthTimer);
            if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
            if (plot.ripeTimer) timer.remove(plot.ripeTimer);
            if (plot.overripeTimer) timer.remove(plot.overripeTimer);
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
                if (plot.ripeTimer) timer.remove(plot.ripeTimer);
                plot.ripeTimer = null;
                if (plot.overripeTimer) timer.remove(plot.overripeTimer);
                plot.overripeTimer = null;
                plot.ownerId = null;
                plot.ownerName = null;
                plot.readyAt = null;
                plot.ripeEndsAt = null;
                plot.overripeEndsAt = null;
                plot.cooldownAt = null;
                plot.seedType = null;
                plot.seedItemId = null;
                plot.plantedPos = null;
                plot.plantRadius = null;
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
        if (seedId == null) return null;
        const raw = String(seedId);
        let type = this.seedTypes.find(seed => seed.id === raw);
        if (type) return type;

        const numeric = parseInt(seedId);
        if (!isNaN(numeric)) {
            type = this.seedTypes.find(seed => Number(seed.seedItemId) === numeric);
            if (type) return type;
            if (numeric >= 0 && numeric < this.seedTypes.length) return this.seedTypes[numeric];
        }
        return null;
    },

    getTotalSeeds(data) {
        if (!data || !data.seeds) return 0;
        return Object.values(data.seeds).reduce((acc, value) => acc + (parseInt(value) || 0), 0);
    },

    playerHasAnySeeds(player) {
        return this.seedTypes.some((seed) => this.getInventoryCount(player, seed.seedItemId) > 0)
            || this.getTotalSeeds(this.ensureJobData(player)) > 0;
    },

    isPlayerInsidePlantZone(player) {
        if (!player || !this.plantZone) return false;
        const pos = player.position;
        const z = this.plantZone;
        if (Array.isArray(z.points) && z.points.length >= 3) {
            const minZ = Number.isFinite(parseFloat(z.minZ)) ? parseFloat(z.minZ) : -1000;
            const maxZ = Number.isFinite(parseFloat(z.maxZ)) ? parseFloat(z.maxZ) : 10000;
            if (pos.z < minZ || pos.z > maxZ) return false;
            let inside = false;
            for (let i = 0, j = z.points.length - 1; i < z.points.length; j = i++) {
                const xi = z.points[i].x, yi = z.points[i].y;
                const xj = z.points[j].x, yj = z.points[j].y;
                const intersect = ((yi > pos.y) !== (yj > pos.y))
                    && (pos.x < ((xj - xi) * (pos.y - yi)) / ((yj - yi) || 0.000001) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }
        return pos.x >= z.x && pos.x <= z.x + z.dx &&
            pos.y >= z.y && pos.y <= z.y + z.dy &&
            pos.z >= z.z && pos.z <= z.z + z.dz;
    },

    plantSeed(player, index, seedId) {
        if (!this.isFarmer(player)) return;
        const data = this.ensureJobData(player);
        const type = this.getSeedType(seedId) || this.seedTypes[0];
        const hasInvSeed = type.seedItemId && this.hasItem(player, type.seedItemId, 1);
        const hasLegacySeed = (data.seeds[type.id] || 0) > 0;
        if (!hasInvSeed && !hasLegacySeed) return notifs.warning(player, `У вас нет семян: ${type.name}`, "Ферма");

        index = parseInt(index);
        if (isNaN(index) || index < 0 || !this.plots[index]) {
            index = this.addPlotAtPosition(player.position);
            if (index === -1) {
                return notifs.warning(player, "Рядом нет грядки для посадки", "Ферма");
            }
        }
        const plot = this.plots[index];
        if (!plot) return notifs.error(player, "Не удалось создать грядку в текущей точке", "Ферма");
        const matured = this.reconcilePlotState(index, true);
        if (matured) this.broadcastPlotUpdate(index);
        if (plot.state !== "empty") {
            if (plot.state === "growing") return notifs.warning(player, "Эта грядка уже занята посевами", "Ферма");
            if (plot.state === "ready") return notifs.warning(player, "Сначала соберите урожай с этой грядки", "Ферма");
            if (plot.state === "cooldown") return notifs.warning(player, "Грядка восстанавливается", "Ферма");
            return notifs.warning(player, "Эта грядка недоступна", "Ферма");
        }

        const level = this.getPlayerLevel(player);
        const growthTime = this.getProcessTime(type.growthRange, level);

        plot.state = "growing";
        plot.ownerId = player.id;
        plot.ownerName = player.name;
        plot.seedType = type.id;
        plot.seedItemId = type.seedItemId;
        plot.plantedPos = {
            x: Number(player.position.x.toFixed(3)),
            y: Number(player.position.y.toFixed(3)),
            z: Number(player.position.z.toFixed(3)),
        };
        plot.plantRadius = HARVEST_INTERACT_RADIUS;
        plot.readyAt = Date.now() + growthTime;
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = null;
        if (plot.ripeTimer) timer.remove(plot.ripeTimer);
        if (plot.overripeTimer) timer.remove(plot.overripeTimer);
        plot.ripeTimer = null;
        plot.overripeTimer = null;
        plot.growthTimer = timer.add(() => this.setPlotReady(index), growthTime);
        this.createPlotObject(plot, type.objectModel);

        if (hasInvSeed) {
            const removed = this.consumeItems(player, type.seedItemId, 1);
            if (!removed) return notifs.error(player, "Не удалось списать семена из инвентаря", "Ферма");
        } else {
            data.seeds[type.id]--;
        }
        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
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
        plot.ripeEndsAt = Date.now() + READY_STAGE_MS;
        if (plot.ripeTimer) timer.remove(plot.ripeTimer);
        plot.ripeTimer = timer.add(() => this.setPlotOverripe(index), READY_STAGE_MS);
        const owner = this.getPlotOwner(plot.ownerId);
        if (owner) {
            notifs.success(owner, `Грядка №${index + 1} созрела (60 сек до перезревания)`, "Ферма");
            owner.call("farms.plot.ready", [index]);
        }
        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
    },

    setPlotOverripe(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.ripeTimer = null;
        if (plot.state !== "ready") return;
        plot.state = "overripe";
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = Date.now() + OVERRIPE_STAGE_MS;
        if (plot.overripeTimer) timer.remove(plot.overripeTimer);
        plot.overripeTimer = timer.add(() => this.expireOverripePlot(index), OVERRIPE_STAGE_MS);
        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
    },

    expireOverripePlot(index) {
        const plot = this.plots[index];
        if (!plot) return;
        if (plot.overripeTimer) {
            timer.remove(plot.overripeTimer);
            plot.overripeTimer = null;
        }
        if (plot.ripeTimer) {
            timer.remove(plot.ripeTimer);
            plot.ripeTimer = null;
        }
        if (plot.state !== "overripe") return;
        plot.state = "empty";
        plot.ownerId = null;
        plot.ownerName = null;
        plot.seedType = null;
        plot.seedItemId = null;
        plot.plantedPos = null;
        plot.plantRadius = null;
        plot.readyAt = null;
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = null;
        this.destroyPlotObject(plot);
        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
    },

    setPlotOverripe(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.ripeTimer = null;
        if (plot.state !== "ready") return;
        plot.state = "overripe";
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = Date.now() + OVERRIPE_STAGE_MS;
        if (plot.overripeTimer) timer.remove(plot.overripeTimer);
        plot.overripeTimer = timer.add(() => this.expireOverripePlot(index), OVERRIPE_STAGE_MS);
        this.broadcastPlotUpdate(index);
    },

    expireOverripePlot(index) {
        const plot = this.plots[index];
        if (!plot) return;
        if (plot.overripeTimer) {
            timer.remove(plot.overripeTimer);
            plot.overripeTimer = null;
        }
        if (plot.ripeTimer) {
            timer.remove(plot.ripeTimer);
            plot.ripeTimer = null;
        }
        if (plot.state !== "overripe") return;
        plot.state = "empty";
        plot.ownerId = null;
        plot.ownerName = null;
        plot.seedType = null;
        plot.readyAt = null;
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = null;
        this.destroyPlotObject(plot);
        this.broadcastPlotUpdate(index);
    },

    harvestPlot(player, index) {
        if (!this.isFarmer(player)) return;
        index = parseInt(index);
        let plot = isNaN(index) ? null : this.plots[index];
        if (!plot || (plot.state !== "ready" && plot.state !== "overripe")) {
            const nearestReady = this.findNearestHarvestablePlotIndex(player.position, 4.0);
            if (nearestReady !== -1) {
                index = nearestReady;
                plot = this.plots[index];
            }
        }
        if (!plot) return notifs.error(player, "Грядка не найдена", "Ферма");
        const matured = this.reconcilePlotState(index, true);
        if (matured) this.broadcastPlotUpdate(index);
        if (plot.state !== "ready" && plot.state !== "overripe") {
            if (plot.state === "growing") return notifs.warning(player, "Урожай еще созревает", "Ферма");
            if (plot.state === "cooldown") return notifs.warning(player, "Грядка восстанавливается", "Ферма");
            return notifs.warning(player, "Эта грядка пока недоступна", "Ферма");
        }

        const ownerId = plot.ownerId;
        const ownerName = plot.ownerName;
        const plantRadius = Number(plot.plantRadius) > 0 ? Number(plot.plantRadius) : HARVEST_INTERACT_RADIUS;
        const sourcePos = plot.plantedPos || plot.position;
        if (sourcePos) {
            const dx = player.position.x - sourcePos.x;
            const dy = player.position.y - sourcePos.y;
            const dz = player.position.z - sourcePos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > plantRadius) return notifs.warning(player, `Подойдите ближе к грядке (радиус ${plantRadius.toFixed(1)}м)`, "Ферма");
        }
        const type = this.getSeedType(plot.seedType) || this.seedTypes[0];

        plot.state = "cooldown";
        plot.ownerId = null;
        plot.ownerName = null;
        plot.seedType = null;
        plot.readyAt = null;
        plot.ripeEndsAt = null;
        plot.overripeEndsAt = null;
        if (plot.ripeTimer) timer.remove(plot.ripeTimer);
        if (plot.overripeTimer) timer.remove(plot.overripeTimer);
        plot.ripeTimer = null;
        plot.overripeTimer = null;
        const level = this.getPlayerLevel(player);
        const cooldownTime = this.getProcessTime(type.cooldownRange, level);
        plot.cooldownAt = Date.now() + cooldownTime;
        if (plot.cooldownTimer) timer.remove(plot.cooldownTimer);
        plot.cooldownTimer = timer.add(() => this.resetPlot(index), cooldownTime);
        this.destroyPlotObject(plot);

        this.registerHarvest(player, type.harvestYield);
        const added = this.addStackableItem(player, type.harvestItemId, type.harvestYield);
        if (!added.success) {
            notifs.warning(player, `Урожай собран, но предмет не добавлен: ${added.error || 'ошибка инвентаря'}`, "Ферма");
        } else {
            notifs.success(player, `Вы собрали ${type.name}: +${type.harvestYield} шт. в инвентарь`, "Ферма");
        }

        if (ownerId != null && ownerId !== player.id) {
            const owner = this.getPlotOwner(ownerId);
            notifs.warning(player, `Это была грядка игрока ${ownerName || "неизвестно"}`, "Ферма");
            if (owner) notifs.warning(owner, `${player.name} сорвал ваш урожай`, "Ферма");
        }

        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
    },

    resetPlot(index) {
        const plot = this.plots[index];
        if (!plot) return;
        plot.cooldownTimer = null;
        plot.cooldownAt = null;
        if (plot.state !== "cooldown") return;
        plot.state = "empty";
        this.broadcastPlotUpdate(index);
        this.schedulePlotStateSave();
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
            const added = this.addStackableItem(player, type.seedItemId, amount);
            if (!added.success) return notifs.error(player, added.error || "Не удалось добавить семена в инвентарь", "Ферма");
            this.sendMenuUpdate(player);
            this.refreshPlayerPlots(player);
            notifs.success(player, `Куплено ${amount} семян (${type.name})`, "Ферма");
        }, `Покупка семян (${type.name})`);
    },

    sellHarvest(player) {
        if (!this.isFarmer(player)) return;
        const harvestItemIds = this.seedTypes.map(seed => seed.harvestItemId).filter(Boolean);
        const amount = harvestItemIds.reduce((sum, itemId) => sum + this.getInventoryCount(player, itemId), 0);
        if (!amount || amount <= 0) return notifs.warning(player, "У вас нет урожая для продажи", "Ферма");
        const payout = amount * this.exchangeRate;
        money.addCash(player, payout, (res) => {
            if (!res) return notifs.error(player, "Не удалось выдать деньги", "Ферма");
            harvestItemIds.forEach(itemId => this.consumeItems(player, itemId, this.getInventoryCount(player, itemId)));
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
        if (plot && plot.index != null) this.reconcilePlotState(plot.index, false);
        const result = {
            state: "busy",
            action: null,
            owner: plot.ownerName,
            ownerMine: plot.ownerId === player.id,
            seedType: plot.seedType,
            seedName: null,
            readyAt: null,
            ripeEndsAt: null,
            overripeEndsAt: null,
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
                result.ripeEndsAt = plot.ripeEndsAt;
                break;
            case "overripe":
                result.state = plot.ownerId === player.id ? "overripe" : "overripe_foreign";
                result.action = "harvest";
                result.overripeEndsAt = plot.overripeEndsAt;
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

    getInventoryCount(player, itemId) {
        if (!player || !itemId) return 0;
        const items = inventory.getArrayByItemId(player, itemId);
        if (!items || !items.length) return 0;
        return items.reduce((sum, item) => {
            const param = inventory.getParam(item, 'count');
            if (param) return sum + (parseInt(param.value) || 0);
            return sum + 1;
        }, 0);
    },

    hasItem(player, itemId, amount = 1) {
        return this.getInventoryCount(player, itemId) >= amount;
    },

    addStackableItem(player, itemId, amount) {
        if (!itemId || amount <= 0) return { success: false, error: "Некорректный предмет" };
        const info = inventory.getInventoryItem(itemId);
        if (!info) return { success: false, error: `Предмет #${itemId} не найден в inventoryitems` };
        const nextWeight = inventory.getCommonWeight(player) + info.weight * amount;
        if (nextWeight > inventory.maxPlayerWeight) return { success: false, error: "Недостаточно места/веса в инвентаре" };
        const existing = inventory.getItemByItemId(player, itemId);
        if (existing) {
            const param = inventory.getParam(existing, 'count');
            if (param) {
                const current = parseInt(param.value) || 0;
                inventory.updateParam(player, existing, 'count', current + amount);
                return { success: true };
            }
        }
        let error = null;
        inventory.addItem(player, itemId, { count: amount }, (e) => { error = e; });
        if (error) return { success: false, error };
        return { success: true };
    },

    consumeItems(player, itemId, amount) {
        if (!this.hasItem(player, itemId, amount)) return false;
        let remaining = amount;
        const items = inventory.getArrayByItemId(player, itemId) || [];
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
        const harvestItemIds = [];
        this.seedTypes.forEach(seed => {
            const invSeedCount = this.getInventoryCount(player, seed.seedItemId);
            const legacyCount = data.seeds[seed.id] || 0;
            seedsByType[seed.id] = invSeedCount + legacyCount;
            if (seed.harvestItemId) harvestItemIds.push(seed.harvestItemId);
        });
        const totalSeeds = Object.values(seedsByType).reduce((sum, value) => sum + (parseInt(value) || 0), 0);
        const harvestCount = harvestItemIds.reduce((sum, itemId) => sum + this.getInventoryCount(player, itemId), 0);

        return {
            employed: this.isFarmer(player),
            level,
            maxLevel: this.maxLevel,
            progress: Math.round(progress * 100),
            seeds: totalSeeds,
            seedsByType,
            seedTypes: this.seedTypes.map(seed => ({ id: seed.id, name: seed.name, buyPrice: seed.buyPrice, harvestYield: seed.harvestYield })),
            harvest: harvestCount,
            totalHarvest,
            toNext,
            exchangeRate: this.exchangeRate,
            estimatedReward: harvestCount * this.exchangeRate,
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
