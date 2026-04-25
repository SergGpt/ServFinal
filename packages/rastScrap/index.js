"use strict";

let factions;
let notifs;
let inventory;
let animations;
let utils;

module.exports = {
    dumps: [],
    dumpCooldowns: new Map(),

    async init() {
        factions = call('factions');
        notifs = call('notifications');
        inventory = call('inventory');
        animations = call('animations');
        utils = call('utils');

        await this.loadFromDB();
        inited(__dirname);
    },

    async loadFromDB() {
        const rows = await db.Models.RastDumpPoint.findAll({ order: ['id'] });
        rows.forEach((row) => this.createDumpRuntime(row));
        console.log(`[RAST_SCRAP] Загружено ${rows.length} точек свалок`);
    },

    createDumpRuntime(dbPoint) {
        const pos = new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z - 1);
        const marker = mp.markers.new(1, pos, 0.8, {
            color: [255, 187, 0, 110],
            dimension: dbPoint.d
        });

        const colshape = mp.colshapes.newSphere(dbPoint.x, dbPoint.y, dbPoint.z, dbPoint.radius, dbPoint.d);
        colshape.onEnter = (player) => {
            if (!player || !player.character) return;
            player.rastDumpPointId = dbPoint.id;
            player.setVariable('insideRastDump', true);
            notifs.info(player, `Свалка металлолома. Используйте /scrapcollect`, `Rast`);
        };
        colshape.onExit = (player) => {
            if (player.rastDumpPointId === dbPoint.id) delete player.rastDumpPointId;
            player.setVariable('insideRastDump', null);
        };

        const labelPos = new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z + 0.5);
        const label = mp.labels.new(`~y~Свалка металлолома\n~w~/scrapcollect`, labelPos, {
            los: false,
            font: 0,
            drawDistance: 10,
            dimension: dbPoint.d
        });

        this.dumps.push({ dbPoint, marker, colshape, label });
    },

    destroyDumpRuntime(id) {
        const idx = this.dumps.findIndex((x) => x.dbPoint.id === id);
        if (idx === -1) return;
        const dump = this.dumps[idx];
        dump.marker.destroy();
        dump.colshape.destroy();
        dump.label.destroy();
        this.dumps.splice(idx, 1);
    },

    isRastMember(player) {
        return factions.isRastFaction(player.character.factionId);
    },

    hasAnyBox(player) {
        return player.hasAttachment('ammoBox') || player.hasAttachment('medicinesBox') || player.hasAttachment('materialsBox');
    },

    getDumpById(id) {
        return this.dumps.find((x) => x.dbPoint.id === id);
    },

    getPlayerDump(player) {
        if (!player.rastDumpPointId) return null;
        return this.getDumpById(player.rastDumpPointId);
    },

    canCollect(player, dump) {
        const header = 'Сбор металлолома';
        if (!dump) return { ok: false, message: 'Вы не на свалке', header };
        if (!this.isRastMember(player)) return { ok: false, message: 'Только для фракции Rast', header };
        if (inventory.getHandsItem(player)) return { ok: false, message: 'Освободите руки', header };
        if (player.rastScrapCollecting) return { ok: false, message: 'Вы уже собираете металлолом', header };

        const now = Date.now();
        const next = this.dumpCooldowns.get(dump.dbPoint.id) || 0;
        if (now < next) {
            const wait = Math.ceil((next - now) / 1000);
            return { ok: false, message: `Свалка остывает. Подождите ${wait} сек.`, header };
        }

        return { ok: true, header };
    },

    async finishCollect(player, dump) {
        if (!player || !player.character) return;
        if (!this.isRastMember(player)) return;
        if (player.dimension != dump.dbPoint.d) return;

        const dist = utils.vdist(player.position, new mp.Vector3(dump.dbPoint.x, dump.dbPoint.y, dump.dbPoint.z));
        if (dist > dump.dbPoint.radius + 2.5) {
            return notifs.error(player, 'Вы отошли слишком далеко от точки свалки', 'Сбор металлолома');
        }

        const nextTs = Date.now() + dump.dbPoint.cooldownSec * 1000;
        this.dumpCooldowns.set(dump.dbPoint.id, nextTs);

        inventory.addItem(player, 501, { count: 1 }, (err) => {
            if (err) return notifs.error(player, err, 'Сбор металлолома');
            notifs.success(player, `Вы получили Scrap Metal`, 'Сбор металлолома');
        });
    },

    collect(player) {
        const dump = this.getPlayerDump(player);
        const state = this.canCollect(player, dump);
        if (!state.ok) return notifs.error(player, state.message, state.header);

        player.rastScrapCollecting = true;
        player.addAttachment('rastGrinder');
        animations.playAnimation(player, 'amb@world_human_welding@male@base', 'base', 8, 49);
        player.call('rastScrap.collect.fx.start', [5000]);
        notifs.info(player, `Сбор металлолома...`, state.header);

        setTimeout(async () => {
            if (!player || !mp.players.exists(player)) return;

            player.addAttachment('rastGrinder', true);
            animations.stopAnimation(player);
            player.call('rastScrap.collect.fx.stop');
            delete player.rastScrapCollecting;

            await this.finishCollect(player, dump);
        }, 5000);
    },

    async createDump(player, radius = 2.0, cooldownSec = 30) {
        const dbPoint = await db.Models.RastDumpPoint.create({
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            d: player.dimension,
            radius: Math.clamp(radius, 1, 6),
            cooldownSec: Math.clamp(cooldownSec, 10, 900)
        });

        this.createDumpRuntime(dbPoint);
        return dbPoint;
    },

    async updateDumpPos(id, player) {
        const dump = this.getDumpById(id);
        if (!dump) return null;

        dump.dbPoint.x = player.position.x;
        dump.dbPoint.y = player.position.y;
        dump.dbPoint.z = player.position.z;
        dump.dbPoint.d = player.dimension;
        await dump.dbPoint.save();

        this.destroyDumpRuntime(id);
        this.createDumpRuntime(dump.dbPoint);
        return dump.dbPoint;
    },

    async deleteDump(id) {
        const dump = this.getDumpById(id);
        if (!dump) return false;

        await dump.dbPoint.destroy();
        this.destroyDumpRuntime(id);
        return true;
    }
};
