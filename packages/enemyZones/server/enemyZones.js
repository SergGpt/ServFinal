'use strict';

const {
    dist3,
    normalizeZonePoints,
    randomPointInPolygon,
    isPointInPolygon2d,
} = require('../../banditsS/zombie.utils');

const CONFIG = {
    models: ['s_m_y_army_01', 'cs_ramp_marine'],
    weapons: ['WEAPON_ASSAULTRIFLE', 'WEAPON_CARBINERIFLE'],
    stopDistance: 5.0,
    moveSpeed: 1.35,
    moveSyncMs: 300,
    damageTickMs: 400,
    damageMin: 7,
    damageMax: 12,
    emptyDestroyMs: 30 * 1000,
};

class EnemyZonesService {
    constructor() {
        this.zones = new Map();
        this.npcs = new Map();
        this.editor = new Map();
        this.spawnLocks = new Set();
        this.nextLocalZoneId = 1;
    }

    get db() {
        try { return global.db || null; } catch { return null; }
    }

    async init() {
        await this.ensureTable();
        await this.loadZones();
        this.registerLoops();
        console.log(`[ENEMY] Loaded enemy zones: ${this.zones.size}`);
    }

    async ensureTable() {
        const db = this.db;
        if (!db || !db.sequelize) return;
        await db.sequelize.query(`
            CREATE TABLE IF NOT EXISTS enemy_npc_zones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(64) NOT NULL,
                dimension INT NOT NULL DEFAULT 0,
                zombieCount INT NOT NULL DEFAULT 3,
                respawnSec INT NOT NULL DEFAULT 60,
                points LONGTEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
    }

    async loadZones() {
        const db = this.db;
        if (!db || !db.sequelize) return;
        const [rows] = await db.sequelize.query('SELECT * FROM enemy_npc_zones ORDER BY id ASC');
        rows.forEach((row) => {
            const points = this.parsePoints(row.points);
            if (points.length < 3) return;
            const zone = this.buildZoneRuntime({
                id: row.id,
                name: row.name,
                dimension: Number(row.dimension) || 0,
                zombieCount: Number(row.zombieCount) || 3,
                respawnSec: Number(row.respawnSec) || 60,
                points,
            });
            this.zones.set(zone.id, zone);
            this.nextLocalZoneId = Math.max(this.nextLocalZoneId, zone.id + 1);
        });
    }

    parsePoints(raw) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return normalizeZonePoints(parsed);
        } catch {
            return [];
        }
    }

    buildZoneRuntime(data) {
        const points = normalizeZonePoints(data.points);
        const center = points.reduce((acc, p) => {
            acc.x += p.x;
            acc.y += p.y;
            acc.z += p.z;
            return acc;
        }, { x: 0, y: 0, z: 0 });

        const c = {
            x: center.x / points.length,
            y: center.y / points.length,
            z: center.z / points.length,
        };

        const radius = Math.max(5, ...points.map((p) => Math.sqrt(((p.x - c.x) ** 2) + ((p.y - c.y) ** 2))));

        return {
            id: Number(data.id),
            name: String(data.name || `Enemy Zone #${data.id}`),
            dimension: Number(data.dimension) || 0,
            zombieCount: Math.max(1, Math.min(20, Number(data.zombieCount) || 3)),
            respawnSec: Math.max(10, Math.min(300, Number(data.respawnSec) || 60)),
            points,
            center: c,
            radius,
            npcIds: [],
            emptySinceAt: 0,
        };
    }

    isPlayerAdmin(player) {
        return !!(player && player.character && Number(player.character.admin) > 0);
    }

    isPlayerInZone(player, zone) {
        if (!player || !zone) return false;
        if (Number(player.dimension) !== Number(zone.dimension)) return false;
        return isPointInPolygon2d(player.position.x, player.position.y, zone.points);
    }

    zonePlayers(zone) {
        const list = [];
        mp.players.forEach((player) => {
            if (this.isPlayerInZone(player, zone)) list.push(player);
        });
        return list;
    }

