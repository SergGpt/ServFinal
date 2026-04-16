"use strict";

const {
    dist3,
    normalizeZonePoints,
    randomPointInPolygon,
    isPointInPolygon2d,
} = require('../../banditsS/zombie.utils');

const WEAPON_ASSAULTRIFLE = 0xBFEFFF6D;
const MODEL_ARMY = 's_m_y_army_01';

class EnemyZonesSystem {
    constructor() {
        this.db = null;
        this.sequelize = null;

        this.zones = new Map(); // zoneId -> zone state
        this.npcs = new Map(); // ped.id -> npc state

        this.buildSessions = new Map(); // player.id -> draft
        this.controllerHeartbeat = new Map(); // pedId -> timestamp

        this.tickTimer = null;
        this.heartbeatTimer = null;

        this.cfg = {
            attackRange: 5.0,
            followSpeed: 1.35,
            damageEveryMs: 400,
            damagePerTick: 12,
            zoneIdleDespawnMs: 30_000,
            heartbeatTimeoutMs: 3_500,
            aiTickMs: 250,
            modelHash: mp.joaat(MODEL_ARMY),
            weaponHash: WEAPON_ASSAULTRIFLE,
            maxNpcCount: 40,
            maxRespawnSec: 600,
        };
    }

    async init(dbRef) {
        this.db = dbRef || global.db;
        this.sequelize = this.db && this.db.sequelize ? this.db.sequelize : null;

        await this.ensureSchema();
        await this.loadZonesFromDb();

        this.startLoops();
        console.log(`[EnemyZones] init done. zones=${this.zones.size}`);
    }

    async ensureSchema() {
        if (!this.sequelize) return;

        await this.sequelize.query(`
            CREATE TABLE IF NOT EXISTS enemy_npc_zones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(64) NOT NULL,
                dimension INT NOT NULL DEFAULT 0,
                npcCount INT NOT NULL DEFAULT 3,
                respawnSec INT NOT NULL DEFAULT 60,
                points LONGTEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        try {
            await this.sequelize.query('CREATE INDEX idx_dimension ON enemy_npc_zones(dimension)');
        } catch {}
    }

    async loadZonesFromDb() {
        this.clearAllZonesRuntime();
        if (!this.sequelize) return;

        const [rows] = await this.sequelize.query('SELECT * FROM enemy_npc_zones ORDER BY id ASC');
        (rows || []).forEach((row) => {
            let points = [];
            try { points = normalizeZonePoints(JSON.parse(row.points || '[]')); } catch {}
            if (points.length < 3) return;

            const zone = this.makeZoneRuntime({
                id: Number(row.id),
                name: String(row.name || `EnemyZone#${row.id}`),
                dimension: Number(row.dimension) || 0,
                npcCount: Math.max(1, Math.min(this.cfg.maxNpcCount, Number(row.npcCount) || 3)),
                respawnSec: Math.max(5, Math.min(this.cfg.maxRespawnSec, Number(row.respawnSec) || 60)),
                points,
            });

