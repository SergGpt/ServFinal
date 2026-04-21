"use strict";

let factions;
let notifs;
let inventory;

module.exports = {
    dumps: [],
    playerCooldowns: new Map(),

    async init() {
        factions = call('factions');
        notifs = call('notifications');
        inventory = call('inventory');

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
            notifs.info(player, `Свалка металлолома. Используйте /scrapcollect`, `Rast`);
        };
        colshape.onExit = (player) => {
            if (player.rastDumpPointId === dbPoint.id) delete player.rastDumpPointId;
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
        if (this.hasAnyBox(player)) return { ok: false, message: 'У вас уже есть ящик', header };

        const key = `${player.character.id}:${dump.dbPoint.id}`;
        const now = Date.now();
        const next = this.playerCooldowns.get(key) || 0;
        if (now < next) {
            const wait = Math.ceil((next - now) / 1000);
            return { ok: false, message: `Подождите ${wait} сек.`, header };
        }

        return { ok: true, key, header };
    },

    collect(player) {
        const dump = this.getPlayerDump(player);
        const state = this.canCollect(player, dump);
        if (!state.ok) return notifs.error(player, state.message, state.header);

        player.addAttachment('materialsBox');
        const nextTs = Date.now() + dump.dbPoint.cooldownSec * 1000;
        this.playerCooldowns.set(state.key, nextTs);
        notifs.success(player, `Вы собрали металлолом`, state.header);
    },

    async createDump(player, radius = 2.0, cooldownSec = 120) {
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
