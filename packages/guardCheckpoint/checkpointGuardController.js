"use strict";

const { GuardNpc } = require("./guardNpc");

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
        const extended = {
            ...zone,
            radius: Number(zone.radius || 0) + Number(tolerance || 0),
        };
        return isInsideZone(pos, extended);
    }
    return isInsideZone(pos, zone);
}

function zoneCenter(zone) {
    if (!zone) return { x: 0, y: 0, z: 0 };
    const zoneType = String(zone.type || "sphere");
    if (zoneType !== "polygon") return zone.center;
    const points = Array.isArray(zone.points) ? zone.points : [];
    if (!points.length) return { x: 0, y: 0, z: 0 };
    const sum = points.reduce((acc, p) => {
        acc.x += Number(p.x) || 0;
        acc.y += Number(p.y) || 0;
        acc.z += Number(p.z) || 0;
        return acc;
    }, { x: 0, y: 0, z: 0 });
    return {
        x: sum.x / points.length,
        y: sum.y / points.length,
        z: sum.z / points.length,
    };
}

function isValidPlayer(player) {
    return !!(player && mp.players.exists(player) && player.character);
}

function getPlayerById(playerId) {
    let found = null;
    mp.players.forEach((player) => {
        if (found) return;
        if (!isValidPlayer(player)) return;
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

        this.log = (msg) => {
            if (!this.config.debug) return;
            console.log(`[GUARD-CHECKPOINT] ${msg}`);
        };

    }

    async initialize() {
        if (this.isInitialized) return;
        await this.ensureDbSchema();
        const loaded = await this.loadPostsFromDb();
        if (!loaded) {
            this.initPosts();
            for (const post of this.posts.values()) {
                await this.savePostToDb(post.id);
            }
        }
        this.isInitialized = true;
    }

    initPosts() {
        this.posts.clear();
        for (const rawPost of this.config.posts || []) {
            const post = this.createPostRuntime(rawPost);
            this.posts.set(post.id, post);
            this.log(`post initialized id=${post.id}`);
        }
    }

    getDb() {
        try {
            if (typeof global !== "undefined" && global.db && global.db.sequelize) return global.db.sequelize;
        } catch {}
        return null;
    }

    async ensureDbSchema() {
        const sequelize = this.getDb();
        if (!sequelize) return;
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS guard_checkpoint_posts (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NULL,
                dimension INT NOT NULL DEFAULT 0,
                data LONGTEXT NOT NULL,
                updatedAt BIGINT NULL
            )
        `);
    }

    async loadPostsFromDb() {
        const sequelize = this.getDb();
        if (!sequelize) return false;
        const [rows] = await sequelize.query("SELECT id, data FROM guard_checkpoint_posts");
        if (!rows || !rows.length) return false;

        for (const existing of this.posts.values()) {
            if (existing.leader) existing.leader.shutdown();
            for (const guard of existing.guards || []) guard.shutdown();
        }
        this.posts.clear();
        for (const row of rows) {
            try {
                const rawPost = JSON.parse(String(row.data || "{}"));
                if (!rawPost || !rawPost.id) continue;
                const post = this.createPostRuntime(rawPost);
                this.posts.set(post.id, post);
            } catch (e) {
                this.log(`db parse failed post=${row.id}: ${e.message}`);
            }
        }

        this.log(`loaded posts from DB count=${this.posts.size}`);
        return this.posts.size > 0;
    }

    async savePostToDb(postId) {
        const post = this.posts.get(postId);
        if (!post) return false;
        const sequelize = this.getDb();
        if (!sequelize) return false;

        const data = JSON.stringify(post.cfg);
        await sequelize.query(
            `INSERT INTO guard_checkpoint_posts (id, name, dimension, data, updatedAt)
             VALUES (:id, :name, :dimension, :data, :updatedAt)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                dimension = VALUES(dimension),
                data = VALUES(data),
                updatedAt = VALUES(updatedAt)`,
            {
                replacements: {
                    id: post.cfg.id,
                    name: post.cfg.name || post.cfg.id,
                    dimension: Number(post.cfg.dimension) || 0,
                    data,
                    updatedAt: Date.now(),
                },
            }
        );
        return true;
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
            stateCooldownUntil: 0,
            warningIssuedAt: 0,
            checkStartedAt: 0,
            targetPlayerId: null,
            targetPlayerLastPos: null,
            targetStopStaySince: 0,
            lastTargetDebugAt: 0,
            warningStartDistToLeader: 0,
            warningStartClosestGuardDist: 0,
            warningPrevDistToStopZone: Number.MAX_SAFE_INTEGER,
            attackStartedAt: 0,
            targetOutsidePursuitSince: 0,
            streamOwnerId: null,
            playerSeenAt: new Map(),
            checkingGraceUntil: 0,
            lastClientCommandKey: "",
            lastClientCommandAt: 0,
        };
    }

    start() {
        if (this.tickTimer) return;
        this.log(`controller start, posts=${this.posts.size}`);
        this.tickTimer = setInterval(() => this.tick(), this.config.tickMs || 300);
    }

    stop() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }

    shutdown() {
        this.log("controller shutdown start");
        this.stop();

        for (const post of this.posts.values()) {
            if (post.leader && typeof post.leader.shutdown === "function") {
                post.leader.shutdown();
            }
            for (const guard of post.guards || []) {
                if (guard && typeof guard.shutdown === "function") {
                    guard.shutdown();
                }
            }
        }

        this.posts.clear();
        this.playerAggressiveUntil.clear();
        this.log("controller shutdown complete");
    }

    onPlayerQuit(player) {
        if (!player) return;
        this.clearPlayerAggression(player.id);
        this.resetPostsByPlayer(player.id, "player-quit");
    }

    onPlayerDeath(player) {
        if (!player) return;
        this.clearPlayerAggression(player.id);
        this.resetPostsByPlayer(player.id, "player-death");
    }

    onPlayerWeaponChange(player, oldWeapon, newWeapon) {
        if (!isValidPlayer(player)) return;
        const weaponHash = Number(newWeapon) || 0;
        if (!weaponHash) return;
        this.log(`weapon raised player=${player.name}[${player.id}] weapon=${weaponHash} (no instant attack)`);
    }

    onPlayerDamage(player, attacker) {
        if (!isValidPlayer(player)) return;
        if (!attacker || !mp.players.exists(attacker)) return;
        this.markAggressive(attacker.id);
        this.log(`aggressive by damage attacker=${attacker.name}[${attacker.id}] target=${player.name}[${player.id}]`);
    }

    markAggressive(playerId) {
        this.playerAggressiveUntil.set(playerId, Date.now() + (this.config.aggressiveMemoryMs || 12000));
    }

    clearPlayerAggression(playerId) {
        this.playerAggressiveUntil.delete(playerId);
    }

    isPlayerAggressive(playerId) {
        const until = Number(this.playerAggressiveUntil.get(playerId)) || 0;
        if (!until) return false;
        if (Date.now() > until) {
            this.playerAggressiveUntil.delete(playerId);
            return false;
        }
        return true;
    }

    markPlayerCleared(playerId, durationMs = 20000) {
        this.playerClearUntil.set(playerId, Date.now() + durationMs);
    }

    isPlayerCleared(playerId) {
        const until = Number(this.playerClearUntil.get(playerId)) || 0;
        if (!until) return false;
        if (Date.now() > until) {
            this.playerClearUntil.delete(playerId);
            return false;
        }
        return true;
    }

    tick() {
        const now = Date.now();
        for (const post of this.posts.values()) {
            if (this.config.debugTick) this.log(`tick post=${post.id} state=${post.state}`);
            this.tickPost(post, now);
        }
    }

    tickPost(post, now) {
        post.leader.syncDeathIfNeeded(now);
        for (const guard of post.guards) guard.syncDeathIfNeeded(now);
        this.updateStreamOwner(post, now);

        const target = this.resolveTargetPlayer(post);
        const prevTargetPos = post.targetPlayerLastPos ? { ...post.targetPlayerLastPos } : null;
        if (target && now - (post.lastTargetDebugAt || 0) > 2000) {
            this.log(`post=${post.id} target=${target.name}[${target.id}] state=${post.state}`);
            post.lastTargetDebugAt = now;
        }

        if (!target && post.state !== POST_STATE.IDLE) {
            this.transition(post, POST_STATE.RETURN, "target-lost", now);
        }

        switch (post.state) {
            case POST_STATE.IDLE:
                this.handleIdle(post, target, now);
                break;
            case POST_STATE.WARNING:
                this.handleWarning(post, target, prevTargetPos, now);
                break;
            case POST_STATE.CHECKING:
                this.handleChecking(post, target, prevTargetPos, now);
                break;
            case POST_STATE.ATTACK:
                this.handleAttack(post, target, now);
                break;
            case POST_STATE.RETURN:
                this.handleReturn(post, now);
                break;
            default:
                this.transition(post, POST_STATE.IDLE, "unknown-state", now);
                break;
        }

        if (target) {
            post.targetPlayerLastPos = {
                x: target.position.x,
                y: target.position.y,
                z: target.position.z,
            };
        }
    }

    handleIdle(post, target, now) {
        if (!target) return;
        if (this.isPlayerCleared(target.id)) return;
        const dist = dist3(target.position, zoneCenter(this.getPostZone(post)));
        const warnDistance = Number(post.cfg.warnDistance || this.config.defaultWarnDistance);
        if (dist <= warnDistance) {
            post.targetPlayerId = target.id;
            this.log(`post=${post.id} warning trigger target=${target.name}[${target.id}] dist=${dist.toFixed(2)}`);
            this.transition(post, POST_STATE.WARNING, "player-in-warn-distance", now);
        }
    }

    handleWarning(post, target, prevTargetPos, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-warning", now);
            return;
        }

        if (!isInsideZone(target.position, this.getPostZone(post))) {
            this.transition(post, POST_STATE.RETURN, "left-post-zone-warning", now);
            return;
        }

        this.ensureLeaderWarningBehavior(post, target);

        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) {
            this.transition(post, POST_STATE.ATTACK, "warning-violation", now);
            return;
        }

        const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
        const elapsed = now - (post.warningIssuedAt || now);
        const distToStop = dist3(target.position, zoneCenter(post.cfg.stopZone));
        const prevDistToStop = Number(post.warningPrevDistToStopZone || distToStop);
        if (isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) {
            post.targetStopStaySince = now;
            this.log(`post=${post.id} target=${target.id} entered stopZone`);
            this.transition(post, POST_STATE.CHECKING, "entered-stop-zone", now);
            return;
        }

        if (elapsed > warningResponseMs) {
            this.transition(post, POST_STATE.ATTACK, "did-not-enter-stop-zone-in-time", now);
            return;
        }

        post.warningPrevDistToStopZone = distToStop;
    }

    handleChecking(post, target, prevTargetPos, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-checking", now);
            return;
        }

        if (!isInsideZone(target.position, this.getPostZone(post))) {
            this.transition(post, POST_STATE.RETURN, "left-post-zone-checking", now);
            return;
        }

        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) {
            this.transition(post, POST_STATE.ATTACK, "checking-violation", now);
            return;
        }

        if (!isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) {
            this.transition(post, POST_STATE.ATTACK, "left-stop-zone", now);
            return;
        }

        if (now < (post.checkingGraceUntil || 0)) return;

        const checkDurationMs = Number(post.cfg.checkDurationMs || this.config.defaultCheckDurationMs);
        const stayedMs = now - (post.targetStopStaySince || now);
        if (stayedMs >= checkDurationMs) {
            this.log(`post=${post.id} checking completed target=${target.id}`);
            this.markPlayerCleared(target.id, 20000);
            this.sendStatusText(post, "Все отлично, можете проезжать", 3000);
            this.sendWarningStop(target, post.id);
            this.transition(post, POST_STATE.RETURN, "check-success", now);
        }
    }

    handleAttack(post, target, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-attack", now);
            return;
        }

        if (!isInsideZone(target.position, this.getPostZone(post))) {
            this.transition(post, POST_STATE.RETURN, "target-escaped-post-zone", now);
            return;
        }

        post.leader.fireAtTarget(target);
        for (const guard of post.guards) guard.fireAtTarget(target);
        this.dispatchNpcCommand(post, "fire", target);

        const maxChaseDistance = Number(post.cfg.maxChaseDistance || this.config.defaultMaxChaseDistance);
        const pursuitZone = this.getPursuitZone(post);
        const allUnits = [post.leader, ...post.guards];
        for (const unit of allUnits) {
            if (unit.isOutsideLimits(pursuitZone, maxChaseDistance)) {
                this.log(`post=${post.id} unit=${unit.id} outside limits -> force return`);
                unit.stopCombat();
                unit.returnToPost();
            }
        }

        if (!isInsideZone(target.position, pursuitZone)) {
            if (!post.targetOutsidePursuitSince) post.targetOutsidePursuitSince = now;
            if (now - post.targetOutsidePursuitSince > 2000) {
                this.transition(post, POST_STATE.RETURN, "target-left-guard-zone", now);
            }
        } else {
            post.targetOutsidePursuitSince = 0;
        }
    }

    handleReturn(post, now) {
        post.leader.stopCombat();
        post.leader.returnToPost();
        for (const guard of post.guards) {
            guard.stopCombat();
            guard.returnToPost();
        }
        this.dispatchNpcCommand(post, "return", null);

        const arrived = [post.leader, ...post.guards].every((unit) => {
            if (!unit.exists()) return false;
            return dist3(unit.ped.position, unit.spawnPos) <= 2.0;
        });

        if (arrived || now - post.stateSince > 6000) {
            this.transition(post, POST_STATE.IDLE, "returned", now);
            post.targetPlayerId = null;
            post.targetPlayerLastPos = null;
            post.targetStopStaySince = 0;
            post.attackStartedAt = 0;
            post.targetOutsidePursuitSince = 0;
        }
    }

    shouldTriggerAttack(post, target, now, options = {}) {
        if (!target || !mp.players.exists(target)) return false;
        if (this.isPlayerAggressive(target.id)) {
            this.log(`post=${post.id} attack reason=aggressive target=${target.name}[${target.id}]`);
            return true;
        }
        if (this.isPlayerCleared(target.id)) return false;

        if (!options.ignoreViolation && post.cfg.violationZone && isInsideZone(target.position, post.cfg.violationZone)) {
            this.log(`post=${post.id} attack reason=violation-zone target=${target.name}[${target.id}]`);
            return true;
        }

        return false;
    }

    ensureLeaderWarningBehavior(post, target) {
        if (!post.leader) return;
        post.leader.setFacing(target.position);
        post.leader.playStopAnim();
        post.leader.readyWeapon();
        post.leader.aimAtTarget(target);
        for (const guard of post.guards) {
            guard.readyWeapon();
            guard.aimAtTarget(target);
        }
        this.dispatchNpcCommand(post, "aim", target);
    }

    resolveTargetPlayer(post) {
        if (post.targetPlayerId != null) {
            const player = getPlayerById(post.targetPlayerId);
            if (isValidPlayer(player) && Number(player.dimension) === Number(post.cfg.dimension || 0)) {
                return player;
            }
        }

        let nearest = null;
        let nearestDist = Number.MAX_SAFE_INTEGER;

        mp.players.forEach((player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
            if (!isInsideZone(player.position, this.getPostZone(post))) return;

            const d = dist3(player.position, zoneCenter(this.getPostZone(post)));
            if (d < nearestDist) {
                nearestDist = d;
                nearest = player;
            }
        });

        return nearest;
    }

    transition(post, nextState, reason, now) {
        if (post.state === nextState) return;
        if (now < (post.stateCooldownUntil || 0)) {
            this.log(`post=${post.id} transition blocked cooldown ${post.state} -> ${nextState} (${reason})`);
            return;
        }

        const prev = post.state;
        post.state = nextState;
        post.stateSince = now;
        post.stateCooldownUntil = now + (this.config.transitionCooldownMs || 900);

        if (nextState === POST_STATE.WARNING) {
            post.warningIssuedAt = now;
            post.checkStartedAt = 0;
            post.targetStopStaySince = 0;
            const target = this.resolveTargetPlayer(post);
            if (target) {
                this.sendWarningStart(target, post);
                post.warningPrevDistToStopZone = dist3(target.position, zoneCenter(post.cfg.stopZone));
                post.warningStartDistToLeader = post.leader && post.leader.exists()
                    ? dist3(target.position, post.leader.ped.position)
                    : Number.MAX_SAFE_INTEGER;
                post.warningStartClosestGuardDist = post.guards.reduce((min, guard) => {
                    if (!guard.exists()) return min;
                    return Math.min(min, dist3(target.position, guard.ped.position));
                }, Number.MAX_SAFE_INTEGER);
            }
        }

        if (nextState === POST_STATE.CHECKING) {
            post.checkStartedAt = now;
            post.checkingGraceUntil = now + 1100;
            this.sendStatusText(post, "Идет досмотр, оставайтесь в зоне проверки (5 секунд)", 5000);
        }

        if (nextState === POST_STATE.ATTACK) {
            post.attackStartedAt = now;
            post.targetOutsidePursuitSince = 0;
            this.sendStatusText(post, "Нарушение! Охрана открывает огонь", 2500);
        }

        if (nextState === POST_STATE.IDLE || nextState === POST_STATE.RETURN) {
            const target = getPlayerById(post.targetPlayerId);
            this.sendWarningStop(target, post.id);
        }

        this.log(`post=${post.id} ${prev} -> ${nextState} (${reason})`);
        this.emitDebugToNearby(post, `${prev} -> ${nextState} (${reason})`);
    }

    sendWarningStart(player, post) {
        if (!isValidPlayer(player)) return;
        const ui = post.cfg.warningUi || {};
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:warning:start", [{
                postId: post.id,
                text: ui.text || "Охрана требует остановиться",
                soundName: ui.soundName || "5s",
                soundSet: ui.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
                stopZone: post.cfg.stopZone || null,
                ownerId: post.streamOwnerId,
                targetId: player.id,
            }]);
            if (this.notifs && !this.notifs.isEmpty) {
                this.notifs.warning(rec, "Остановитесь и зайдите в зону досмотра", "Пост охраны");
            }
        });
        this.log(`warning start broadcast post=${post.id} target=${player.name}[${player.id}] owner=${post.streamOwnerId}`);
        const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
        const warningSeconds = Math.max(1, Math.round(warningResponseMs / 1000));
        this.sendStatusText(post, `Стой! Встаньте в зону досмотра за ${warningSeconds} секунд`, warningResponseMs);
        this.sendPhase(post, "warning", warningResponseMs);
    }

    sendWarningStop(player, postId) {
        const post = this.posts.get(String(postId));
        if (post) {
            this.forEachPlayersInPost(post, (rec) => rec.call("guardCheckpoint:warning:stop", [postId]));
            if (isValidPlayer(player)) player.call("guardCheckpoint:warning:stop", [postId]);
            this.log(`warning stop broadcast post=${postId}`);
            return;
        }
        if (!isValidPlayer(player)) return;
        player.call("guardCheckpoint:warning:stop", [postId]);
    }

    resetPostsByPlayer(playerId, reason) {
        const now = Date.now();
        for (const post of this.posts.values()) {
            if (post.targetPlayerId !== playerId) continue;
            this.transition(post, POST_STATE.RETURN, reason, now);
            post.targetPlayerId = null;
            post.targetPlayerLastPos = null;
            post.targetStopStaySince = 0;
            post.warningPrevDistToStopZone = Number.MAX_SAFE_INTEGER;
        }
    }

    sendStatusText(post, text, durationMs = 3000) {
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:status:text", [post.id, text, durationMs]);
        });
    }

    sendPhase(post, phase, durationMs) {
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:phase", [post.id, phase, Number(durationMs) || 0, Date.now()]);
        });
    }

    emitDebugToNearby(post, text) {
        if (!this.config.debug) return;
        const payload = `[${post.id}] ${text}`;
        this.forEachPlayersInPost(post, (player) => player.call("guardCheckpoint:debug", [payload]));
    }

    getPostZone(post) {
        return post.cfg.postZone || post.cfg.guardZone;
    }

    getPursuitZone(post) {
        return post.cfg.pursuitZone || post.cfg.guardZone;
    }

    forEachPlayersInPost(post, callback) {
        mp.players.forEach((player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
            if (!isInsideZone(player.position, this.getPostZone(post))) return;
            callback(player);
        });
    }

    updateStreamOwner(post, now) {
        const inside = [];
        this.forEachPlayersInPost(post, (player) => {
            if (!post.playerSeenAt.has(player.id)) post.playerSeenAt.set(player.id, now);
            inside.push(player);
        });

        for (const pid of Array.from(post.playerSeenAt.keys())) {
            if (!inside.some((p) => p.id === pid)) post.playerSeenAt.delete(pid);
        }

        let nextOwner = post.streamOwnerId;
        const currentInside = inside.some((p) => p.id === post.streamOwnerId);
        if (!currentInside) {
            nextOwner = null;
            let earliest = Number.MAX_SAFE_INTEGER;
            inside.forEach((p) => {
                const seenAt = post.playerSeenAt.get(p.id) || now;
                if (seenAt < earliest) {
                    earliest = seenAt;
                    nextOwner = p.id;
                }
            });
        }

        if (post.streamOwnerId === nextOwner) return;
        post.streamOwnerId = nextOwner;
        this.applyStreamOwner(post, nextOwner);
        this.log(`post=${post.id} stream owner -> ${nextOwner}`);
    }

    applyStreamOwner(post, ownerId) {
        if (ownerId == null) return;
        const owner = getPlayerById(ownerId);
        if (!owner) return;
        [post.leader, ...post.guards].forEach((unit) => {
            if (!unit.exists()) return;
            try { unit.ped.controller = owner; } catch {}
            try { unit.ped.setVariable("streamOwnerId", ownerId); } catch {}
        });
    }

    dispatchNpcCommand(post, command, targetPlayer) {
        const targetId = targetPlayer ? targetPlayer.id : -1;
        const now = Date.now();
        const key = `${command}:${targetId}`;
        if (post.lastClientCommandKey === key && now - (post.lastClientCommandAt || 0) < 900) return;
        post.lastClientCommandKey = key;
        post.lastClientCommandAt = now;
        const units = [post.leader, ...post.guards]
            .filter((unit) => unit && unit.exists())
            .map((unit) => ({
                pedId: unit.ped.id,
                role: unit.role,
                x: unit.spawnPos.x,
                y: unit.spawnPos.y,
                z: unit.spawnPos.z,
                heading: unit.spawnHeading,
                weaponHash: unit.weaponHash || 0,
            }));
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:npcCommand", [post.id, command, targetId, units, post.streamOwnerId]);
        });
    }

    getPost(postId) {
        return this.posts.get(String(postId));
    }

    async createOrReplacePost(rawPost) {
        if (!rawPost || !rawPost.id) return null;
        const current = this.posts.get(rawPost.id);
        if (current) {
            if (current.leader) current.leader.shutdown();
            for (const guard of current.guards || []) guard.shutdown();
        }
        const post = this.createPostRuntime(rawPost);
        this.posts.set(post.id, post);
        await this.savePostToDb(post.id);
        return post;
    }

    async updateZone(postId, zoneKey, zoneData) {
        const post = this.getPost(postId);
        if (!post) return false;
        post.cfg[zoneKey] = zoneData;
        await this.savePostToDb(postId);
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

    async reloadFromDb() {
        const loaded = await this.loadPostsFromDb();
        if (!loaded) return false;
        return true;
    }
}

module.exports = {
    CheckpointGuardController,
    POST_STATE,
};
