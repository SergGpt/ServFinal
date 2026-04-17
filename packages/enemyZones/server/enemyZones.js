"use strict";

const { dist3 } = require('../../banditsS/zombie.utils');

const WEAPON_ASSAULTRIFLE = 0xBFEFFF6D;
const MODEL_ARMY = 's_m_y_army_01';

class EnemyZonesSystem {
    constructor() {
        this.npcs = new Map(); // pedId -> state
        this.controllerHeartbeat = new Map();

        this.tickTimer = null;
        this.hbTimer = null;

        this.staticZone = {
            id: 1,
            name: 'Static Enemy Zone',
            center: { x: -2288.1455078125, y: 3019.822998046875, z: 32.810028076171875 },
            radius: 150,
            npcCount: 12, // на каждое активное измерение
            respawnSec: 30,
            npcs: new Set(),
        };

        this.cfg = {
            attackRange: 5.0,
            damageEveryMs: 400,
            damagePerTick: 12,
            heartbeatTimeoutMs: 4000,
            aiTickMs: 250,
            model: MODEL_ARMY,
            weaponHash: WEAPON_ASSAULTRIFLE,
        };
    }

    async init() {
        if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), this.cfg.aiTickMs);
        if (!this.hbTimer) this.hbTimer = setInterval(() => this.checkHeartbeat(), 1000);

        console.log(`[EnemyZones] Static zone enabled at ${this.staticZone.center.x}, ${this.staticZone.center.y}, ${this.staticZone.center.z}, radius=${this.staticZone.radius}`);
    }

    // Совместимость со старым events/commands API
    startCreate() {}
    addPoint() { return { ok: false, msg: 'Отключено: используется статическая зона.' }; }
    setCount() { return { ok: false, msg: 'Отключено: используется статическая зона.' }; }
    setRespawn() { return { ok: false, msg: 'Отключено: используется статическая зона.' }; }
    async saveDraft() { return { ok: false, msg: 'Отключено: используется статическая зона.' }; }
    async reload() {
        [...this.npcs.keys()].forEach((id) => this.removeNpc(id));
    }

    listZones() {
        return [{
            id: this.staticZone.id,
            name: this.staticZone.name,
            dimension: -1,
            npcCount: this.staticZone.npcCount,
            respawnSec: this.staticZone.respawnSec,
            pointsCount: 0,
            players: this.getPlayersInZone().length,
            npcs: this.staticZone.npcs.size,
        }];
    }

    async gotoZone(player) {
        player.position = new mp.Vector3(this.staticZone.center.x, this.staticZone.center.y, this.staticZone.center.z + 1.0);
        return { ok: true, msg: 'Телепорт в статическую зону NPC' };
    }

    randomPointInCircle() {
        const t = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.staticZone.radius;
        return {
            x: this.staticZone.center.x + Math.cos(t) * r,
            y: this.staticZone.center.y + Math.sin(t) * r,
            z: this.staticZone.center.z,
        };
    }

    spawnNpc(dimension) {
        const p = this.randomPointInCircle();

        const ped = mp.peds.new(mp.joaat(this.cfg.model), new mp.Vector3(p.x, p.y, p.z), {
            dynamic: true,
            dimension: Number(dimension) || 0,
            heading: Math.random() * 360,
        });

        ped.setVariable('enemyZoneNpc', true);
        ped.setVariable('enemyZoneId', this.staticZone.id);

        try { ped.giveWeapon(this.cfg.weaponHash, 9999); } catch {}

        const state = {
            ped,
            pedId: ped.id,
            isAlive: true,
            controllerId: null,
            targetId: null,
            lastDamageAt: 0,
            respawnAt: 0,
            dimension: Number(dimension) || 0,
        };

        this.npcs.set(ped.id, state);
        this.staticZone.npcs.add(ped.id);
        return state;
    }

    getPlayerById(id) {
        if (typeof id !== 'number') return null;
        let found = null;
        mp.players.forEach((p) => {
            if (!found && p.id === id) found = p;
        });
        return found;
    }

    getPlayersInZone() {
        const list = [];
        mp.players.forEach((p) => {
            if (!p || !p.character || (Number(p.health) || 0) <= 0) return;
            if (dist3(p.position, this.staticZone.center) <= this.staticZone.radius) list.push(p);
        });
        return list;
    }

    getAliveNpcCountByDimension(dimension) {
        let c = 0;
        this.npcs.forEach((npc) => {
            if (!npc.isAlive) return;
            if (!npc.ped || !mp.peds.exists(npc.ped)) return;
            if (npc.dimension === dimension) c += 1;
        });
        return c;
    }

    ensureSpawnCountForDimensions(dimensions) {
        dimensions.forEach((dimension) => {
            const alive = this.getAliveNpcCountByDimension(dimension);
            for (let i = alive; i < this.staticZone.npcCount; i++) this.spawnNpc(dimension);
        });
    }

    pickNearestPlayer(fromPos, dimension) {
        const players = this.getPlayersInZone().filter((p) => p.dimension === dimension);
        let best = null;
        let bestD = Infinity;

        players.forEach((p) => {
            const d = dist3(fromPos, p.position);
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        });

        return best;
    }

    tick() {
        const activePlayers = this.getPlayersInZone();
        if (!activePlayers.length) return;

        const dimensions = [...new Set(activePlayers.map((p) => Number(p.dimension) || 0))];
        this.ensureSpawnCountForDimensions(dimensions);

        const now = Date.now();

        this.staticZone.npcs.forEach((pedId) => {
            const npc = this.npcs.get(pedId);
            if (!npc || !npc.isAlive || !npc.ped || !mp.peds.exists(npc.ped)) return;

            const target = this.pickNearestPlayer(npc.ped.position, npc.dimension);
            if (!target) {
                if (npc.controllerId) {
                    const ctrl = this.getPlayerById(npc.controllerId);
                    if (ctrl) ctrl.call('z:executeCommand', ['idle', npc.ped.id, -1]);
                }
                npc.controllerId = null;
                npc.targetId = null;
                return;
            }

            if (npc.controllerId !== target.id) {
                npc.controllerId = target.id;
                target.call('z:assignController', [npc.ped.id]);
            }
            npc.targetId = target.id;

            const d = dist3(npc.ped.position, target.position);
            if (d <= this.cfg.attackRange) {
                target.call('z:executeCommand', ['fire', npc.ped.id, target.id]);
                if (now - npc.lastDamageAt >= this.cfg.damageEveryMs) {
                    npc.lastDamageAt = now;
                    target.health = Math.max(0, (Number(target.health) || 0) - this.cfg.damagePerTick);
                }
            } else {
                target.call('z:executeCommand', ['follow', npc.ped.id, target.id]);
            }
        });
    }

    checkHeartbeat() {
        const now = Date.now();

        this.npcs.forEach((npc) => {
            if (!npc.isAlive) {
                if (npc.respawnAt && now >= npc.respawnAt) {
                    const respDim = npc.dimension;
                    this.removeNpc(npc.pedId);
                    this.spawnNpc(respDim);
                }
                return;
            }

            if (!npc.controllerId) return;
            const hb = this.controllerHeartbeat.get(npc.pedId) || 0;
            if (hb && now - hb > this.cfg.heartbeatTimeoutMs) {
                npc.controllerId = null;
                npc.targetId = null;
            }
        });
    }

    removeNpc(pedId) {
        const npc = this.npcs.get(pedId);
        if (!npc) return;

        if (npc.ped && mp.peds.exists(npc.ped)) {
            mp.players.forEach((p) => p.call('z:forceRemove', [npc.ped.id]));
            npc.ped.destroy();
        }

        this.npcs.delete(pedId);
        this.staticZone.npcs.delete(pedId);
        this.controllerHeartbeat.delete(pedId);
    }

    onCtrlAck(player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc || npc.controllerId !== player.id) return;
        this.controllerHeartbeat.set(npc.pedId, Date.now());
    }

    onCtrlHeartbeat(player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc || npc.controllerId !== player.id) return;
        this.controllerHeartbeat.set(npc.pedId, Date.now());
    }

    onNpcDeadSignal(_player, pedId) {
        const npc = this.npcs.get(Number(pedId));
        if (!npc || !npc.isAlive) return;

        npc.isAlive = false;
        npc.controllerId = null;
        npc.targetId = null;
        npc.respawnAt = Date.now() + this.staticZone.respawnSec * 1000;

        if (npc.ped && mp.peds.exists(npc.ped)) {
            mp.players.forEach((p) => p.call('z:forceRemove', [npc.ped.id]));
            npc.ped.destroy();
        }
    }

    destroy() {
        if (this.tickTimer) clearInterval(this.tickTimer);
        if (this.hbTimer) clearInterval(this.hbTimer);
        this.tickTimer = null;
        this.hbTimer = null;

        [...this.npcs.keys()].forEach((id) => this.removeNpc(id));
    }
}

module.exports = EnemyZonesSystem;
