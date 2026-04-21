"use strict";

const { NPCAZ_STATE, setNpcState } = require("./npc.state");
const { saveTask, clearTask, restoreTask } = require("./npcTaskMemory");
const { createNpcControllerManager } = require("./npcControllerManager");

let notifs = call("notifications");
let inventory = call("inventory");
let damageSystem = call("damageSystem");

const RUNTIME = {
    behaviorTickMs: 350,
    zoneScanMs: 1000,
    controllerMaxDistance: 230,
    controllerTimeoutMs: 6500,
    switchCooldownMs: 800,
    pedSpawnRadiusMin: 0.8,
    pedSpawnRadiusMax: 1.8,
    followSpeed: 1.2,
    commandReissueMs: 1200,
    postAckGraceMs: 500,
    livePosFreshMs: 3000,
    controllerSwitchHysteresis: 15.0,
    spawnControllerGraceMs: 1800,
    controllerEnsureRetryMs: 1200,
};

const GUARD_MODELS = ["s_m_m_security_01", "s_m_y_blackops_01", "s_m_y_blackops_02"];
const LEAD_MODELS = ["s_m_y_blackops_03"];
const DEFAULT_WEAPON = "WEAPON_CARBINERIFLE";

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
        const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
        const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
        const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (e) {
        return 999999;
    }
}

function normalizeLivePos(pos, fallback) {
    const src = pos || fallback || { x: 0, y: 0, z: 0 };
    return {
        x: Number(src.x) || 0,
        y: Number(src.y) || 0,
        z: Number(src.z) || 0,
    };
}

function findPlayerByRid(rid) {
    rid = Number(rid);
    if (!Number.isInteger(rid)) return null;
    let found = null;
    mp.players.forEach((player) => {
        if (!found && player && mp.players.exists(player) && Number(player.id) === rid) {
            found = player;
        }
    });
    return found;
}

