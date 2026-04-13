"use strict";

const { GuardNpc } = require("./guardNpc");
const { GuardControllerManager } = require("./guardControllerManager");
const { GuardTaskMemory } = require("./guardTaskMemory");

const POST_STATE = {
    IDLE: "idle",
    WARNING: "warning",
    CHECKING: "checking",
    ATTACK: "attack",
    RETURN: "return",
};

function dist3(a, b) {
    const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function inSphere(pos, sphere) {
    return dist3(pos, sphere.center) <= Number(sphere.radius || 0);
}

function isPointInsidePolygon2D(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = Number(polygon[i].x) || 0;
        const yi = Number(polygon[i].y) || 0;
        const xj = Number(polygon[j].x) || 0;
        const yj = Number(polygon[j].y) || 0;
        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.000001) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isInsideZone(pos, zone) {
    if (!zone) return false;
    const zoneType = String(zone.type || "sphere");
    if (zoneType === "polygon") {
        const points = Array.isArray(zone.points) ? zone.points : [];
        if (points.length < 3) return false;
        const minZ = Number.isFinite(Number(zone.minZ)) ? Number(zone.minZ) : -10000;
        const maxZ = Number.isFinite(Number(zone.maxZ)) ? Number(zone.maxZ) : 10000;
        if (pos.z < minZ || pos.z > maxZ) return false;
        return isPointInsidePolygon2D({ x: pos.x, y: pos.y }, points);
    }
    return inSphere(pos, zone);
}

function isInsideZoneWithTolerance(pos, zone, tolerance = 0.6) {
    if (!zone) return false;
    if (String(zone.type || "sphere") === "sphere") {
        return isInsideZone(pos, { ...zone, radius: Number(zone.radius || 0) + Number(tolerance || 0) });
    }
    return isInsideZone(pos, zone);
}

function zoneCenter(zone) {
    if (!zone) return { x: 0, y: 0, z: 0 };
    const zoneType = String(zone.type || "sphere");
    if (zoneType !== "polygon") return zone.center;
    const points = Array.isArray(zone.points) ? zone.points : [];
    if (!points.length) return { x: 0, y: 0, z: 0 };
    const sum = points.reduce((acc, p) => ({ x: acc.x + (Number(p.x) || 0), y: acc.y + (Number(p.y) || 0), z: acc.z + (Number(p.z) || 0) }), { x: 0, y: 0, z: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function isValidPlayer(player) {
    return !!(player && mp.players.exists(player) && player.character);
}

function getPlayerById(playerId) {
    let found = null;
    mp.players.forEach((player) => {
        if (found || !isValidPlayer(player)) return;
        if (player.id === playerId) found = player;
    });
    return found;
}

class CheckpointGuardController {
    constructor(config) {
        this.config = config;
        this.posts = new Map();
        this.playerAggressiveUntil = new Map();
        this.playerClearUntil = new Map();
        this.tickTimer = null;
        this.isInitialized = false;
        this.notifs = call("notifications");
        this.taskMemory = new GuardTaskMemory();
        this.controllerManager = new GuardControllerManager(config, {
            getPlayerById,
            getPostCenter: (post) => zoneCenter(this.getPostZone(post)),
        });

        this.log = (msg) => {
            if (!this.config.debug) return;
            console.log(`[GUARD-CHECKPOINT] ${msg}`);
        };
    }

    async initialize() { if (this.isInitialized) return; this.initPosts(); this.isInitialized = true; }
    initPosts() {
        this.posts.clear();
        for (const rawPost of this.config.posts || []) this.posts.set(rawPost.id, this.createPostRuntime(rawPost));
    }

    createPostRuntime(rawPost) {
        const mergedPost = {
            ...rawPost,
            npcStreamDistance: Number(rawPost.npcStreamDistance || this.config.npcStreamDistance || 220),
            spawnGraceMs: Number(rawPost.spawnGraceMs || this.config.spawnGraceMs || 3500),
            npcHealth: Number(rawPost.npcHealth || this.config.npcHealth || 250),
            npcArmor: Number(rawPost.npcArmor || this.config.npcArmor || 0),
            debugSync: !!(rawPost.debugSync || this.config.debugSync),
        };
        const leader = new GuardNpc(mergedPost, mergedPost.leader, "leader", this.log, this.config.defaultRespawnMs);
        const guards = (mergedPost.guards || []).map((g) => new GuardNpc(mergedPost, g, "guard", this.log, this.config.defaultRespawnMs));

        return {
            id: mergedPost.id,
            cfg: mergedPost,
            leader,
            guards,
            state: POST_STATE.IDLE,
            stateSince: Date.now(),
            warningIssuedAt: 0,
            checkingGraceUntil: 0,
            targetPlayerId: null,
            targetLockUntil: 0,
            targetStopStaySince: 0,
            targetOutsidePursuitSince: 0,
            streamOwnerId: null,
            playerSeenAt: new Map(),
            ctrlVer: 1,
            stateVersion: 1,
            lastControllerSwitchAt: 0,
            lastStateSyncAt: 0,
            lastPoseSyncAt: 0,
        };
    }

    start() { if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), this.config.tickMs || 300); }
    stop() { if (this.tickTimer) clearInterval(this.tickTimer); this.tickTimer = null; }
    shutdown() { this.stop(); for (const post of this.posts.values()) { post.leader.shutdown(); for (const g of post.guards) g.shutdown(); } this.posts.clear(); }
    onPlayerQuit(player) { if (!player) return; this.clearPlayerAggression(player.id); this.resetPostsByPlayer(player.id); }
    onPlayerDeath(player) { if (!player) return; this.clearPlayerAggression(player.id); this.resetPostsByPlayer(player.id); }
    onPlayerWeaponChange() {}
    onPlayerDamage(player, attacker) { if (isValidPlayer(player) && attacker && mp.players.exists(attacker)) this.markAggressive(attacker.id); }
    onControllerAck() {}

    markAggressive(playerId) { this.playerAggressiveUntil.set(playerId, Date.now() + (this.config.aggressiveMemoryMs || 12000)); }
    clearPlayerAggression(playerId) { this.playerAggressiveUntil.delete(playerId); }
    isPlayerAggressive(playerId) {
        const until = Number(this.playerAggressiveUntil.get(playerId)) || 0;
        if (!until || Date.now() > until) { this.playerAggressiveUntil.delete(playerId); return false; }
        return true;
    }
    markPlayerCleared(playerId, durationMs = 20000) { this.playerClearUntil.set(playerId, Date.now() + durationMs); }
    isPlayerCleared(playerId) {
        const until = Number(this.playerClearUntil.get(playerId)) || 0;
        if (!until || Date.now() > until) { this.playerClearUntil.delete(playerId); return false; }
        return true;
    }

    tick() {
        const now = Date.now();
        for (const post of this.posts.values()) this.tickPost(post, now);
    }

    tickPost(post, now) {
        post.leader.syncDeathIfNeeded(now);
        for (const guard of post.guards) guard.syncDeathIfNeeded(now);

        const inside = this.collectPlayersInPost(post, now);
        this.updateStreamOwner(post, inside, now);

        const target = this.resolveLockedTarget(post, inside, now);
        this.processState(post, target, now);

        this.applyStateToNpcs(post);
        this.publishState(post, now);
        this.publishAuthoritativePose(post, now);
    }

    collectPlayersInPost(post, now) {
        const inside = [];
        mp.players.forEach((player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
            if (!isInsideZone(player.position, this.getPostZone(post))) return;
            if (!post.playerSeenAt.has(player.id)) post.playerSeenAt.set(player.id, now);
            inside.push(player);
        });
        for (const pid of Array.from(post.playerSeenAt.keys())) {
            if (!inside.some((p) => p.id === pid)) post.playerSeenAt.delete(pid);
        }
        return inside;
    }

    resolveLockedTarget(post, insidePlayers, now) {
        const current = getPlayerById(post.targetPlayerId);
        const currentValid = current && insidePlayers.some((p) => p.id === current.id) && !current.isDead();
        if (currentValid && now < Number(post.targetLockUntil || 0)) return current;
        if (currentValid && (post.state === POST_STATE.CHECKING || post.state === POST_STATE.WARNING || post.state === POST_STATE.ATTACK)) return current;

        const center = zoneCenter(this.getPostZone(post));
        let candidate = null;
        let bestScore = -Infinity;
        for (const p of insidePlayers) {
            const score = 100 - dist3(p.position, center) + (this.isPlayerAggressive(p.id) ? 15 : 0);
            if (score > bestScore) { bestScore = score; candidate = p; }
        }

        if ((currentValid && candidate && candidate.id !== current.id) || (!currentValid && candidate)) {
            post.targetPlayerId = candidate.id;
            post.targetLockUntil = now + 3000;
            post.stateVersion += 1;
        } else if (!candidate) {
            post.targetPlayerId = null;
        }
        return candidate;
    }

    processState(post, target, now) {
        if (!target) {
            if (post.state !== POST_STATE.IDLE && post.state !== POST_STATE.RETURN) this.transition(post, POST_STATE.RETURN, "no-target", now);
            return;
        }

        if (post.state === POST_STATE.IDLE) {
            const dist = dist3(target.position, zoneCenter(this.getPostZone(post)));
            if (!this.isPlayerCleared(target.id) && dist <= Number(post.cfg.warnDistance || this.config.defaultWarnDistance)) {
                this.transition(post, POST_STATE.WARNING, "warn-distance", now);
            }
            return;
        }

        if (post.state === POST_STATE.WARNING) {
            if (this.shouldTriggerAttack(post, target)) return this.transition(post, POST_STATE.ATTACK, "warning-violation", now);
            if (isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) {
                post.targetStopStaySince = now;
                return this.transition(post, POST_STATE.CHECKING, "entered-stop-zone", now);
            }
            const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
            if (now - post.warningIssuedAt > warningResponseMs) return this.transition(post, POST_STATE.ATTACK, "warning-timeout", now);
            return;
        }

        if (post.state === POST_STATE.CHECKING) {
            if (this.shouldTriggerAttack(post, target)) return this.transition(post, POST_STATE.ATTACK, "checking-violation", now);
            if (!isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) return this.transition(post, POST_STATE.ATTACK, "left-stop-zone", now);
            if (now < post.checkingGraceUntil) return;
            const checkDurationMs = Number(post.cfg.checkDurationMs || this.config.defaultCheckDurationMs || 5000);
            if (now - post.targetStopStaySince >= checkDurationMs) {
                this.markPlayerCleared(target.id, 20000);
                this.sendStatusText(post, "Все отлично, можете проезжать", 3000, target);
                this.sendWarningStop(target, post.id);
                return this.transition(post, POST_STATE.RETURN, "check-success", now);
            }
            return;
        }

        if (post.state === POST_STATE.ATTACK) {
            const pursuitZone = this.getPursuitZone(post);
            if (!isInsideZone(target.position, pursuitZone)) {
                if (!post.targetOutsidePursuitSince) post.targetOutsidePursuitSince = now;
                if (now - post.targetOutsidePursuitSince > 2000) return this.transition(post, POST_STATE.RETURN, "left-pursuit", now);
            } else post.targetOutsidePursuitSince = 0;
            return;
        }

        if (post.state === POST_STATE.RETURN) {
            const arrived = [post.leader, ...post.guards].every((u) => u.exists() && dist3(u.ped.position, u.spawnPos) <= 2.0);
            if (arrived || now - post.stateSince > 6000) {
                post.targetPlayerId = null;
                post.targetLockUntil = 0;
                return this.transition(post, POST_STATE.IDLE, "returned", now);
            }
        }
    }

    shouldTriggerAttack(post, target) {
        if (!target) return false;
        if (this.isPlayerAggressive(target.id)) return true;
        if (this.isPlayerCleared(target.id)) return false;
        return !!(post.cfg.violationZone && isInsideZone(target.position, post.cfg.violationZone));
    }

    transition(post, nextState, reason, now) {
        if (post.state === nextState) return;
        const prev = post.state;
        post.state = nextState;
        post.stateSince = now;
        post.stateVersion += 1;

        if (nextState === POST_STATE.WARNING) {
            post.warningIssuedAt = now;
            this.sendWarningStart(getPlayerById(post.targetPlayerId), post);
        }
        if (nextState === POST_STATE.CHECKING) {
            post.checkingGraceUntil = now + 1100;
            this.sendStatusText(post, "Идет досмотр, оставайтесь в зоне проверки (5 секунд)", 5000, getPlayerById(post.targetPlayerId));
        }
        if (nextState === POST_STATE.ATTACK) {
            this.sendStatusText(post, "Нарушение! Охрана открывает огонь", 2500, getPlayerById(post.targetPlayerId));
        }
        if (nextState === POST_STATE.IDLE || nextState === POST_STATE.RETURN) this.sendWarningStop(getPlayerById(post.targetPlayerId), post.id);

        this.log(`post=${post.id} ${prev} -> ${nextState} (${reason})`);
    }

    applyStateToNpcs(post) {
        const target = getPlayerById(post.targetPlayerId);
        const all = [post.leader, ...post.guards];
        for (const unit of all) {
            if (!unit.exists()) continue;
            const ped = unit.ped;
            try { ped.setVariable("guardState", post.state); } catch {}
            try { ped.setVariable("guardTarget", target ? target.id : -1); } catch {}
            try { ped.setVariable("guardTargetId", target ? target.id : -1); } catch {}
            try { ped.setVariable("guardStateVersion", Number(post.stateVersion) || 0); } catch {}
            try { ped.setVariable("ctrlVer", Number(post.ctrlVer) || 0); } catch {}
            try { ped.setVariable("guardReturnX", Number(unit.spawnPos.x) || 0); } catch {}
            try { ped.setVariable("guardReturnY", Number(unit.spawnPos.y) || 0); } catch {}
            try { ped.setVariable("guardReturnZ", Number(unit.spawnPos.z) || 0); } catch {}
            try { ped.setVariable("guardReturnHeading", Number(unit.spawnHeading) || 0); } catch {}
            try { ped.setVariable("guardWeaponHash", Number(unit.weaponHash) || 0); } catch {}
        }

        this.taskMemory.write(post.id, {
            state: post.state,
            targetPlayerId: post.targetPlayerId,
            stateVersion: post.stateVersion,
            ctrlVer: post.ctrlVer,
        });
    }

    publishState(post, now) {
        if (now - (post.lastStateSyncAt || 0) < 120) return;
        post.lastStateSyncAt = now;
        const payload = [post.id, post.state, Number(post.targetPlayerId ?? -1), Number(post.stateVersion || 0), Number(post.ctrlVer || 0), Number(post.streamOwnerId ?? -1)];
        this.forEachPlayersInPost(post, (player) => player.call("guardCheckpoint:stateSync", payload));
    }

    publishAuthoritativePose(post, now) {
        if (now - (post.lastPoseSyncAt || 0) < 150) return;
        post.lastPoseSyncAt = now;
        for (const unit of [post.leader, ...post.guards]) {
            if (!unit || !unit.exists()) continue;
            const ped = unit.ped;
            const pos = ped.position;
            try { ped.setVariable("guardPoseX", Number(pos.x) || 0); } catch {}
            try { ped.setVariable("guardPoseY", Number(pos.y) || 0); } catch {}
            try { ped.setVariable("guardPoseZ", Number(pos.z) || 0); } catch {}
            try { ped.setVariable("guardPoseHeading", Number(ped.getHeading ? ped.getHeading() : unit.spawnHeading) || 0); } catch {}
            try { ped.setVariable("guardPoseUpdatedAt", now); } catch {}
        }
    }

    updateStreamOwner(post, insidePlayers, now) {
        const nextOwner = this.controllerManager.pickController(post, insidePlayers, now);
        if (post.streamOwnerId === nextOwner) return;

        post.streamOwnerId = nextOwner;
        post.lastControllerSwitchAt = now;
        post.ctrlVer += 1;
        post.stateVersion += 1;

        const owner = getPlayerById(nextOwner);
        [post.leader, ...post.guards].forEach((unit) => {
            if (!unit.exists()) return;
            try { unit.ped.setVariable("streamOwnerId", nextOwner == null ? -1 : nextOwner); } catch {}
            try { unit.ped.setVariable("ctrlVer", Number(post.ctrlVer) || 0); } catch {}
            if (owner) {
                try { unit.ped.controller = owner; } catch {}
            }
        });

        if (owner) owner.call("guardCheckpoint:controller:switch", [post.id, post.ctrlVer, post.stateVersion, post.state]);
    }

    sendWarningStart(player, post) {
        if (!isValidPlayer(player)) return;
        const ui = post.cfg.warningUi || {};
        player.call("guardCheckpoint:warning:start", [{ postId: post.id, text: ui.text || "Охрана требует остановиться", soundName: ui.soundName || "5s", soundSet: ui.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET", stopZone: post.cfg.stopZone || null }]);
        this.sendStatusText(post, `Стой! Встаньте в зону досмотра за ${Math.max(1, Math.round((Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000)) / 1000))} секунд`, Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000), player);
    }
    sendWarningStop(player, postId) { if (isValidPlayer(player)) player.call("guardCheckpoint:warning:stop", [postId]); }
    sendStatusText(post, text, durationMs = 3000, player = null) {
        if (isValidPlayer(player)) return player.call("guardCheckpoint:status:text", [post.id, text, durationMs]);
        this.forEachPlayersInPost(post, (rec) => rec.call("guardCheckpoint:status:text", [post.id, text, durationMs]));
    }

    resetPostsByPlayer(playerId) {
        const now = Date.now();
        for (const post of this.posts.values()) {
            if (post.targetPlayerId !== playerId) continue;
            post.targetPlayerId = null;
            post.targetLockUntil = 0;
            this.transition(post, POST_STATE.RETURN, "target-disconnected", now);
        }
    }

    getPostZone(post) { return post.cfg.postZone || post.cfg.guardZone; }
    getPursuitZone(post) { return post.cfg.pursuitZone || post.cfg.guardZone; }
    forEachPlayersInPost(post, cb) { this.collectPlayersInPost(post, Date.now()).forEach(cb); }
    getPost(postId) { return this.posts.get(String(postId)); }
    async createOrReplacePost(rawPost) {
        if (!rawPost || !rawPost.id) return null;
        const current = this.posts.get(rawPost.id);
        if (current) {
            current.leader.shutdown();
            for (const g of current.guards || []) g.shutdown();
        }
        const post = this.createPostRuntime(rawPost);
        this.posts.set(post.id, post);
        return post;
    }
    async updateZone(postId, zoneKey, zoneData) {
        const post = this.getPost(postId);
        if (!post) return false;
        post.cfg[zoneKey] = zoneData;
        return true;
    }
    async updateLeader(postId, npcData) {
        const post = this.getPost(postId);
        if (!post) return false;
        post.cfg.leader = npcData;
        return !!(await this.createOrReplacePost(post.cfg));
    }
    async addGuard(postId, npcData) {
        const post = this.getPost(postId);
        if (!post) return false;
        post.cfg.guards = Array.isArray(post.cfg.guards) ? post.cfg.guards : [];
        post.cfg.guards.push(npcData);
        return !!(await this.createOrReplacePost(post.cfg));
    }
    async reloadFromDb() { return true; }
}

module.exports = { CheckpointGuardController, POST_STATE };
