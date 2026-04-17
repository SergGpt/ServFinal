"use strict";

const { NPCAZ_STATE, setNpcState } = require('./npc.state');
const { saveTask, clearTask, restoreTask } = require('./npcTaskMemory');
const { createNpcControllerManager } = require('./npcControllerManager');

let notifs = call("notifications");

const RUNTIME = {
    behaviorTickMs: 350,
    zoneScanMs: 1000,
    controllerMaxDistance: 230,
    controllerTimeoutMs: 6500,
    switchCooldownMs: 800,
    pedSpawnRadiusMin: 0.8,
    pedSpawnRadiusMax: 1.8,
    followSpeed: 1.2,
};

const GUARD_MODELS = ['s_m_m_security_01', 's_m_y_blackops_01', 's_m_y_blackops_02'];
const LEAD_MODELS = ['s_m_y_blackops_03'];
const DEFAULT_WEAPON = 'WEAPON_CARBINERIFLE';

function randomFrom(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function normalizePoint(point) {
    return {
        x: Number(Number(point.x || 0).toFixed(3)),
        y: Number(Number(point.y || 0).toFixed(3)),
        z: Number(Number(point.z || 0).toFixed(3)),
    };
}

function dist3(a, b) {
    try {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) {
        return 999999;
    }
}

module.exports = {
    zone: null,
    zoneRuntimeId: 1,
    playerStates: new Map(),
    npcs: new Map(),
    zoneNpcIds: [],
    nextNid: 1,
    initialized: false,

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        await this.loadZoneFromDb();
        this.syncForAll();
        this.startDebugTracker();
        this.startBehaviorLoop();
        console.log(`[NpcAttakZone] inited. zone=${this.zone ? this.zone.id : 'none'}`);
    },

    log(msg) {
        console.log(`[NpcAttakZone] ${msg}`);
    },

    debugMessage(player, msg) {
        if (!player || !mp.players.exists(player)) return;
        try { player.call('npcattakzone:debug.message', [String(msg || '')]); } catch (e) {}
    },

    getZoneById(id) {
        if (Number(id) !== Number(this.zoneRuntimeId)) return null;
        return this.zone;
    },

    makeNpcId() {
        this.nextNid += 1;
        return this.nextNid;
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

    getZoneCenter() {
        if (!this.zone || !Array.isArray(this.zone.points) || this.zone.points.length < 1) {
            return new mp.Vector3(0, 0, 0);
        }
        const points = this.zone.points;
        const cx = points.reduce((sum, p) => sum + (Number(p.x) || 0), 0) / points.length;
        const cy = points.reduce((sum, p) => sum + (Number(p.y) || 0), 0) / points.length;
        const cz = points.reduce((sum, p) => sum + (Number(p.z) || 0), 0) / points.length;
        return new mp.Vector3(cx, cy, cz);
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
        if (!this.zone || !this.zone.enabled) return false;
        if (!Array.isArray(this.zone.points) || this.zone.points.length < 3) return false;
        if (!player || !mp.players.exists(player)) return false;
        if (Number(player.dimension) !== Number(this.zone.dimension)) return false;

        const pos = player.position;
        const minZ = Number(this.zone.minZ);
        const maxZ = Number(this.zone.maxZ);
        if (Number.isFinite(minZ) && pos.z < minZ) return false;
        if (Number.isFinite(maxZ) && pos.z > maxZ) return false;

        return this.isPointInsidePolygon2d(pos.x, pos.y, this.zone.points);
    },

    getPlayersInsideZone() {
        const list = [];
        mp.players.forEach((player) => {
            if (!player || !mp.players.exists(player)) return;
            if (this.isPlayerInsideZone(player)) list.push(player);
        });
        return list;
    },

    chooseController(zone, ped, preferredRid = null) {
        let best = null;
        let bestDist = Infinity;
        mp.players.forEach((player) => {
            if (!player || !mp.players.exists(player)) return;
            if (player.dimension !== zone.dimension) return;
            const d = dist3(player.position, ped.position);

            if (preferredRid !== null && player.id === preferredRid) {
                if (d <= RUNTIME.controllerMaxDistance && d < bestDist) {
                    best = player;
                    bestDist = d;
                }
                return;
            }

            if (d <= RUNTIME.controllerMaxDistance && d < bestDist) {
                best = player;
                bestDist = d;
            }
        });

        return best;
    },

    giveWeapon(ped) {
        try {
            const hash = mp.joaat(DEFAULT_WEAPON);
            ped.giveWeapon(hash, 9999);
            ped.setWeapon(hash);
            ped.currentWeapon = hash;
        } catch (e) {}
    },

    createNpc(role, targetRid) {
        if (!this.zone) return null;

        const center = this.getZoneCenter();
        const angle = Math.random() * Math.PI * 2;
        const dist = RUNTIME.pedSpawnRadiusMin + (Math.random() * (RUNTIME.pedSpawnRadiusMax - RUNTIME.pedSpawnRadiusMin));
        const pos = new mp.Vector3(
            center.x + Math.cos(angle) * dist,
            center.y + Math.sin(angle) * dist,
            center.z,
        );

        const modelName = role === 'leader' ? randomFrom(LEAD_MODELS) : randomFrom(GUARD_MODELS);
        const ped = mp.peds.new(mp.joaat(modelName), pos, { dynamic: true, invincible: false });
        ped.dimension = this.zone.dimension;

        const nid = this.makeNpcId();
        const st = {
            nid,
            zoneId: this.zoneRuntimeId,
            groupId: this.zoneRuntimeId,
            sceneId: this.zoneRuntimeId,
            role,
            state: NPCAZ_STATE.IDLE,
            targetRid,
            controllerRid: null,
            ctrlVer: 0,
            lastTaskType: null,
            lastTaskData: null,
            lastTaskAt: 0,
            lastHeartbeatAt: 0,
            switching: false,
            switchStartAt: 0,
            deadFlag: false,
            ped,
            cooldownUntil: 0,
        };

        try {
            ped.setVariable('npcazNpcId', nid);
            ped.setVariable('npcazZoneId', this.zoneRuntimeId);
            ped.setVariable('npcazGroupId', this.zoneRuntimeId);
            ped.setVariable('npcazSceneId', this.zoneRuntimeId);
            ped.setVariable('npcazRole', role);
            ped.setVariable('npcazState', NPCAZ_STATE.IDLE);
            ped.setVariable('npcazTargetRid', targetRid == null ? -1 : targetRid);
            ped.setVariable('npcazControllerRid', -1);
            ped.setVariable('npcazCtrlVer', 0);
            ped.setVariable('npcazCommand', 'idle');
            ped.setVariable('npcazCommandExtra', null);
            ped.setVariable('npcazLivePos', { x: pos.x, y: pos.y, z: pos.z });
            ped.setVariable('npcazDead', false);
            ped.health = 250;
            ped.setHealth(250);
        } catch (e) {}

        this.giveWeapon(ped);
        this.npcs.set(nid, st);
        this.zoneNpcIds.push(nid);
        this.controllerManager.beginSwitch(st, 'spawn');

        return st;
    },

    clearNpc(st) {
        if (!st) return;
        try {
            if (st.ped && mp.peds.exists(st.ped)) st.ped.destroy();
        } catch (e) {}
        this.npcs.delete(st.nid);
    },

    clearAllNpcs() {
        const ids = [...this.zoneNpcIds];
        ids.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st) return;
            this.clearNpc(st);
        });
        this.zoneNpcIds = [];
    },

    ensureNpcGroupForTarget(target) {
        if (!target || !mp.players.exists(target)) return;

        if (this.zoneNpcIds.length) {
            this.zoneNpcIds.forEach((nid) => {
                const st = this.npcs.get(nid);
                if (!st) return;
                st.targetRid = target.id;
                try {
                    if (st.ped && mp.peds.exists(st.ped)) st.ped.setVariable('npcazTargetRid', target.id);
                } catch (e) {}
            });
            return;
        }

        this.log(`spawn group for player id=${target.id}`);
        this.debugMessage(target, 'Сервер: спавн 4 NPC для зоны');

        for (let i = 0; i < 3; i++) {
            this.createNpc('guard', target.id);
        }
        this.createNpc('leader', target.id);
    },

    setTaskGuardEngage(st, targetRid) {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
        const target = mp.players.at(targetRid);
        if (!target || !mp.players.exists(target)) return;

        const controller = st.ped.controller;
        if (!controller || !mp.players.exists(controller)) return;

        const payload = {
            rid: targetRid,
            aimDist: 7.0,
            runSpeed: 3.2,
        };

        try {
            controller.call('npcattakzone:npc.executeCommand', [st.nid, 'guardEngage', JSON.stringify(payload)]);
        } catch (e) {}

        try {
            st.ped.setVariable('npcazCommand', 'guardEngage');
            st.ped.setVariable('npcazCommandExtra', payload);
        } catch (e) {}

        saveTask(st, 'guardEngage', payload);
        setNpcState(st, NPCAZ_STATE.HOLD_AIM, (msg) => this.log(msg), 'guard-engage');
    },

    setTaskLeaderFrisk(st, targetRid) {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return;

        const controller = st.ped.controller;
        if (!controller || !mp.players.exists(controller)) return;

        const payload = {
            rid: targetRid,
            stopDist: 1.5,
            friskDist: 1.5,
            runSpeed: 2.1,
        };

        try {
            controller.call('npcattakzone:npc.executeCommand', [st.nid, 'leaderFrisk', JSON.stringify(payload)]);
        } catch (e) {}

        try {
            st.ped.setVariable('npcazCommand', 'leaderFrisk');
            st.ped.setVariable('npcazCommandExtra', payload);
        } catch (e) {}

        saveTask(st, 'leaderFrisk', payload);
        setNpcState(st, NPCAZ_STATE.FRISK, (msg) => this.log(msg), 'leader-frisk');
    },

    runBehaviorTick() {
        const insidePlayers = this.getPlayersInsideZone();
        if (!insidePlayers.length) {
            if (this.zoneNpcIds.length) {
                this.log('zone empty -> despawn npcs');
                this.clearAllNpcs();
            }
            return;
        }

        const primaryTarget = insidePlayers[0];
        this.ensureNpcGroupForTarget(primaryTarget);

        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st || !st.ped || !mp.peds.exists(st.ped)) return;

            this.controllerManager.checkTimeout(st);

            let target = mp.players.at(st.targetRid);
            if (!target || !mp.players.exists(target) || !this.isPlayerInsideZone(target)) {
                target = insidePlayers[0] || null;
                st.targetRid = target ? target.id : null;
                try { st.ped.setVariable('npcazTargetRid', st.targetRid == null ? -1 : st.targetRid); } catch (e) {}
            }

            if (!target) {
                clearTask(st);
                setNpcState(st, NPCAZ_STATE.IDLE, (msg) => this.log(msg), 'no-target');
                return;
            }

            const correctController = this.chooseController(this.zone, st.ped, st.targetRid);
            if (correctController && st.controllerRid !== correctController.id && !st.switching) {
                this.controllerManager.beginSwitch(st, 'better-controller');
                return;
            }

            if (st.role === 'leader') {
                this.setTaskLeaderFrisk(st, target.id);
            } else {
                this.setTaskGuardEngage(st, target.id);
            }
        });
    },

    startBehaviorLoop() {
        setInterval(() => this.runBehaviorTick(), RUNTIME.behaviorTickMs);
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
                        this.log(`player ${player.name} (${player.id}) entered zone`);
                        this.debugMessage(player, 'Сервер: игрок вошел в зону');
                    } else {
                        this.log(`player ${player.name} (${player.id}) left zone`);
                        this.debugMessage(player, 'Сервер: игрок вышел из зоны');
                    }
                }
            });
        }, RUNTIME.zoneScanMs);
    },

    async loadZoneFromDb() {
        const Model = db && db.Models ? db.Models.NpcAttakZone : null;
        if (!Model) {
            this.log('model NpcAttakZone not found');
            return;
        }

        const row = await Model.findOne({ order: [['id', 'ASC']] }).catch(() => null);
        if (!row) {
            this.zone = this.getDefaultZone();
            return;
        }

        const data = row.get ? row.get({ plain: true }) : row;
        let points = [];
        try { points = JSON.parse(data.points || '[]'); } catch (e) {}

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

        this.clearAllNpcs();
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

    onControllerAck(player, nid, ver) {
        const st = this.npcs.get(parseInt(nid));
        if (!st) return;
        this.controllerManager.onControllerAck(st, player.id, parseInt(ver));
    },

    onHeartbeat(player, nid, posJson = null) {
        const st = this.npcs.get(parseInt(nid));
        if (!st) return;
        this.controllerManager.onHeartbeat(st, player.id);

        if (posJson) {
            let pos = null;
            try { pos = typeof posJson === 'string' ? JSON.parse(posJson) : posJson; } catch (e) {}
            if (pos && typeof pos === 'object') {
                const livePos = {
                    x: Number(pos.x) || 0,
                    y: Number(pos.y) || 0,
                    z: Number(pos.z) || 0,
                };
                st.livePos = livePos;
                try {
                    if (st.ped && mp.peds.exists(st.ped)) st.ped.setVariable('npcazLivePos', livePos);
                } catch (e) {}
            }
        }
    },

    onPlayerQuit(player) {
        this.playerStates.delete(player.id);

        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st) return;

            if (st.controllerRid === player.id) {
                this.controllerManager.beginSwitch(st, 'controller-quit');
            }

            if (st.targetRid === player.id) {
                st.targetRid = null;
                try {
                    if (st.ped && mp.peds.exists(st.ped)) st.ped.setVariable('npcazTargetRid', -1);
                } catch (e) {}
            }
        });
    },
};

module.exports.controllerManager = createNpcControllerManager({
    chooseController: (zone, ped, preferredRid) => module.exports.chooseController(zone, ped, preferredRid),
    getZone: (zoneId) => module.exports.getZoneById(zoneId),
    logger: (msg) => module.exports.log(msg),
    timers: {
        controllerTimeoutMs: RUNTIME.controllerTimeoutMs,
        switchCooldownMs: RUNTIME.switchCooldownMs,
    },
    restoreTask: (st) => restoreTask(st, {
        guardEngage: (npc, data) => module.exports.setTaskGuardEngage(npc, data.rid),
        leaderFrisk: (npc, data) => module.exports.setTaskLeaderFrisk(npc, data.rid),
    }),
});