module.exports = {
    zone: null,
    zoneRuntimeId: 1,
    playerStates: new Map(),
    npcs: new Map(),
    zoneNpcIds: [],
    nextNid: 1,
    initialized: false,
    passDialogs: new Map(),
    passDialogsBlockedUntil: new Map(),
    passApprovedSleepUntil: new Map(),

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        await this.loadZoneFromDb();
        this.syncForAll();
        this.startDebugTracker();
        this.startBehaviorLoop();
        console.log(`[NpcAttakZone] inited. zone=${this.zone ? this.zone.id : "none"}`);
    },

    log(msg) {
        console.log(`[NpcAttakZone] ${msg}`);
    },

    debugMessage(player, msg) {
        if (!player || !mp.players.exists(player)) return;
        try { player.call("npcattakzone:debug.message", [String(msg || "")]); } catch (e) {}
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
            name: "NpcAttakZone",
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
            zone.minZ = Number.isFinite(Number(raw.minZ))
                ? Number(raw.minZ)
                : Number((Math.min.apply(null, zs) - 1).toFixed(3));
            zone.maxZ = Number.isFinite(Number(raw.maxZ))
                ? Number(raw.maxZ)
                : Number((Math.max.apply(null, zs) + 2.5).toFixed(3));
        }

        zone.dimension = Number.isInteger(Number(raw && raw.dimension)) ? Number(raw.dimension) : 0;
        zone.name = raw && raw.name ? String(raw.name).slice(0, 64) : "NpcAttakZone";
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

    getNearestInsidePlayerToPos(pos, players) {
        const list = Array.isArray(players) ? players : this.getPlayersInsideZone();
        if (!list.length) return null;

        let nearest = null;
        let bestDist = Infinity;
        list.forEach((player) => {
            if (!player || !mp.players.exists(player)) return;
            const d = dist3(pos || { x: 0, y: 0, z: 0 }, player.position);
            if (d < bestDist) {
                nearest = player;
                bestDist = d;
            }
        });
        return nearest;
    },

 chooseController(zone, ped, preferredRid = null, livePos = null, blockedControllerRid = null) {
    let best = null;
    let bestDist = Infinity;
    const pedPos = livePos || (ped && ped.position) || { x: 0, y: 0, z: 0 };

    mp.players.forEach((player) => {
        if (!player || !mp.players.exists(player)) return;
        if (player.dimension !== zone.dimension) return;
        if (!this.isPlayerInsideZone(player)) return;
        if (blockedControllerRid !== null && blockedControllerRid !== undefined && player.id === blockedControllerRid) return;

        const d = dist3(player.position, pedPos);

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
        if (!ped || !mp.peds.exists(ped)) return;
        try {
            const hash = mp.joaat(DEFAULT_WEAPON);
            ped.giveWeapon(hash, 9999);
            ped.setWeapon(hash);
            ped.currentWeapon = hash;
            ped.setVariable("npcazWeaponName", DEFAULT_WEAPON);
            ped.setVariable("npcazHoldWeapon", true);
        } catch (e) {}
    },

    forceWeaponSync(st) {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
        try {
            const hash = mp.joaat(DEFAULT_WEAPON);
            st.ped.giveWeapon(hash, 9999);
            st.ped.setWeapon(hash);
            st.ped.currentWeapon = hash;
            st.ped.setVariable("npcazWeaponName", DEFAULT_WEAPON);
            st.ped.setVariable("npcazHoldWeapon", true);
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
            center.z
        );

        const modelName = role === "leader" ? randomFrom(LEAD_MODELS) : randomFrom(GUARD_MODELS);
        const ped = mp.peds.new(mp.joaat(modelName), pos, { dynamic: true, invincible: false });
        ped.dimension = this.zone.dimension;

        const nid = this.makeNpcId();
        const initialHeading = Number(ped.heading || 0);

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
            forceFire: false,
            lastFireDamageAt: 0,
            ped,
            cooldownUntil: 0,
            lastCommandSentAt: 0,
            lastIssuedCommand: null,
            lastIssuedPayload: null,
            postAckGraceUntil: 0,
            lastDebugAt: 0,
            livePos: { x: pos.x, y: pos.y, z: pos.z },
            liveHeading: initialHeading,
            livePosUpdatedAt: Date.now(),
            spawnedAt: Date.now(),
            lastEnsureControllerAt: 0,
        };

        try {
            ped.setVariable("npcazNpcId", nid);
            ped.setVariable("npcazZoneId", this.zoneRuntimeId);
            ped.setVariable("npcazGroupId", this.zoneRuntimeId);
            ped.setVariable("npcazSceneId", this.zoneRuntimeId);
            ped.setVariable("npcazRole", role);
            ped.setVariable("npcazState", NPCAZ_STATE.IDLE);
            ped.setVariable("npcazTargetRid", targetRid == null ? -1 : targetRid);
            ped.setVariable("npcazControllerRid", -1);
            ped.setVariable("npcazCtrlVer", 0);
            ped.setVariable("npcazCommand", "idle");
            ped.setVariable("npcazCommandExtra", null);
            ped.setVariable("npcazLivePos", { x: pos.x, y: pos.y, z: pos.z });
            ped.setVariable("npcazLiveHeading", initialHeading);
            ped.setVariable("npcazDead", false);

            ped.setVariable("npcazWeaponName", DEFAULT_WEAPON);
            ped.setVariable("npcazHoldWeapon", true);
            ped.setVariable("npcazAimActive", false);
            ped.setVariable("npcazVisualMode", "idle");
            ped.setVariable("npcazForceFire", false);

            ped.health = 250;
            ped.setHealth(250);
        } catch (e) {}

        this.giveWeapon(ped);
        this.forceWeaponSync(st);
        this.npcs.set(nid, st);
        this.zoneNpcIds.push(nid);
        this.controllerManager.beginSwitch(st, "spawn");

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
                    if (st.ped && mp.peds.exists(st.ped)) {
                        st.ped.setVariable("npcazTargetRid", target.id);
                    }
                } catch (e) {}
            });
            return;
        }

        this.log(`spawn group for player id=${target.id}`);
        this.debugMessage(target, "Сервер: спавн 4 NPC для зоны");

        for (let i = 0; i < 3; i++) {
            this.createNpc("guard", target.id);
        }
        this.createNpc("leader", target.id);
    },

    setTaskGuardEngage(st, targetRid) {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
        this.forceWeaponSync(st);

        const target = findPlayerByRid(targetRid);
        if (!target || !mp.players.exists(target)) return;

        const controller = st.ped.controller;
        if (!controller || !mp.players.exists(controller)) return;

        const payload = {
            rid: targetRid,
            aimDist: 7.0,
            runSpeed: 3.2,
        };

        const payloadKey = JSON.stringify(payload);
        const now = Date.now();

        if (
            st.lastIssuedCommand === "guardEngage" &&
            st.lastIssuedPayload === payloadKey &&
            now - (st.lastCommandSentAt || 0) < RUNTIME.commandReissueMs
        ) {
            return;
        }

        try {
            controller.call("npcattakzone:npc.executeCommand", [st.nid, "guardEngage", JSON.stringify(payload)]);
        } catch (e) {}

        try {
            st.ped.setVariable("npcazWeaponName", DEFAULT_WEAPON);
            st.ped.setVariable("npcazHoldWeapon", true);
            st.ped.setVariable("npcazAimActive", true);
            st.ped.setVariable("npcazVisualMode", "combat");
            st.ped.setVariable("npcazCommand", "guardEngage");
            st.ped.setVariable("npcazCommandExtra", payload);
        } catch (e) {}

        st.lastIssuedCommand = "guardEngage";
        st.lastIssuedPayload = payloadKey;
        st.lastCommandSentAt = now;

        saveTask(st, "guardEngage", payload);
        setNpcState(st, NPCAZ_STATE.HOLD_AIM, (msg) => this.log(msg), "guard-engage");
    },

    setTaskLeaderFrisk(st, targetRid) {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
        this.forceWeaponSync(st);

        const controller = st.ped.controller;
        if (!controller || !mp.players.exists(controller)) return;

        const payload = {
            rid: targetRid,
            stopDist: 2.0,
            friskDist: 2.0,
            runSpeed: 2.1,
        };

        const payloadKey = JSON.stringify(payload);
        const now = Date.now();

        if (
            st.lastIssuedCommand === "leaderFrisk" &&
            st.lastIssuedPayload === payloadKey &&
            now - (st.lastCommandSentAt || 0) < RUNTIME.commandReissueMs
        ) {
            return;
        }

        try {
            controller.call("npcattakzone:npc.executeCommand", [st.nid, "leaderFrisk", JSON.stringify(payload)]);
        } catch (e) {}

        try {
            st.ped.setVariable("npcazCommand", "leaderFrisk");
            st.ped.setVariable("npcazCommandExtra", payload);
            st.ped.setVariable("npcazWeaponName", DEFAULT_WEAPON);
            st.ped.setVariable("npcazHoldWeapon", true);
            st.ped.setVariable("npcazAimActive", false);
            st.ped.setVariable("npcazVisualMode", "leaderFrisk");
        } catch (e) {}

        st.lastIssuedCommand = "leaderFrisk";
        st.lastIssuedPayload = payloadKey;
        st.lastCommandSentAt = now;

        saveTask(st, "leaderFrisk", payload);
        setNpcState(st, NPCAZ_STATE.FRISK, (msg) => this.log(msg), "leader-frisk");
    },

    runBehaviorTick() {
        if (!this.passApprovedSleepUntil) this.passApprovedSleepUntil = new Map();
        const insidePlayers = this.getPlayersInsideZone();

        if (!insidePlayers.length) {
            if (this.zoneNpcIds.length) {
                this.log("zone empty -> despawn npcs");
                this.clearAllNpcs();
            }
            return;
        }

        const primaryTarget = insidePlayers[0];
        this.ensureNpcGroupForTarget(primaryTarget);

        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
            this.forceWeaponSync(st);

            this.controllerManager.checkTimeout(st);

            const now = Date.now();

            if (st.switching) return;

            if (st.controllerRid === null || st.controllerRid === undefined) {
                if (!st.lastEnsureControllerAt || now - st.lastEnsureControllerAt >= RUNTIME.controllerEnsureRetryMs) {
                    st.lastEnsureControllerAt = now;
                    this.controllerManager.beginSwitch(st, "ensure-controller");
                }
                return;
            }

            const controller = findPlayerByRid(st.controllerRid);
            if (!controller || !mp.players.exists(controller)) {
                if (!st.lastEnsureControllerAt || now - st.lastEnsureControllerAt >= RUNTIME.controllerEnsureRetryMs) {
                    st.lastEnsureControllerAt = now;
                    this.controllerManager.beginSwitch(st, "controller-missing");
                }
                return;
            }

            if (now - (st.spawnedAt || 0) < RUNTIME.spawnControllerGraceMs) return;
            if (now < (st.postAckGraceUntil || 0)) return;

            const livePos = normalizeLivePos(st.livePos, st.ped.position);
            const nearestInside = this.getNearestInsidePlayerToPos(livePos, insidePlayers);

            let target = findPlayerByRid(st.targetRid);
            const shouldRefreshTarget = (
                !target
                || !mp.players.exists(target)
                || !this.isPlayerInsideZone(target)
                || (nearestInside && target.id !== nearestInside.id)
            );

            if (shouldRefreshTarget) {
                target = nearestInside || null;
                st.targetRid = target ? target.id : null;
                try {
                    st.ped.setVariable("npcazTargetRid", st.targetRid == null ? -1 : st.targetRid);
                } catch (e) {}
            }

            if (!target) {
                clearTask(st);
                try {
                    st.ped.setVariable("npcazAimActive", false);
                    st.ped.setVariable("npcazVisualMode", "idle");
                } catch (e) {}
                setNpcState(st, NPCAZ_STATE.IDLE, (msg) => this.log(msg), "no-target");
                return;
            }

            if (st.role === "guard" && st.forceFire) {
                this.applyNpcFireDamage(st, target, now);
            }

            const distToTarget = dist3(livePos, target.position);
            const shouldMoveToTarget = st.role === "leader"
                ? distToTarget > 1.5
                : distToTarget > 7.0;

            const livePosAgeMs = st.livePosUpdatedAt ? now - st.livePosUpdatedAt : -1;
            const isLivePosFresh = livePosAgeMs >= 0 && livePosAgeMs <= RUNTIME.livePosFreshMs;

            if (!st.lastDebugAt || now - st.lastDebugAt >= 1000) {
                st.lastDebugAt = now;
                const currentCmd = st.ped.getVariable ? st.ped.getVariable("npcazCommand") : null;
                const ctrlState = st.ped.getVariable ? st.ped.getVariable("npcazCtrlState") : null;

                this.log(
                    `debug nid=${st.nid} role=${st.role} targetRid=${target.id} `
                    + `dist=${distToTarget.toFixed(2)} shouldMoveToTarget=${shouldMoveToTarget} `
                    + `task=${st.lastTaskType || "none"} cmd=${currentCmd || "none"} `
                    + `ctrlState=${ctrlState || "n/a"} switching=${!!st.switching} `
                    + `livePosAgeMs=${livePosAgeMs} livePosFresh=${isLivePosFresh}`
                );

                if (!isLivePosFresh) {
                    this.log(
                        `debug stale livePos nid=${st.nid} livePosAgeMs=${livePosAgeMs} `
                        + `controllerRid=${st.controllerRid} lastHeartbeatAt=${st.lastHeartbeatAt || 0}`
                    );
                }
            }

            const betterController = this.chooseController(this.zone, st.ped, st.targetRid, livePos);
            if (betterController && st.controllerRid !== betterController.id && !st.switching) {
                const currentController = findPlayerByRid(st.controllerRid);
                const currentDist = currentController && mp.players.exists(currentController)
                    ? dist3(currentController.position, livePos)
                    : Infinity;
                const betterDist = dist3(betterController.position, livePos);

                const improvement = currentDist - betterDist;
                if (!Number.isFinite(currentDist) || improvement >= RUNTIME.controllerSwitchHysteresis) {
                    this.log(
                        `controller switch nid=${st.nid} ${st.controllerRid} -> ${betterController.id} `
                        + `currentDist=${Number.isFinite(currentDist) ? currentDist.toFixed(2) : "inf"} `
                        + `betterDist=${betterDist.toFixed(2)} improvement=${improvement.toFixed(2)}`
                    );
                    this.controllerManager.beginSwitch(st, "better-controller");
                    return;
                }
            }

            if (st.role === "leader") {
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
                    player.setVariable("npcattakzone:inside", inside);
                    player.call("npcattakzone.debug.state", [inside]);

                    if (inside) {
                        this.log(`player ${player.name} (${player.id}) entered zone`);
                        this.debugMessage(player, "Сервер: игрок вошел в зону");
                    } else {
                        this.passDialogsBlockedUntil.delete(player.id);
                        this.log(`player ${player.name} (${player.id}) left zone`);
                        this.debugMessage(player, "Сервер: игрок вышел из зоны");
                    }
                }
            });
        }, RUNTIME.zoneScanMs);
    },

    async loadZoneFromDb() {
        const Model = db && db.Models ? db.Models.NpcAttakZone : null;
        if (!Model) {
            this.log("model NpcAttakZone not found");
            return;
        }

        const row = await Model.findOne({ order: [["id", "ASC"]] }).catch(() => null);
        if (!row) {
            this.zone = this.getDefaultZone();
            return;
        }

        const data = row.get ? row.get({ plain: true }) : row;
        let points = [];
        try { points = JSON.parse(data.points || "[]"); } catch (e) {}

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
            player.call("npcattakzone.zone.sync", [zone]);
        });
    },

    onControllerAck(player, nid, ver) {
        const st = this.npcs.get(parseInt(nid));
        if (!st) return;
        const ok = this.controllerManager.onControllerAck(st, player.id, parseInt(ver));
        if (ok) this.forceWeaponSync(st);
    },

    onHeartbeat(player, nid, posJson = null) {
        const st = this.npcs.get(parseInt(nid));
        if (!st) return;

        this.controllerManager.onHeartbeat(st, player.id);

        if (Number(st.controllerRid) !== Number(player.id)) {
            this.log(
                `heartbeat ignored nid=${st.nid} playerId=${player.id} controllerRid=${st.controllerRid} reason=not-controller`
            );
            return;
        }

        const hasPosJson = posJson !== null && posJson !== undefined && posJson !== "";
        let payloadParsed = false;
        let pos = null;

        if (hasPosJson) {
            try {
                pos = typeof posJson === "string" ? JSON.parse(posJson) : posJson;
                payloadParsed = !!(pos && typeof pos === "object");
            } catch (e) {
                payloadParsed = false;
            }
        }

        const oldLivePos = st.livePos
            ? {
                x: Number(st.livePos.x) || 0,
                y: Number(st.livePos.y) || 0,
                z: Number(st.livePos.z) || 0,
            }
            : null;

        let newLivePos = oldLivePos;
        let deltaDist = -1;

        if (payloadParsed) {
            newLivePos = {
                x: Number(pos.x) || 0,
                y: Number(pos.y) || 0,
                z: Number(pos.z) || 0,
            };

            deltaDist = oldLivePos ? dist3(oldLivePos, newLivePos) : 0;
            st.livePos = newLivePos;
            st.liveHeading = Number(pos.heading) || st.liveHeading || 0;
            st.livePosUpdatedAt = Date.now();

            try {
                if (st.ped && mp.peds.exists(st.ped)) {
                    st.ped.setVariable("npcazLivePos", newLivePos);
                    st.ped.setVariable("npcazLiveHeading", st.liveHeading);
                }
            } catch (e) {}
        }

        this.log(
            `heartbeat nid=${st.nid} playerId=${player.id} controllerRid=${st.controllerRid} `
            + `hasPosJson=${hasPosJson} payloadParsed=${payloadParsed} `
            + `oldLivePos=${oldLivePos ? `${oldLivePos.x.toFixed(3)},${oldLivePos.y.toFixed(3)},${oldLivePos.z.toFixed(3)}` : "null"} `
            + `newLivePos=${newLivePos ? `${newLivePos.x.toFixed(3)},${newLivePos.y.toFixed(3)},${newLivePos.z.toFixed(3)}` : "null"} `
            + `deltaDist=${deltaDist >= 0 ? deltaDist.toFixed(3) : "n/a"}`
        );
    },

    onPlayerQuit(player) {
        this.playerStates.delete(player.id);
        this.passDialogs.delete(player.id);
        this.passDialogsBlockedUntil.delete(player.id);

        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st) return;

            if (st.controllerRid === player.id) {
                this.controllerManager.beginSwitch(st, "controller-quit");
            }

            if (st.targetRid === player.id) {
                st.targetRid = null;
                try {
                    if (st.ped && mp.peds.exists(st.ped)) {
                        st.ped.setVariable("npcazTargetRid", -1);
                    }
                } catch (e) {}
            }
        });
    },

    setGuardsFire(targetRid, fireState) {
        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st || st.role !== "guard" || !st.ped || !mp.peds.exists(st.ped)) return;
            if (Number(st.targetRid) !== Number(targetRid)) return;
            st.forceFire = !!fireState;
            try { st.ped.setVariable("npcazForceFire", !!fireState); } catch (e) {}
        });
    },

    applyNpcFireDamage(st, target, now) {
        if (!st || !target || !mp.players.exists(target)) return;
        if (now - (st.lastFireDamageAt || 0) < 1000) return;
        st.lastFireDamageAt = now;

        const weaponHash = mp.joaat(DEFAULT_WEAPON);
        let damageValue = 18;
        try {
            if (damageSystem && typeof damageSystem.findDamageValue === "function") {
                const foundDamage = damageSystem.findDamageValue(weaponHash);
                if (typeof foundDamage === "number" && foundDamage > 0) damageValue = foundDamage;
            }
        } catch (e) {}
        damageValue = Math.max(6, Math.round(damageValue * 0.55));

        const damaged = { armour: target.armour, health: target.health };
        try {
            if (damageSystem && typeof damageSystem.damagePlayer === "function") damageSystem.damagePlayer(damaged, damageValue);
            else damaged.health -= damageValue;
        } catch (e) {
            damaged.health -= damageValue;
        }

        target.armour = Math.clamp(damaged.armour, 0, 100);
        target.health = Math.clamp(damaged.health, 0, 100);

        if (target.health <= 0) {
            if (!target.isCustomDeath) {
                target.isCustomDeath = true;
                const killer = st.ped && st.ped.controller && mp.players.exists(st.ped.controller) ? st.ped.controller : null;
                mp.events.call("customDeath", target, weaponHash, killer);
            }
            this.putGuardsToSleep(target.id);
        }
    },

    putGuardsToSleep(targetRid) {
        this.zoneNpcIds.forEach((nid) => {
            const st = this.npcs.get(nid);
            if (!st || st.role !== "guard" || !st.ped || !mp.peds.exists(st.ped)) return;
            if (Number(st.targetRid) !== Number(targetRid)) return;

            st.forceFire = false;
            st.targetRid = null;
            st.lastIssuedCommand = null;
            st.lastIssuedPayload = null;
            clearTask(st);

            try {
                st.ped.setVariable("npcazForceFire", false);
                st.ped.setVariable("npcazTargetRid", -1);
                st.ped.setVariable("npcazAimActive", false);
                st.ped.setVariable("npcazVisualMode", "idle");
                st.ped.setVariable("npcazCommand", "idle");
                st.ped.setVariable("npcazCommandExtra", null);
            } catch (e) {}

            setNpcState(st, NPCAZ_STATE.IDLE, (msg) => this.log(msg), "guards-sleep");
        });
    },

    hasPassItem(player) {
        if (!player || !mp.players.exists(player) || !inventory) return false;
        try {
            return !!inventory.getItemByItemId(player, 500);
        } catch (e) {
            return false;
        }
    },

    onPassReady(controller, nid, targetRid) {
        const st = this.npcs.get(parseInt(nid));
        if (!st || st.role !== "leader") return;
        if (Number(st.controllerRid) !== Number(controller.id)) return;

        const target = findPlayerByRid(targetRid);
        if (!target || !mp.players.exists(target) || !this.isPlayerInsideZone(target)) return;
        if (Number(st.targetRid) !== Number(target.id)) return;
        const blockedUntil = Number(this.passDialogsBlockedUntil.get(target.id) || 0);
        if (Date.now() < blockedUntil) return;

        const active = this.passDialogs.get(target.id);
        const now = Date.now();
        if (active && now - active.at < 2500) return;

        this.passDialogs.set(target.id, { nid: st.nid, targetRid: target.id, at: now });
        target.call("npcattakzone.pass.show");
    },

    onPassAnswer(player, answer) {
        const req = this.passDialogs.get(player.id);
        if (!req) return;
        this.passDialogs.delete(player.id);

        const approved = Number(answer) === 1;
        if (!approved) {
            this.passDialogsBlockedUntil.set(req.targetRid, Date.now() + 120000);
            this.setGuardsFire(req.targetRid, true);
            notifs.error(player, "Вы отказались показывать пропуск", "NpcAttakZone");
            return;
        }

        if (this.hasPassItem(player)) {
            this.passDialogsBlockedUntil.delete(req.targetRid);
            this.setGuardsFire(req.targetRid, false);
            notifs.success(player, "Пропуск подтвержден", "NpcAttakZone");
        } else {
            this.passDialogsBlockedUntil.set(req.targetRid, Date.now() + 120000);
            this.setGuardsFire(req.targetRid, true);
            notifs.error(player, "Пропуск не найден (нужен предмет #500)", "NpcAttakZone");
        }
    },
};

module.exports.controllerManager = createNpcControllerManager({
    chooseController: (zone, ped, preferredRid, livePos, blockedControllerRid) =>
        module.exports.chooseController(zone, ped, preferredRid, livePos, blockedControllerRid),
    getZone: (zoneId) => module.exports.getZoneById(zoneId),
    logger: (msg) => module.exports.log(msg),
    timers: {
        controllerTimeoutMs: RUNTIME.controllerTimeoutMs,
        switchCooldownMs: RUNTIME.switchCooldownMs,
        postAckGraceMs: RUNTIME.postAckGraceMs,
    },
    restoreTask: (st) => {
        module.exports.forceWeaponSync(st);
        return restoreTask(st, {
            guardEngage: (npc, data) => module.exports.setTaskGuardEngage(npc, data.rid),
            leaderFrisk: (npc, data) => module.exports.setTaskLeaderFrisk(npc, data.rid),
        });
    },
});
