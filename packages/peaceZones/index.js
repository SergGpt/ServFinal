"use strict";

function parseZonePoints(rawPoints) {
    if (!rawPoints) return null;
    let points = rawPoints;
    if (typeof points === 'string') {
        try {
            points = JSON.parse(points);
        } catch (e) {
            return null;
        }
    }
    if (!Array.isArray(points)) return null;
    const normalized = points
        .map((point) => ({
            x: Number(point && point.x),
            y: Number(point && point.y),
            z: Number(point && point.z),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));

    return normalized.length >= 3 ? normalized : null;
}

module.exports = {
    zones: [],
    colshapes: [],
    markers: [],
    zoneColumns: new Set(),
    async init() {
        console.log("[PEACEZONE] load peace zones from DB");
        await this.ensurePeaceZoneColumns();

        this.zones = await db.Models.PeaceZone.findAll({
            attributes: this.getSelectableAttributes(),
        });
        console.log("[PEACEZONE] " + this.zones.length + " peace zones loaded");

        this.zones.forEach(zone => {
            this.initZone(zone);
        });
    },
    async ensurePeaceZoneColumns() {
        try {
            const [rows] = await db.sequelize.query("SHOW COLUMNS FROM PeaceZones");
            const cols = new Set((rows || []).map((row) => String(row.Field || "")));
            const addColumnIfMissing = async (name, sqlType) => {
                if (cols.has(name)) return;
                await db.sequelize.query(`ALTER TABLE PeaceZones ADD COLUMN ${name} ${sqlType} NULL`);
                cols.add(name);
            };
            await addColumnIfMissing("points", "LONGTEXT");
            await addColumnIfMissing("minZ", "FLOAT");
            await addColumnIfMissing("maxZ", "FLOAT");
            this.zoneColumns = cols;
        } catch (e) {
            console.log("[PEACEZONE] ensure PeaceZones columns failed", e.message);
            this.zoneColumns = new Set(["id", "x", "y", "z", "dx", "dy", "dz"]);
        }
    },
    hasColumn(name) {
        return this.zoneColumns && this.zoneColumns.has(name);
    },
    getSelectableAttributes() {
        const attrs = ["id", "x", "y", "z", "dx", "dy", "dz"];
        if (this.hasColumn("points")) attrs.push("points");
        if (this.hasColumn("minZ")) attrs.push("minZ");
        if (this.hasColumn("maxZ")) attrs.push("maxZ");
        return attrs;
    },
    initZone(zone) {
        const points = this.hasColumn("points") ? parseZonePoints(zone.points) : null;
        let colshape = null;

        if (points) {
            const minZ = Number.isFinite(Number(zone.minZ)) ? Number(zone.minZ) : (Math.min(...points.map((p) => p.z)) - 1);
            const maxZ = Number.isFinite(Number(zone.maxZ)) ? Number(zone.maxZ) : (Math.max(...points.map((p) => p.z)) + 2.5);
            const centerX = points.reduce((acc, point) => acc + point.x, 0) / points.length;
            const centerY = points.reduce((acc, point) => acc + point.y, 0) / points.length;
            const polygonPoints = points.map((point) => [point.x, point.y]);
            colshape = mp.colshapes.newPolygon(centerX, centerY, polygonPoints, minZ, maxZ);
        } else {
            colshape = mp.colshapes.newCuboid(zone.x + zone.dx / 2, zone.y + zone.dy / 2, zone.z + zone.dz / 2, zone.dx, zone.dz, zone.dy);
        }

        colshape.zoneId = zone.id;
        this.colshapes.push(colshape);
    },
    showDots() {
        this.zones.forEach(zone => {
            const points = this.hasColumn("points") ? parseZonePoints(zone.points) : null;
            if (points) {
                points.forEach((point) => {
                    this.markers.push(mp.markers.new(0, new mp.Vector3(point.x, point.y, point.z), 0.5,
                        {
                            direction: new mp.Vector3(0, 0, 0),
                            rotation: new mp.Vector3(0, 0, 0),
                            color: [0, 150, 255, 255],
                            visible: true,
                            dimension: 0
                        }));
                });
                return;
            }
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x + zone.dx / 2, zone.y + zone.dy / 2, zone.z + zone.dz / 2), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 0, 255, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x, zone.y, zone.z), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [255, 0, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x + zone.dx, zone.y, zone.z), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x + zone.dx, zone.y + zone.dy, zone.z), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x, zone.y + zone.dy, zone.z), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x, zone.y, zone.z + zone.dz), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x + zone.dx, zone.y, zone.z + zone.dz), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x, zone.y + zone.dy, zone.z + zone.dz), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
            this.markers.push(mp.markers.new(0, new mp.Vector3(zone.x + zone.dx, zone.y + zone.dy, zone.z + zone.dz), 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: 0
                }));
        });
    },
    hideDots() {
        this.markers.forEach(marker => {
            marker.destroy();
        });
        this.markers = [];
    },
    async add(x, y, z, dx, dy, dz) {
        const payload = {
            x,
            y,
            z,
            dx,
            dy,
            dz,
        };
        if (this.hasColumn("points")) payload.points = null;
        if (this.hasColumn("minZ")) payload.minZ = null;
        if (this.hasColumn("maxZ")) payload.maxZ = null;

        let zone = await db.Models.PeaceZone.create(payload);
        this.zones.push(zone);
        this.initZone(zone);
        return zone;
    },
    async createPolygonZone(zoneData) {
        const points = parseZonePoints(zoneData && zoneData.points);
        if (!points) return null;

        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const zs = points.map((point) => point.z);

        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const z = Math.min(...zs);
        const dx = Math.max(1, Math.max(...xs) - x);
        const dy = Math.max(1, Math.max(...ys) - y);
        const dz = Math.max(1, Math.max(...zs) - z);

        // fallback для серверов без новых колонок: сохраняем хотя бы bounding-box
        if (!this.hasColumn("points")) {
            return this.add(x, y, z, dx, dy, dz);
        }

        const minZ = Number.isFinite(Number(zoneData.minZ)) ? Number(zoneData.minZ) : (Math.min(...zs) - 1);
        const maxZ = Number.isFinite(Number(zoneData.maxZ)) ? Number(zoneData.maxZ) : (Math.max(...zs) + 2.5);

        const payload = {
            x,
            y,
            z,
            dx,
            dy,
            dz,
            points: JSON.stringify(points),
        };
        if (this.hasColumn("minZ")) payload.minZ = minZ;
        if (this.hasColumn("maxZ")) payload.maxZ = maxZ;

        let zone = await db.Models.PeaceZone.create(payload);
        this.zones.push(zone);
        this.initZone(zone);
        return zone;
    },
    async remove(player, id) {
        this.hideDots();
        let colshapeIndex = this.colshapes.findIndex(x => x.zoneId === id);
        if (colshapeIndex !== -1) {
            this.colshapes[colshapeIndex].destroy();
            this.colshapes.splice(colshapeIndex, 1);
        }

        let zoneIndex = this.zones.findIndex(x => x.id === id);
        if (zoneIndex !== -1) {
            await this.zones[zoneIndex].destroy();
            this.zones.splice(zoneIndex, 1);
        }

        player.call("peaceZones.removed", [id]);
    },
};