            this.zones.set(zone.id, zone);
        });
    }

    makeZoneRuntime(data) {
        const center = data.points.reduce((acc, p) => {
            acc.x += p.x; acc.y += p.y; acc.z += p.z;
            return acc;
        }, { x: 0, y: 0, z: 0 });

        center.x /= data.points.length;
        center.y /= data.points.length;
        center.z /= data.points.length;

        return {
            id: data.id,
            name: data.name,
            dimension: data.dimension,
            npcCount: data.npcCount,
            respawnSec: data.respawnSec,
            points: data.points,
            center,
            npcs: new Set(),
            players: new Set(),
            emptySince: 0,
            enabled: true,
        };
    }

    startLoops() {
        if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), this.cfg.aiTickMs);
        if (!this.heartbeatTimer) this.heartbeatTimer = setInterval(() => this.checkHeartbeatTimeouts(), 1000);
    }

    stopLoops() {
        if (this.tickTimer) clearInterval(this.tickTimer);
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.tickTimer = null;
        this.heartbeatTimer = null;
    }

    tick() {
        const now = Date.now();

        this.refreshPlayersInsideZones();

        this.zones.forEach((zone) => {
            if (!zone.enabled) return;

            if (zone.players.size > 0) {
                zone.emptySince = 0;
                this.ensureZoneNpcCount(zone);
            } else {
                if (!zone.emptySince) zone.emptySince = now;
                if (now - zone.emptySince >= this.cfg.zoneIdleDespawnMs) this.clearZoneNpcs(zone.id);
            }

            zone.npcs.forEach((pedId) => {
                const npc = this.npcs.get(pedId);
                if (!npc || !npc.isAlive) return;
                this.updateNpcController(zone, npc);
                this.updateNpcCombat(npc, now);
            });
        });
    }

    refreshPlayersInsideZones() {
        this.zones.forEach((z) => z.players.clear());

        mp.players.forEach((player) => {
            if (!player || !player.character || (Number(player.health) || 0) <= 0) return;

            this.zones.forEach((zone) => {
                if (player.dimension !== zone.dimension) return;
                if (isPointInPolygon2d(player.position.x, player.position.y, zone.points)) {
                    zone.players.add(player.id);
                }
            });
        });
    }

    ensureZoneNpcCount(zone) {
        const aliveNpcCount = [...zone.npcs].reduce((sum, pedId) => {
            const npc = this.npcs.get(pedId);
            return sum + (npc && npc.isAlive ? 1 : 0);
        }, 0);

        if (aliveNpcCount >= zone.npcCount) return;

        const toSpawn = zone.npcCount - aliveNpcCount;
        for (let i = 0; i < toSpawn; i++) this.spawnNpc(zone.id);
    }

    spawnNpc(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return null;

        const p = randomPointInPolygon(zone.points, {
            x: zone.center.x,
            y: zone.center.y,
            z: zone.center.z,
            radius: 8,
        });

        const ped = mp.peds.new(
            this.cfg.modelHash,
            new mp.Vector3(p.x, p.y, p.z),
            {
                dynamic: true,
                dimension: zone.dimension,
                heading: Math.random() * 360,
            }
        );

        ped.setVariable('enemyZoneNpc', true);
        ped.setVariable('enemyZoneId', zone.id);
        ped.setVariable('enemyCanFire', false);

        try { ped.giveWeapon(this.cfg.weaponHash, 9999); } catch {}

        const npc = {
            ped,
            pedId: ped.id,
            zoneId,
            controllerId: null,
            targetPlayerId: null,
            isAlive: true,
            lastDamageAt: 0,
            respawnAt: 0,
        };

        zone.npcs.add(ped.id);
        this.npcs.set(ped.id, npc);

        return npc;
    }

    clearZoneNpcs(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return;

        [...zone.npcs].forEach((pedId) => {
            const npc = this.npcs.get(pedId);
            if (npc && npc.ped && mp.peds.exists(npc.ped)) {
                mp.players.forEach((pl) => pl.call('z:forceRemove', [npc.ped.id]));
                npc.ped.destroy();
            }
            this.npcs.delete(pedId);
            this.controllerHeartbeat.delete(pedId);
        });

        zone.npcs.clear();
    }

    clearAllZonesRuntime() {
        this.zones.forEach((zone) => this.clearZoneNpcs(zone.id));
        this.zones.clear();
        this.npcs.clear();
    }

    updateNpcController(zone, npc) {
        const now = Date.now();

        let currentController = this.getPlayerById(npc.controllerId);
        const target = this.pickNearestZonePlayer(zone, npc.ped.position);

        if (!target) {
            if (currentController) currentController.call('z:executeCommand', ['idle', npc.ped.id, -1]);
            npc.controllerId = null;
            npc.targetPlayerId = null;
            npc.ped.setVariable('enemyCanFire', false);
            return;
        }

        if (!currentController || currentController.id !== target.id) {
            npc.controllerId = target.id;
            currentController = target;
            currentController.call('z:assignController', [npc.ped.id]);
        }

        npc.targetPlayerId = target.id;
        this.controllerHeartbeat.set(npc.pedId, now);
    }

    updateNpcCombat(npc, now) {
        const controller = this.getPlayerById(npc.controllerId);
        const target = this.getPlayerById(npc.targetPlayerId);

        if (!controller || !target || !npc.ped || !mp.peds.exists(npc.ped)) return;

        const distance = dist3(npc.ped.position, target.position);
        if (!Number.isFinite(distance)) return;

        if (distance <= this.cfg.attackRange) {
            npc.ped.setVariable('enemyCanFire', true);
            controller.call('z:executeCommand', ['fire', npc.ped.id, target.id]);

            if (now - npc.lastDamageAt >= this.cfg.damageEveryMs) {
                npc.lastDamageAt = now;
                const hp = Math.max(0, (Number(target.health) || 0) - this.cfg.damagePerTick);
                target.health = hp;
            }
            return;
        }

        npc.ped.setVariable('enemyCanFire', false);
        controller.call('z:executeCommand', ['follow', npc.ped.id, target.id]);
    }

    checkHeartbeatTimeouts() {
        const now = Date.now();

        this.npcs.forEach((npc) => {
            if (!npc.isAlive) return;
            const lastHb = this.controllerHeartbeat.get(npc.pedId) || 0;
            if (!lastHb) return;
            if (now - lastHb <= this.cfg.heartbeatTimeoutMs) return;

            npc.controllerId = null;
            this.controllerHeartbeat.delete(npc.pedId);
        });

        this.npcs.forEach((npc) => {
            if (!npc.isAlive) {
                if (npc.respawnAt && now >= npc.respawnAt) {
                    const oldZoneId = npc.zoneId;
                    this.removeNpcRuntime(npc.pedId);
                    this.spawnNpc(oldZoneId);
                }
            }
        });
    }

    removeNpcRuntime(pedId) {
        const npc = this.npcs.get(pedId);
        if (!npc) return;

        const zone = this.zones.get(npc.zoneId);
        if (zone) zone.npcs.delete(pedId);

        if (npc.ped && mp.peds.exists(npc.ped)) {
            mp.players.forEach((pl) => pl.call('z:forceRemove', [npc.ped.id]));
            npc.ped.destroy();
        }

        this.npcs.delete(pedId);
        this.controllerHeartbeat.delete(pedId);
    }

    getPlayerById(id) {
        if (typeof id !== 'number') return null;
        let found = null;
        mp.players.forEach((p) => { if (!found && p.id === id) found = p; });
        return found;
    }

    pickNearestZonePlayer(zone, fromPos) {
        let best = null;
        let bestDist = Number.MAX_SAFE_INTEGER;

        zone.players.forEach((pid) => {
            const p = this.getPlayerById(pid);
            if (!p || (Number(p.health) || 0) <= 0) return;
            const d = dist3(fromPos, p.position);
            if (d < bestDist) {
                best = p;
                bestDist = d;
            }
        });

        return best;
    }

    // ---- Admin editor API ----
    startCreate(player, name = 'Enemy Zone') {
        const safeName = String(name || 'Enemy Zone').trim().slice(0, 64);
        this.buildSessions.set(player.id, {
            name: safeName || 'Enemy Zone',
            dimension: Number(player.dimension) || 0,
            npcCount: 3,
            respawnSec: 60,
            points: [],
        });

        this.pushBuilderPreview(player);
    }

    addPoint(player) {
        const draft = this.buildSessions.get(player.id);
        if (!draft) return { ok: false, msg: 'Сначала создайте черновик зоны.' };

        draft.points.push({
            x: Number(player.position.x),
            y: Number(player.position.y),
            z: Number(player.position.z),
        });

        draft.points = normalizeZonePoints(draft.points);
        this.pushBuilderPreview(player);

        return { ok: true, msg: `Точка добавлена (${draft.points.length})` };
    }

    setCount(player, count) {
        const draft = this.buildSessions.get(player.id);
        if (!draft) return { ok: false, msg: 'Нет активного черновика.' };
        const val = Math.max(1, Math.min(this.cfg.maxNpcCount, Number(count) || 1));
        draft.npcCount = val;
        return { ok: true, msg: `NPC count = ${val}` };
    }

    setRespawn(player, sec) {
        const draft = this.buildSessions.get(player.id);
        if (!draft) return { ok: false, msg: 'Нет активного черновика.' };
        const val = Math.max(5, Math.min(this.cfg.maxRespawnSec, Number(sec) || 60));
        draft.respawnSec = val;
        return { ok: true, msg: `Respawn = ${val}s` };
    }

    async saveDraft(player) {
        const draft = this.buildSessions.get(player.id);
        if (!draft) return { ok: false, msg: 'Нет активного черновика.' };

        if (draft.points.length < 3) {
            return { ok: false, msg: 'Нужно минимум 3 точки полигона.' };
        }

        if (!this.sequelize) return { ok: false, msg: 'DB недоступна.' };

        const [res] = await this.sequelize.query(
            'INSERT INTO enemy_npc_zones (name, dimension, npcCount, respawnSec, points) VALUES (?, ?, ?, ?, ?)',
            { replacements: [draft.name, draft.dimension, draft.npcCount, draft.respawnSec, JSON.stringify(draft.points)] }
        );

        const zoneId = Number(res && (res.insertId || (res[0] && res[0].insertId)));
        await this.loadZonesFromDb();

        this.buildSessions.delete(player.id);
        player.call('enemyzone:builder:clear', []);

        return { ok: true, msg: `Зона сохранена (ID ${zoneId || 'new'})` };
    }

    listZones() {
        return [...this.zones.values()].map((z) => ({
            id: z.id,
            name: z.name,
            dimension: z.dimension,
            npcCount: z.npcCount,
            respawnSec: z.respawnSec,
            pointsCount: z.points.length,
            players: z.players.size,
            npcs: z.npcs.size,
        }));
    }

    async gotoZone(player, zoneId) {
        const zone = this.zones.get(Number(zoneId));
        if (!zone) return { ok: false, msg: 'Зона не найдена.' };
        player.position = new mp.Vector3(zone.center.x, zone.center.y, zone.center.z + 1.0);
        player.dimension = zone.dimension;
        return { ok: true, msg: `Телепорт в ${zone.name}` };
    }

    async reload() {
        await this.loadZonesFromDb();
    }

    pushBuilderPreview(player) {
        const draft = this.buildSessions.get(player.id);
        if (!draft) {
            player.call('enemyzone:builder:clear', []);
            return;
        }

        player.call('enemyzone:builder:update', [JSON.stringify({
            points: draft.points,
            dimension: draft.dimension,
            npcCount: draft.npcCount,
            respawnSec: draft.respawnSec,
            name: draft.name,
        })]);
    }

    onCtrlAck(player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc) return;
        if (npc.controllerId === player.id) this.controllerHeartbeat.set(npc.pedId, Date.now());
    }

    onCtrlHeartbeat(player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc) return;
        if (npc.controllerId === player.id) this.controllerHeartbeat.set(npc.pedId, Date.now());
    }

    onNpcDeadSignal(_player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc || !npc.isAlive) return;

        npc.isAlive = false;
        npc.respawnAt = Date.now() + ((this.zones.get(npc.zoneId)?.respawnSec || 60) * 1000);
        npc.controllerId = null;
        npc.targetPlayerId = null;

        if (npc.ped && mp.peds.exists(npc.ped)) {
            mp.players.forEach((pl) => pl.call('z:forceRemove', [npc.ped.id]));
            npc.ped.destroy();
        }
    }

    destroy() {
        this.stopLoops();
        this.clearAllZonesRuntime();
    }
}

module.exports = EnemyZonesSystem;