    chooseNearestPlayerForPos(zone, pos) {
        let best = null;
        let bestDist = Infinity;
        this.zonePlayers(zone).forEach((player) => {
            const d = dist3(player.position, pos);
            if (d < bestDist) {
                bestDist = d;
                best = player;
            }
        });
        return best;
    }

    nextNpcId() {
        let id = (Math.random() * 1e9) | 0;
        while (this.npcs.has(id)) id = (Math.random() * 1e9) | 0;
        return id;
    }

    spawnNpc(zone) {
        const point = randomPointInPolygon(zone.points, {
            x: zone.center.x,
            y: zone.center.y,
            z: zone.center.z,
            radius: zone.radius,
        });

        const npcId = this.nextNpcId();
        const modelName = CONFIG.models[(Math.random() * CONFIG.models.length) | 0];
        const weaponName = CONFIG.weapons[(Math.random() * CONFIG.weapons.length) | 0];

        const ped = mp.peds.new(mp.joaat(modelName), new mp.Vector3(point.x, point.y, point.z), {
            dynamic: true,
            invincible: false,
        });

        ped.dimension = zone.dimension;
        ped.setVariable('enemyNpcId', npcId);
        ped.setVariable('enemyZoneId', zone.id);
        ped.setVariable('controllerRid', null);
        ped.setVariable('ctrlVer', 0);
        ped.setVariable('command', 'idle');
        ped.setVariable('commandExtra', {});
        ped.setVariable('enemyWeapon', weaponName);

        const st = {
            id: npcId,
            zoneId: zone.id,
            ped,
            dead: false,
            targetRid: null,
            lastMoveAt: 0,
            lastDamageAt: 0,
            lastFireFxAt: 0,
            ctrlVer: 0,
            controllerRid: null,
            respawnAt: 0,
            weaponName,
        };

        this.npcs.set(npcId, st);
        zone.npcIds.push(npcId);
        this.assignController(st, 'spawn');
    }

    removeNpc(npcId, reason = 'unknown') {
        const st = this.npcs.get(npcId);
        if (!st) return;
        const zone = this.zones.get(st.zoneId);

        try {
            if (st.ped && mp.peds.exists(st.ped)) st.ped.destroy();
        } catch {}

        this.npcs.delete(npcId);
        if (zone) zone.npcIds = zone.npcIds.filter((x) => x !== npcId);

        mp.players.forEach((p) => {
            try { p.call('z:forceRemove', [npcId]); } catch {}
        });

        if (reason === 'dead' && zone) {
            setTimeout(() => {
                if (!this.zones.has(zone.id)) return;
                this.spawnNpc(zone);
            }, Math.max(1, zone.respawnSec) * 1000);
        }
    }

    ensureZonePopulation(zone) {
        const players = this.zonePlayers(zone);
        if (!players.length) return;

        const aliveCount = zone.npcIds.filter((id) => this.npcs.has(id)).length;
        const needed = Math.max(0, zone.zombieCount - aliveCount);
        if (!needed) return;

        for (let i = 0; i < needed; i++) this.spawnNpc(zone);
    }

    assignController(st, reason = 'unknown') {
        if (!st || !st.ped || !mp.peds.exists(st.ped) || st.dead) return;
        const zone = this.zones.get(st.zoneId);
        if (!zone) return;

        const ctrl = this.chooseNearestPlayerForPos(zone, st.ped.position);
        if (!ctrl) {
            st.controllerRid = null;
            return;
        }

        st.ctrlVer += 1;
        st.controllerRid = ctrl.id;
        st.ped.setVariable('controllerRid', ctrl.id);
        st.ped.setVariable('ctrlVer', st.ctrlVer);
        st.ped.controller = ctrl;

        try {
            ctrl.call('z:assignController', [st.id, st.ctrlVer]);
        } catch {}
    }

    issueCommand(st, command, payload = {}) {
        if (!st || st.dead || !st.ped || !mp.peds.exists(st.ped)) return;
        const controller = this.getPlayerById(st.controllerRid);
        if (!controller) return;

        st.ped.setVariable('command', command);
        st.ped.setVariable('commandExtra', payload);
        try { controller.call('z:executeCommand', [st.id, command, JSON.stringify(payload)]); } catch {}
    }

