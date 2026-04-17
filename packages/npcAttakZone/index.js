"use strict";

let notifs = call("notifications");

function normalizePoint(point) {
    return {
        x: Number(Number(point.x || 0).toFixed(3)),
        y: Number(Number(point.y || 0).toFixed(3)),
        z: Number(Number(point.z || 0).toFixed(3)),
    };
}

module.exports = {
    zone: null,
    playerStates: new Map(),

    async init() {
        await this.loadZoneFromDb();
        this.syncForAll();
        this.startDebugTracker();
        console.log(`[NpcAttakZone] inited. zone=${this.zone ? this.zone.id : 'none'}`);
    },

    isPointInsidePolygon2d(x, y, points) {
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
    },

    isPlayerInsideZone(player) {
        if (!this.zone || !Array.isArray(this.zone.points) || this.zone.points.length < 3) return false;
        if (!player || !mp.players.exists(player)) return false;
        if (Number(player.dimension) !== Number(this.zone.dimension)) return false;

        const pos = player.position;
        const minZ = Number(this.zone.minZ);
        const maxZ = Number(this.zone.maxZ);
        if (Number.isFinite(minZ) && pos.z < minZ) return false;
        if (Number.isFinite(maxZ) && pos.z > maxZ) return false;

        return this.isPointInsidePolygon2d(pos.x, pos.y, this.zone.points);
    },

    startDebugTracker() {
        setInterval(() => {
            mp.players.forEach((player) => {
                if (!player || !mp.players.exists(player)) return;

                const prev = !!this.playerStates.get(player.id);
                const inside = this.isPlayerInsideZone(player);

                if (inside !== prev) {
                    this.playerStates.set(player.id, inside);
                    player.setVariable('npcattakzone:inside', inside);
                    player.call('npcattakzone.debug.state', [inside]);

                    if (inside) {
                        console.log(`[NpcAttakZone] player ${player.name} (${player.id}) entered zone`);
                    } else {
                        console.log(`[NpcAttakZone] player ${player.name} (${player.id}) left zone`);
                    }
                }
            });
        }, 1000);
    },

    getDefaultZone() {
        return {
            id: null,
            name: 'NpcAttakZone',
            dimension: 0,
            points: [],
            minZ: 0,
            maxZ: 3,
            enabled: true,
        };
    },

    normalizeZonePayload(raw) {
        const zone = this.getDefaultZone();
        const points = Array.isArray(raw && raw.points) ? raw.points : [];
        zone.points = points.map(normalizePoint);
        if (zone.points.length >= 3) {
            const zs = zone.points.map((point) => Number(point.z) || 0);
            zone.minZ = Number.isFinite(Number(raw.minZ)) ? Number(raw.minZ) : Number((Math.min.apply(null, zs) - 1).toFixed(3));
            zone.maxZ = Number.isFinite(Number(raw.maxZ)) ? Number(raw.maxZ) : Number((Math.max.apply(null, zs) + 2.5).toFixed(3));
        }
        zone.dimension = Number.isInteger(Number(raw && raw.dimension)) ? Number(raw.dimension) : 0;
        zone.name = raw && raw.name ? String(raw.name).slice(0, 64) : 'NpcAttakZone';
        zone.enabled = raw && raw.enabled !== undefined ? !!raw.enabled : true;
        if (raw && raw.id != null) zone.id = Number(raw.id) || null;
        return zone;
    },

    getZoneData() {
        return this.zone ? { ...this.zone, points: [...this.zone.points] } : this.getDefaultZone();
    },

    async loadZoneFromDb() {
        const Model = db && db.Models ? db.Models.NpcAttakZone : null;
        if (!Model) {
            console.log('[NpcAttakZone] model NpcAttakZone not found');
            return;
        }

        const row = await Model.findOne({ order: [['id', 'ASC']] }).catch(() => null);
        if (!row) {
            this.zone = this.getDefaultZone();
            return;
        }

        const data = row.get ? row.get({ plain: true }) : row;
        let points = [];
        try {
            points = JSON.parse(data.points || '[]');
        } catch (e) {}

        this.zone = this.normalizeZonePayload({
            id: data.id,
            name: data.name,
            dimension: data.dimension,
            points,
            minZ: data.minZ,
            maxZ: data.maxZ,
            enabled: Number(data.enabled) !== 0,
        });
    },

    async saveZoneToDb() {
        const Model = db && db.Models ? db.Models.NpcAttakZone : null;
        if (!Model || !this.zone) return false;

        const payload = {
            name: this.zone.name,
            dimension: this.zone.dimension,
            points: JSON.stringify(this.zone.points || []),
            minZ: this.zone.minZ,
            maxZ: this.zone.maxZ,
            enabled: this.zone.enabled ? 1 : 0,
        };

        if (this.zone.id) {
            await Model.update(payload, { where: { id: this.zone.id } });
        } else {
            const created = await Model.create(payload);
            const entity = created.get ? created.get({ plain: true }) : created;
            this.zone.id = Number(entity.id) || null;
        }

        return true;
    },

    async setZoneFromMenu(player, rawZone) {
        const zone = this.normalizeZonePayload(rawZone);
        if (!Array.isArray(zone.points) || zone.points.length < 3) {
            notifs.error(player, "Нужно минимум 3 точки для полигона", "NpcAttakZone");
            return false;
        }

        this.zone = zone;
        const saved = await this.saveZoneToDb();
        if (!saved) {
            notifs.error(player, "Не удалось сохранить зону в БД", "NpcAttakZone");
            return false;
        }

        this.syncForAll();
        notifs.success(player, `Зона сохранена: ${zone.points.length} точек`, "NpcAttakZone");
        return true;
    },

    syncForAll() {
        const zone = this.getZoneData();
        mp.players.forEach((player) => {
            if (!player || !mp.players.exists(player)) return;
            player.call('npcattakzone.zone.sync', [zone]);
        });
    },
};
