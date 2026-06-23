"use strict";

module.exports = {
    zones: [],

    async init() {
        if (!db.Models.SecurityZone) {
            console.warn("[SECURITY] SecurityZone model is not loaded. Check packages/security/db/SecurityZone.js");
            return;
        }

        console.log("[SECURITY] loading zones from DB...");
        this.zones = await db.Models.SecurityZone.findAll();
        console.log(`[SECURITY] ${this.zones.length} zones loaded.`);
    },

    async createZone(data = {}) {
        if (!db.Models.SecurityZone) {
            throw new Error("SecurityZone model is not available");
        }

        const zonePayload = {
            id: data.id || `zone_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            name: data.name || null,
            dimension: Number.isFinite(Number(data.dimension)) ? Number(data.dimension) : 0,
            data: typeof data.data === "string" ? data.data : JSON.stringify(data.data ?? {}),
            updatedAt: data.updatedAt ? Number(data.updatedAt) : Date.now(),
        };

        const zone = await db.Models.SecurityZone.create(zonePayload);
        this.zones.push(zone);

        console.log(`[SECURITY] zone saved to DB (id=${zone.id}, name=${zone.name || "-"}, dimension=${zone.dimension}).`);
        return zone;
    },
};