    getPlayerById(rid) {
        let found = null;
        mp.players.forEach((p) => {
            if (!found && p.id === rid) found = p;
        });
        return found;
    }

    processMovement() {
        const now = Date.now();
        this.npcs.forEach((st) => {
            if (st.dead || !st.ped || !mp.peds.exists(st.ped)) return;
            if (now - st.lastMoveAt < CONFIG.moveSyncMs) return;
            st.lastMoveAt = now;

            const zone = this.zones.get(st.zoneId);
            if (!zone) return;

            let target = this.getPlayerById(st.targetRid);
            if (!target || !this.isPlayerInZone(target, zone) || Number(target.health) <= 0) {
                target = this.chooseNearestPlayerForPos(zone, st.ped.position);
                st.targetRid = target ? target.id : null;
            }
            if (!target) {
                this.issueCommand(st, 'idle', { reason: 'no-target' });
                return;
            }

            const dist = dist3(st.ped.position, target.position);
            if (!st.controllerRid || !this.getPlayerById(st.controllerRid)) {
                this.assignController(st, 'lost-controller');
            }

            if (dist <= CONFIG.stopDistance) {
                if (now - st.lastFireFxAt > 100) {
                    this.issueCommand(st, 'fire', {
                        rid: target.id,
                        burstMs: 100,
                        weapon: st.weaponName,
                    });
                    st.lastFireFxAt = now;
                }
            } else {
                this.issueCommand(st, 'follow', {
                    rid: target.id,
                    speed: CONFIG.moveSpeed,
                    stopDist: CONFIG.stopDistance,
                });
            }
        });
    }

    processDamage() {
        const now = Date.now();
        this.npcs.forEach((st) => {
            if (st.dead || !st.ped || !mp.peds.exists(st.ped)) return;
            if (now - st.lastDamageAt < CONFIG.damageTickMs) return;
            st.lastDamageAt = now;

            const zone = this.zones.get(st.zoneId);
            if (!zone) return;
            const target = this.getPlayerById(st.targetRid);
            if (!target || !this.isPlayerInZone(target, zone) || Number(target.health) <= 0) return;

            const dist = dist3(st.ped.position, target.position);
            if (dist > CONFIG.stopDistance) return;

            const dmg = CONFIG.damageMin + ((Math.random() * (CONFIG.damageMax - CONFIG.damageMin + 1)) | 0);
            const hp = Math.max(0, Number(target.health) - dmg);
            target.health = hp;
            try { target.call('enemy:damagedByNpc', [st.id, dmg]); } catch {}
        });
    }

    cleanupEmptyZones() {
        const now = Date.now();
        this.zones.forEach((zone) => {
            const players = this.zonePlayers(zone);
            if (players.length) {
                zone.emptySinceAt = 0;
                return;
            }

            if (!zone.emptySinceAt) {
                zone.emptySinceAt = now;
                return;
            }

            if (now - zone.emptySinceAt < CONFIG.emptyDestroyMs) return;
            zone.npcIds.slice().forEach((id) => this.removeNpc(id, 'zone-empty-timeout'));
            zone.npcIds = [];
            zone.emptySinceAt = 0;
        });
    }

    registerLoops() {
        setInterval(() => {
            this.zones.forEach((zone) => this.ensureZonePopulation(zone));
            this.processMovement();
        }, CONFIG.moveSyncMs);

        setInterval(() => this.processDamage(), CONFIG.damageTickMs);
        setInterval(() => this.cleanupEmptyZones(), 1000);
    }

    createEditorZone(player, nameRaw) {
        const name = String(nameRaw || `EnemyZone_${Date.now()}`).trim();
        const zone = {
            id: this.nextLocalZoneId++,
            name,
            dimension: Number(player.dimension) || 0,
            zombieCount: 3,
            respawnSec: 60,
            points: [{
                x: Number(player.position.x),
                y: Number(player.position.y),
                z: Number(player.position.z),
            }],
        };
        this.editor.set(player.id, zone);
        return zone;
    }

    addEditorPoint(player) {
        const zone = this.editor.get(player.id);
        if (!zone) return null;
        zone.points.push({
            x: Number(player.position.x),
            y: Number(player.position.y),
            z: Number(player.position.z),
        });
        return zone;
    }

    setEditorCount(player, countRaw) {
        const zone = this.editor.get(player.id);
        if (!zone) return null;
        zone.zombieCount = Math.max(1, Math.min(20, parseInt(countRaw, 10) || 1));
        return zone;
    }

    setEditorRespawn(player, secRaw) {
        const zone = this.editor.get(player.id);
        if (!zone) return null;
        zone.respawnSec = Math.max(10, Math.min(300, parseInt(secRaw, 10) || 60));
        return zone;
    }

    async saveEditorZone(player) {
        const zone = this.editor.get(player.id);
        if (!zone || zone.points.length < 3) return { ok: false, error: 'Need >=3 points' };

        const runtime = this.buildZoneRuntime(zone);

        const db = this.db;
        if (db && db.sequelize) {
            await db.sequelize.query(
                'INSERT INTO enemy_npc_zones (name, dimension, zombieCount, respawnSec, points) VALUES (?, ?, ?, ?, ?)',
                { replacements: [runtime.name, runtime.dimension, runtime.zombieCount, runtime.respawnSec, JSON.stringify(runtime.points)] }
            );
            const [rows] = await db.sequelize.query('SELECT LAST_INSERT_ID() AS id');
            runtime.id = Number(rows[0].id);
        }

        this.zones.set(runtime.id, runtime);
        this.editor.delete(player.id);
        return { ok: true, zone: runtime };
    }

    async getZoneList() {
        return Array.from(this.zones.values()).map((z) => ({
            id: z.id,
            name: z.name,
            dimension: z.dimension,
            zombieCount: z.zombieCount,
            respawnSec: z.respawnSec,
            points: z.points.length,
        }));
    }

    gotoZone(player, idRaw) {
        const zone = this.zones.get(parseInt(idRaw, 10));
        if (!zone) return false;
        player.position = new mp.Vector3(zone.center.x, zone.center.y, zone.center.z + 1);
        player.dimension = zone.dimension;
        return true;
    }

    async reloadZone(idRaw) {
        const zone = this.zones.get(parseInt(idRaw, 10));
        if (!zone) return false;
        zone.npcIds.slice().forEach((npcId) => this.removeNpc(npcId, 'zone-reload'));
        zone.npcIds = [];
        this.ensureZonePopulation(zone);
        return true;
    }

    handleCtrlAck(player, npcIdRaw, verRaw) {
        const npcId = parseInt(npcIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        const st = this.npcs.get(npcId);
        if (!st || st.dead || !st.ped || !mp.peds.exists(st.ped)) return;
        if (st.controllerRid !== player.id) return;
        if (st.ctrlVer !== ver) return;
        st.lastAckAt = Date.now();
    }

    handleCtrlHeartbeat(player, npcIdRaw, verRaw) {
        const npcId = parseInt(npcIdRaw, 10);
        const ver = parseInt(verRaw, 10);
        const st = this.npcs.get(npcId);
        if (!st || st.dead || !st.ped || !mp.peds.exists(st.ped)) return;
        if (st.controllerRid !== player.id) return;
        if (st.ctrlVer !== ver) return;
        st.lastHeartbeatAt = Date.now();
    }

    onNpcDeadSignal(npcIdRaw) {
        const npcId = parseInt(npcIdRaw, 10);
        const st = this.npcs.get(npcId);
        if (!st || st.dead) return;
        st.dead = true;
        this.removeNpc(npcId, 'dead');
    }

    openEditorMenu(player) {
        if (!this.isPlayerAdmin(player)) {
            player.outputChatBox('!{#ff6666}[ENEMY] Команда только для админов.');
            return;
        }
        player.call('enemyzone:menu:open', []);
    }
}

module.exports = new EnemyZonesService();
