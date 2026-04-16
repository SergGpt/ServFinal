"use strict";

const { GuardNpc } = require("./guardNpc");

const POST_STATE = {
    IDLE: "idle",
    WARNING: "warning",
    APPROACHING: "approaching",
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

function isInsideZoneWithTolerance(pos, zone, tolerance = 2.5) {
    if (!zone) return false;
    if (String(zone.type || "sphere") === "sphere") {
        const zLimit = Math.max(2.5, Number(tolerance || 0) + 1.0);
        const centerZ = Number(zone.center && zone.center.z);
        if (Number.isFinite(centerZ) && Number.isFinite(Number(pos.z)) && Math.abs(Number(pos.z) - centerZ) > zLimit) {
            return false;
        }
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
        this.pendingDeathResetTimers = new Map();

        this.notifs = call("notifications");
        this.damageSystem = call("damageSystem");

        this.log = (msg) => {
            if (!this.config.debug) return;
            console.log(`[GUARD-CHECKPOINT] ${msg}`);
        };
        this.plog = (msg) => {
            if (!this.config.debugProtocol) return;
            console.log(`[GUARD-CHECKPOINT][SYNC] ${msg}`);
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
            lastAppliedBehaviorKey: "",
            lastPoseSyncAt: 0,
            ctrlVer: 0,
            controllerAckVer: 0,
            pendingMovementCommand: null,
            lastAttackDamageAt: 0,
            commandSeq: 0,
            lastBroadcastCommand: null,
            behaviorSessionId: 0,
            attackSessionId: 0,
            lastAttackBurstAt: 0,
            unitAlive: new Map(),
            lastDamageClaims: new Map(),
            attackTargetLostSince: 0,
            attackServerUntil: 0,
            approachUnitId: null,
            stopZoneExitSince: 0,
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
        for (const timer of this.pendingDeathResetTimers.values()) clearTimeout(timer);
        this.pendingDeathResetTimers.clear();
        this.log("controller shutdown complete");
    }

    onPlayerQuit(player) {
        if (!player) return;
        const pendingTimer = this.pendingDeathResetTimers.get(player.id);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.pendingDeathResetTimers.delete(player.id);
        }
        this.clearPlayerAggression(player.id);
        this.resetPostsByPlayer(player.id, "player-quit");
    }

    onPlayerDeath(player) {
        if (!player) return;
        const existing = this.pendingDeathResetTimers.get(player.id);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this.pendingDeathResetTimers.delete(player.id);
            if (!isValidPlayer(player)) return;
            if ((Number(player.health) || 0) > 0) return;
            this.clearPlayerAggression(player.id);
            this.resetPostsByPlayer(player.id, "player-death-confirmed-1s");
        }, 1000);
        this.pendingDeathResetTimers.set(player.id, timer);
    }

    onPlayerWeaponChange(player, oldWeapon, newWeapon) {
        if (!isValidPlayer(player)) return;
        const weaponHash = Number(newWeapon) || 0;
        if (!weaponHash) return;
    }

    onPlayerDamage(player, attacker) {
        if (!isValidPlayer(player)) return;
        if (!attacker || !mp.players.exists(attacker)) return;
        this.markAggressive(attacker.id);
        this.log(`aggressive by damage attacker=${attacker.name}[${attacker.id}] target=${player.name}[${player.id}]`);
    }

    onControllerAck(player, postId, ver) {
        if (!isValidPlayer(player)) return;
        const post = this.getPost(postId);
        if (!post) return;
        const expectedVer = Number(post.ctrlVer) || 0;
        if (Number(player.id) !== Number(post.streamOwnerId)) return;
        if (Number(ver) !== expectedVer) return;

        post.controllerAckVer = expectedVer;
        const pending = post.pendingMovementCommand;
        if (pending) {
            post.pendingMovementCommand = null;
            const target = pending.targetId >= 0 ? getPlayerById(pending.targetId) : null;
            this.dispatchNpcCommand(post, pending.command, target, { force: true, owner: player });
            this.log(`post=${post.id} controller ack ver=${ver} replay cmd=${pending.command}`);
        }
        if (post.lastBroadcastCommand) {
            player.call("guardCheckpoint:npcCommand", [post.lastBroadcastCommand]);
            this.plog(`ack-replay post=${post.id} owner=${player.id} seq=${post.lastBroadcastCommand.commandSeq} bs=${post.lastBroadcastCommand.behaviorSessionId} as=${post.lastBroadcastCommand.attackSessionId} cmd=${post.lastBroadcastCommand.command}`);
        }
    }

    onNpcDeadSignal(player, postId, pedId) {
        if (!isValidPlayer(player)) return;
        const post = this.getPost(postId);
        if (!post) return;
        if (Number(player.id) !== Number(post.streamOwnerId)) return;

        const allUnits = [post.leader, ...post.guards];
        const found = allUnits.find((unit) => unit && unit.ped && Number(unit.ped.id) === Number(pedId));
        if (!found) return;
        found.markDead(Date.now(), `client-signal owner=${player.id}`);
        this.log(`post=${post.id} npc-dead-signal ped=${pedId} by owner=${player.id}`);
        this.plog(`dead-signal post=${post.id} owner=${player.id} ped=${pedId} streamOwner=${post.streamOwnerId}`);
    }

    onSyncDamage(player, postId, sourcePedId, targetPlayerId, weaponHash, boneIndex, claimedDamage) {
        if (!isValidPlayer(player)) return;
        const post = this.getPost(postId);
        if (!post) return;
        if (post.state !== POST_STATE.ATTACK) return;
        if ((Number(player.health) || 0) <= 0) return;
        if (Number(player.id) !== Number(targetPlayerId)) return;
        if (Number(post.targetPlayerId) !== Number(player.id)) return;

        const units = [post.leader, ...post.guards];
        const sourceUnit = units.find((u) => u && u.exists() && Number(u.ped.id) === Number(sourcePedId));
        if (!sourceUnit) return;
        if (!isInsideZone(player.position, this.getPostZone(post))) return;

        const dist = dist3(sourceUnit.ped.position, player.position);
        if (dist > Number(post.cfg.attackDamageRange || this.config.attackDamageRange || 38) + 6) return;

        const claimKey = `${player.id}:${sourcePedId}`;
        const now = Date.now();
        const lastAt = Number(post.lastDamageClaims.get(claimKey)) || 0;
        if (now - lastAt < 120) return;
        post.lastDamageClaims.set(claimKey, now);

        let damageValue = Number(claimedDamage) || Number(post.cfg.attackDamagePerAttacker || this.config.attackDamagePerAttacker || 7);
        if (this.damageSystem && typeof this.damageSystem.findDamageValue === "function") {
            const byWeapon = Number(this.damageSystem.findDamageValue(Number(weaponHash) || sourceUnit.weaponHash || 0));
            if (byWeapon > 0) damageValue = byWeapon;
        }
        const damaged = {
            armour: Number(player.armour) || 0,
            health: Number(player.health) || 0,
        };
        if (this.damageSystem && typeof this.damageSystem.damagePlayer === "function") {
            this.damageSystem.damagePlayer(damaged, Math.max(1, Math.round(damageValue)));
        } else {
            damaged.health = Math.max(0, damaged.health - Math.max(1, Math.round(damageValue)));
        }
        if (damaged.health <= 0 && !player.isCustomDeath) {
            player.isCustomDeath = true;
            mp.events.call("customDeath", player, Number(weaponHash) || 0, null);
        }
        player.armour = Math.clamp(damaged.armour, 0, 100);
        player.health = Math.clamp(damaged.health, 0, 100);
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
        this.syncUnitLifeProtocol(post);
        this.updateStreamOwner(post, now);
        this.publishAuthoritativePose(post, now);

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
            case POST_STATE.APPROACHING:
                this.handleApproaching(post, target, now);
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

        this.applyWarningBehavior(post, target);

        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) {
            this.transition(post, POST_STATE.ATTACK, "warning-violation", now);
            return;
        }

        const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
        const elapsed = now - (post.warningIssuedAt || now);
        const distToStop = dist3(target.position, zoneCenter(post.cfg.stopZone));
        const prevDistToStop = Number(post.warningPrevDistToStopZone || distToStop);
        const stopZoneTolerance = Number(post.cfg.stopZoneTolerance || this.config.stopZoneTolerance || 2.5);
        const stopZoneRadius = Number(post.cfg.stopZone && post.cfg.stopZone.radius) || 0;
        const insideStopByDist = distToStop <= (stopZoneRadius + stopZoneTolerance);
        if (isInsideZoneWithTolerance(target.position, post.cfg.stopZone, stopZoneTolerance) || insideStopByDist) {
            post.targetStopStaySince = now;
            post.stopZoneExitSince = 0;
            this.log(`post=${post.id} target=${target.id} entered stopZone`);
            this.transition(post, POST_STATE.APPROACHING, "entered-stop-zone", now);
            return;
        }

        if (elapsed > warningResponseMs) {
            this.transition(post, POST_STATE.ATTACK, "did-not-enter-stop-zone-in-time", now);
            return;
        }

        post.warningPrevDistToStopZone = distToStop;
    }

    handleApproaching(post, target, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-approaching", now);
            return;
        }
        if (!isInsideZone(target.position, this.getPostZone(post))) {
            this.transition(post, POST_STATE.RETURN, "left-post-zone-approaching", now);
            return;
        }
        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) {
            this.transition(post, POST_STATE.ATTACK, "approaching-violation", now);
            return;
        }
        const approachUnit = this.selectApproachUnit(post, target);
        if (!approachUnit || !approachUnit.exists()) {
            this.transition(post, POST_STATE.ATTACK, "approach-unit-missing", now);
            return;
        }
        const distToPlayer = dist3(approachUnit.ped.position, target.position);
        const stopZoneTolerance = Number(post.cfg.stopZoneTolerance || this.config.stopZoneTolerance || 2.5);
        const insideStopZone = isInsideZoneWithTolerance(target.position, post.cfg.stopZone, stopZoneTolerance);
        const allowOutsideStopZoneNearNpc = !insideStopZone && distToPlayer < 3;
        const exitDelayMs = Number(post.cfg.stopZoneExitDelayMs || this.config.stopZoneExitDelayMs || 2000);
        if (!insideStopZone && !allowOutsideStopZoneNearNpc) {
            if (!post.stopZoneExitSince) post.stopZoneExitSince = now;
            if (now - post.stopZoneExitSince >= exitDelayMs) {
                this.transition(post, POST_STATE.ATTACK, "left-stop-zone-approaching-delay", now);
                return;
            }
        } else {
            post.stopZoneExitSince = 0;
        }
        post.approachUnitId = approachUnit.id;
        this.log(`approach: selected npc=${approachUnit.id} dist=${distToPlayer.toFixed(2)}`);

        this.applyApproachBehavior(post, target, approachUnit);
        this.log(`approach: dispatched goto for ${approachUnit.id}`);

        if (this.checkApproachCondition(post, approachUnit, target)) {
            this.transition(post, POST_STATE.CHECKING, "approach-complete", now);
            return;
        }

        const timeoutMs = Number(post.cfg.checkApproachTimeoutMs || this.config.checkApproachTimeoutMs || 5000);
        if (now - post.stateSince >= timeoutMs) {
            this.transition(post, POST_STATE.ATTACK, "approach-timeout", now);
        }
    }

    checkApproachCondition(post, npc, target) {
        if (!npc || !npc.exists() || !target) return false;
        const checkApproachRange = Number(post.cfg.checkApproachRange || this.config.checkApproachRange || 2.0);
        const currentDist = dist3(npc.ped.position, target.position);
        this.log(`approach: distance check npc=${npc.id} dist=${currentDist.toFixed(2)} need=${checkApproachRange}`);
        return currentDist <= checkApproachRange;
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

        const stopZoneTolerance = Number(post.cfg.stopZoneTolerance || this.config.stopZoneTolerance || 2.5);
        const insideStopZone = isInsideZoneWithTolerance(target.position, post.cfg.stopZone, stopZoneTolerance);
        const exitDelayMs = Number(post.cfg.stopZoneExitDelayMs || this.config.stopZoneExitDelayMs || 2000);
        if (!insideStopZone) {
            if (!post.stopZoneExitSince) post.stopZoneExitSince = now;
            if (now - post.stopZoneExitSince >= exitDelayMs) {
                this.transition(post, POST_STATE.ATTACK, "left-stop-zone-checking-delay", now);
                return;
            }
        } else {
            post.stopZoneExitSince = 0;
        }

        this.applySearchBehavior(post, target);

        if (now < (post.checkingGraceUntil || 0)) return;

        const checkDurationMs = Number(post.cfg.checkDurationMs || this.config.defaultCheckDurationMs);
        const stayedMs = now - (post.targetStopStaySince || now);
        if (stayedMs >= checkDurationMs) {
            this.log(`post=${post.id} checking completed target=${target.id}`);
            this.markPlayerCleared(target.id, 20000);
            this.sendStatusText(post, "Все отлично, можете проезжать", 3000, target);
            this.sendWarningStop(target, post.id);
            this.transition(post, POST_STATE.RETURN, "check-success", now);
        }
    }

    handleAttack(post, target, now) {
        if (!target) {
            if (!post.attackTargetLostSince) post.attackTargetLostSince = now;
            const delay = Math.max(500, Number(post.cfg.attackReturnDelayMs || this.config.attackReturnDelayMs || 3000));
            if (now - post.attackTargetLostSince < delay) return;
            this.transition(post, POST_STATE.RETURN, "no-target-attack-timeout", now);
            return;
        }
        if ((Number(target.health) || 0) <= 0) {
            if (!post.attackTargetLostSince) post.attackTargetLostSince = now;
            const deadTimeoutMs = 1500;
            if (now - post.attackTargetLostSince < deadTimeoutMs) return;
            this.transition(post, POST_STATE.RETURN, "target-dead-timeout", now);
            return;
        }
        post.attackTargetLostSince = 0;
        post.attackServerUntil = now + Math.max(600, Number(post.cfg.attackCommandWindowMs || this.config.attackCommandWindowMs || 2500));

        if (!isInsideZone(target.position, this.getPostZone(post))) {
            this.transition(post, POST_STATE.RETURN, "target-escaped-post-zone", now);
            return;
        }

        this.applyAttackBehavior(post, target);
        this.applyAttackDamage(post, target, now);
        this.broadcastAttackBurst(post, target, now);

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

    applyAttackDamage(post, target, now) {
        if (!isValidPlayer(target)) return;
        if ((Number(target.health) || 0) <= 0) return;

        const intervalMs = Math.max(180, Number(post.cfg.attackDamageIntervalMs || this.config.attackDamageIntervalMs || 450));
        if (now - (post.lastAttackDamageAt || 0) < intervalMs) return;

        const aliveUnits = [post.leader, ...post.guards].filter((unit) => unit && unit.exists());
        if (!aliveUnits.length) return;

        const attackers = aliveUnits;
        if (!attackers.length) return;

        let damagePerAttacker = Number(post.cfg.attackDamagePerAttacker || this.config.attackDamagePerAttacker || 7);
        const weaponHash = Number(attackers[0].weaponHash) || 0;
        if (this.damageSystem && typeof this.damageSystem.findDamageValue === "function") {
            const byWeapon = Number(this.damageSystem.findDamageValue(weaponHash));
            if (byWeapon > 0) damagePerAttacker = byWeapon;
        }

        const totalDamage = Math.max(1, Math.round(damagePerAttacker * attackers.length));
        const damaged = {
            armour: Number(target.armour) || 0,
            health: Number(target.health) || 0,
        };

        if (this.damageSystem && typeof this.damageSystem.damagePlayer === "function") {
            this.damageSystem.damagePlayer(damaged, totalDamage);
        } else {
            damaged.health = Math.max(0, damaged.health - totalDamage);
        }

        if (damaged.health <= 0 && !target.isCustomDeath) {
            target.isCustomDeath = true;
            mp.events.call("customDeath", target, weaponHash, null);
        }

        target.armour = Math.clamp(damaged.armour, 0, 100);
        target.health = Math.clamp(damaged.health, 0, 100);
        post.lastAttackDamageAt = now;
    }

    handleReturn(post, now) {
        this.applyReturnBehavior(post);

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
            post.attackTargetLostSince = 0;
            post.attackServerUntil = 0;
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

    applyWarningBehavior(post, target, force = false) {
        if (!post.leader || !target) return;
        const behaviorKey = `warning:${target.id}`;
        if (!force && post.lastAppliedBehaviorKey === behaviorKey) return;
        post.lastAppliedBehaviorKey = behaviorKey;

        post.leader.setFacing(target.position);
        post.leader.playStopAnim();
        post.leader.readyWeapon();
        post.leader.aimAtTarget(target);
        for (const guard of post.guards) {
            guard.readyWeapon();
            guard.aimAtTarget(target);
        }
        this.dispatchNpcCommand(post, "aim", target, { force });
    }

    selectApproachUnit(post, target) {
        const units = [post.leader, ...post.guards].filter((unit) => unit && unit.exists());
        if (!units.length || !target) return null;

        let best = units[0];
        let bestDist = dist3(best.ped.position, target.position);
        for (const unit of units) {
            const d = dist3(unit.ped.position, target.position);
            if (d < bestDist) {
                best = unit;
                bestDist = d;
            }
        }
        return best;
    }

    applyApproachBehavior(post, target, approachUnit, force = false) {
        if (!target || !approachUnit || !approachUnit.exists()) return;
        const behaviorKey = `approach:${target.id}:${approachUnit.id}`;
        if (!force && post.lastAppliedBehaviorKey === behaviorKey) return;
        post.lastAppliedBehaviorKey = behaviorKey;

        post.leader.stopCombat();
        for (const guard of post.guards) guard.stopCombat();

        const range = Number(post.cfg.checkApproachRange || this.config.checkApproachRange || 2.0);
        this.dispatchNpcCommand(post, "goto", target, {
            force,
            keySuffix: `${approachUnit.id}:${Math.round(target.position.x * 10)}:${Math.round(target.position.y * 10)}:${Math.round(target.position.z * 10)}`,
            payload: {
                gotoPedId: Number(approachUnit.ped.id) || -1,
                gotoX: Number(target.position.x) || 0,
                gotoY: Number(target.position.y) || 0,
                gotoZ: Number(target.position.z) || 0,
                gotoRange: range,
            },
        });
    }

    applySearchBehavior(post, target, force = false) {
        if (!target) return;
        const behaviorKey = `search:${target.id}`;
        if (!force && post.lastAppliedBehaviorKey === behaviorKey) return;
        post.lastAppliedBehaviorKey = behaviorKey;

        const durationMs = Number(post.cfg.searchAnimDurationMs || this.config.searchAnimDurationMs || 5000);
        this.dispatchNpcCommand(post, "search", target, {
            force,
            payload: {
                searchDurationMs: durationMs,
            },
        });
    }

    applyAttackBehavior(post, target, force = false) {
        if (!target) return;
        const behaviorKey = `attack:${target.id}`;
        if (!force && post.lastAppliedBehaviorKey === behaviorKey) return;
        post.lastAppliedBehaviorKey = behaviorKey;

        post.leader.fireAtTarget(target);
        for (const guard of post.guards) guard.fireAtTarget(target);
        this.dispatchNpcCommand(post, "fire", target, { force });
    }

    applyReturnBehavior(post, force = false) {
        const behaviorKey = "return";
        if (!force && post.lastAppliedBehaviorKey === behaviorKey) return;
        post.lastAppliedBehaviorKey = behaviorKey;

        post.leader.stopCombat();
        post.leader.returnToPost();
        for (const guard of post.guards) {
            guard.stopCombat();
            guard.returnToPost();
        }
        this.dispatchNpcCommand(post, "return", null, { force });
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
        const bypassCooldown = post.state === POST_STATE.WARNING
            && nextState === POST_STATE.APPROACHING
            && reason === "entered-stop-zone";
        if (!bypassCooldown && now < (post.stateCooldownUntil || 0)) {
            this.log(`post=${post.id} transition blocked cooldown ${post.state} -> ${nextState} (${reason})`);
            return;
        }

        const prev = post.state;
        post.state = nextState;
        post.stateSince = now;
        post.stateCooldownUntil = now + (this.config.transitionCooldownMs || 900);
        post.lastAppliedBehaviorKey = "";
        post.behaviorSessionId = (Number(post.behaviorSessionId) || 0) + 1;
        if (nextState === POST_STATE.ATTACK) {
            post.attackSessionId = (Number(post.attackSessionId) || 0) + 1;
        }

        if (nextState === POST_STATE.WARNING) {
            post.warningIssuedAt = now;
            post.checkStartedAt = 0;
            post.targetStopStaySince = 0;
            post.stopZoneExitSince = 0;
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
            post.stopZoneExitSince = 0;
            const target = getPlayerById(post.targetPlayerId);
            this.sendStatusText(post, "Идет досмотр, оставайтесь в зоне проверки (5 секунд)", 5000, target);
            this.sendPhase(post, "checking", Number(post.cfg.searchAnimDurationMs || this.config.searchAnimDurationMs || 5000), target);
            this.applySearchBehavior(post, target, true);
        }

        if (nextState === POST_STATE.APPROACHING) {
            post.checkStartedAt = 0;
            post.stopZoneExitSince = 0;
            const target = getPlayerById(post.targetPlayerId);
            this.sendStatusText(post, "Ожидайте: сотрудник подходит для досмотра", 3000, target);
            this.sendPhase(post, "approaching", Number(post.cfg.checkApproachTimeoutMs || this.config.checkApproachTimeoutMs || 5000), target);
        }

        if (nextState === POST_STATE.ATTACK) {
            post.attackStartedAt = now;
            post.targetOutsidePursuitSince = 0;
            post.attackTargetLostSince = 0;
            post.attackServerUntil = now + Math.max(600, Number(post.cfg.attackCommandWindowMs || this.config.attackCommandWindowMs || 2500));
            const target = getPlayerById(post.targetPlayerId);
            this.sendStatusText(post, "Нарушение! Охрана открывает огонь", 2500, target);
        }

        if (nextState === POST_STATE.IDLE || nextState === POST_STATE.RETURN) {
            const target = getPlayerById(post.targetPlayerId);
            this.sendWarningStop(target, post.id);
            post.approachUnitId = null;
            post.stopZoneExitSince = 0;
        }

        this.log(`post=${post.id} ${prev} -> ${nextState} (${reason})`);
        this.emitDebugToNearby(post, `${prev} -> ${nextState} (${reason})`);
    }

    sendWarningStart(player, post) {
        if (!isValidPlayer(player)) return;
        const ui = post.cfg.warningUi || {};
        player.call("guardCheckpoint:warning:start", [{
            postId: post.id,
            text: ui.text || "Охрана требует остановиться",
            soundName: ui.soundName || "5s",
            soundSet: ui.soundSet || "MP_MISSION_COUNTDOWN_SOUNDSET",
            stopZone: post.cfg.stopZone || null,
            ownerId: post.streamOwnerId,
            targetId: player.id,
        }]);
        if (this.notifs && !this.notifs.isEmpty) {
            this.notifs.warning(player, "Остановитесь и зайдите в зону досмотра", "Пост охраны");
        }
        this.log(`warning start target-only post=${post.id} target=${player.name}[${player.id}] owner=${post.streamOwnerId}`);
        const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
        const warningSeconds = Math.max(1, Math.round(warningResponseMs / 1000));
        this.sendStatusText(post, `Стой! Встаньте в зону досмотра за ${warningSeconds} секунд`, warningResponseMs, player);
        this.sendPhase(post, "warning", warningResponseMs, player);
    }

    sendWarningStop(player, postId) {
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

    sendStatusText(post, text, durationMs = 3000, player = null) {
        if (isValidPlayer(player)) {
            player.call("guardCheckpoint:status:text", [post.id, text, durationMs]);
            return;
        }
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:status:text", [post.id, text, durationMs]);
        });
    }

    sendPhase(post, phase, durationMs, player = null) {
        if (isValidPlayer(player)) {
            player.call("guardCheckpoint:phase", [post.id, phase, Number(durationMs) || 0, Date.now()]);
            return;
        }
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

    publishAuthoritativePose(post, now) {
        if (now - (post.lastPoseSyncAt || 0) < 150) return;
        post.lastPoseSyncAt = now;
        const units = [post.leader, ...post.guards];
        for (const unit of units) {
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
        post.lastClientCommandKey = null;
        post.lastClientCommandAt = 0;
        post.ctrlVer = (Number(post.ctrlVer) || 0) + 1;
        post.controllerAckVer = 0;
        this.applyStreamOwner(post, nextOwner);
        const owner = getPlayerById(nextOwner);
        if (isValidPlayer(owner)) {
            owner.call("guardCheckpoint:controller:switch", [post.id, post.ctrlVer, post.state]);
        }
        this.plog(`owner-switch post=${post.id} owner=${nextOwner} ctrlVer=${post.ctrlVer} state=${post.state} seq=${post.commandSeq}`);
        this.log(`post=${post.id} stream owner -> ${nextOwner} ver=${post.ctrlVer}`);
        this.resyncPostStateForOwner(post, nextOwner, "owner-changed");
    }

    applyStreamOwner(post, ownerId) {
        const owner = ownerId == null ? null : getPlayerById(ownerId);
        [post.leader, ...post.guards].forEach((unit) => {
            if (!unit.exists()) return;
            try { unit.ped.setVariable("streamOwnerId", ownerId == null ? -1 : ownerId); } catch {}
            try { unit.ped.setVariable("ctrlVer", Number(post.ctrlVer) || 0); } catch {}
            if (!owner) return;
            try { unit.ped.controller = owner; } catch {}
        });
    }

    getCurrentTarget(post) {
        const target = getPlayerById(post.targetPlayerId);
        return isValidPlayer(target) ? target : null;
    }

    resyncPostStateForOwner(post, ownerId, reason = "resync") {
        const owner = getPlayerById(ownerId);
        if (!isValidPlayer(owner)) return;
        owner.call("guardCheckpoint:stateSnapshot", [this.buildStateSnapshot(post)]);
        this.plog(`snapshot post=${post.id} owner=${owner.id} ctrlVer=${post.ctrlVer} seq=${post.commandSeq} bs=${post.behaviorSessionId} as=${post.attackSessionId} state=${post.state}`);

        const target = this.getCurrentTarget(post);
        let command = "idle";
        if (post.state === POST_STATE.ATTACK) command = target ? "fire" : "return";
        else if (post.state === POST_STATE.WARNING) command = target ? "aim" : "return";
        else if (post.state === POST_STATE.APPROACHING) command = target ? "goto" : "return";
        else if (post.state === POST_STATE.CHECKING) command = target ? "search" : "return";
        else if (post.state === POST_STATE.RETURN) command = "return";

        if (command === "aim") this.applyWarningBehavior(post, target, true);
        else if (command === "goto") {
            const approachUnit = this.selectApproachUnit(post, target);
            this.applyApproachBehavior(post, target, approachUnit, true);
        }
        else if (command === "search") this.applySearchBehavior(post, target, true);
        else if (command === "fire") this.applyAttackBehavior(post, target, true);
        else if (command === "return") this.applyReturnBehavior(post, true);
        else this.dispatchNpcCommand(post, "idle", null, { force: true, owner });
        this.log(`post=${post.id} owner-resync cmd=${command} target=${target ? target.id : -1} reason=${reason}`);
    }

    dispatchNpcCommand(post, command, targetPlayer, options = {}) {
        const targetId = targetPlayer ? targetPlayer.id : -1;
        const now = Date.now();
        const force = !!options.force;
        const key = `${command}:${targetId}:${post.behaviorSessionId}:${post.attackSessionId}:${String(options.keySuffix || "")}`;
        if (!force && post.lastClientCommandKey === key && now - (post.lastClientCommandAt || 0) < 900) return;
        post.lastClientCommandKey = key;
        post.lastClientCommandAt = now;
        const packet = this.buildCommandPacket(post, command, targetId, options.payload || null);
        if (command === "goto") {
            this.log(`dispatch: post=${post.id} cmd=goto target=${targetId}`);
        }
        post.lastBroadcastCommand = packet;
        const owner = getPlayerById(post.streamOwnerId);
        if (!isValidPlayer(owner) || Number(post.controllerAckVer) !== Number(post.ctrlVer)) {
            post.pendingMovementCommand = { command, targetId, at: Date.now() };
        }
        this.forEachPlayersInPost(post, (rec) => {
            rec.call("guardCheckpoint:npcCommand", [packet]);
        });
        this.plog(`dispatch post=${post.id} seq=${packet.commandSeq} bs=${packet.behaviorSessionId} as=${packet.attackSessionId} owner=${packet.streamOwnerId} cmd=${packet.command} target=${packet.targetId} units=${packet.units.length}`);
    }

    buildCommandPacket(post, command, targetId = -1, payload = null) {
        post.commandSeq = (Number(post.commandSeq) || 0) + 1;
        const gotoPedId = payload && payload.gotoPedId != null ? Number(payload.gotoPedId) : -1;
        const gotoX = payload ? Number(payload.gotoX) : NaN;
        const gotoY = payload ? Number(payload.gotoY) : NaN;
        const gotoZ = payload ? Number(payload.gotoZ) : NaN;
        const gotoRange = payload ? Number(payload.gotoRange) : NaN;
        const units = [post.leader, ...post.guards].map((unit) => {
            if (command === "goto") {
                this.log(`build: command=goto for unit ${unit.id}`);
            }
            return {
                unitId: unit.id,
                pedId: unit.exists() ? unit.ped.id : -1,
                role: unit.role,
                alive: !!unit.exists(),
                state: unit.exists() ? String(unit.ped.getVariable("guardState") || post.state || "idle") : "dead",
                x: unit.spawnPos.x,
                y: unit.spawnPos.y,
                z: unit.spawnPos.z,
                heading: unit.spawnHeading,
                weaponHash: unit.weaponHash || 0,
                returnX: unit.spawnPos.x,
                returnY: unit.spawnPos.y,
                returnZ: unit.spawnPos.z,
                returnHeading: unit.spawnHeading,
                hasReachedReturn: unit.exists() ? dist3(unit.ped.position, unit.spawnPos) <= 1.5 : false,
                gotoX: command === "goto" && Number(unit.exists() ? unit.ped.id : -1) === gotoPedId && Number.isFinite(gotoX) ? gotoX : null,
                gotoY: command === "goto" && Number(unit.exists() ? unit.ped.id : -1) === gotoPedId && Number.isFinite(gotoY) ? gotoY : null,
                gotoZ: command === "goto" && Number(unit.exists() ? unit.ped.id : -1) === gotoPedId && Number.isFinite(gotoZ) ? gotoZ : null,
                gotoRange: command === "goto" && Number(unit.exists() ? unit.ped.id : -1) === gotoPedId && Number.isFinite(gotoRange) ? gotoRange : null,
            };
        });
        return {
            postId: post.id,
            commandSeq: post.commandSeq,
            command,
            targetId,
            issuedAt: Date.now(),
            streamOwnerId: post.streamOwnerId == null ? -1 : post.streamOwnerId,
            ctrlVer: Number(post.ctrlVer) || 0,
            behaviorSessionId: Number(post.behaviorSessionId) || 0,
            attackSessionId: Number(post.attackSessionId) || 0,
            attackUntil: Number(post.attackServerUntil) || 0,
            state: post.state,
            units,
            ...(payload && typeof payload === "object" ? payload : {}),
        };
    }

    buildStateSnapshot(post) {
        return {
            postId: post.id,
            state: post.state,
            commandSeq: Number(post.commandSeq) || 0,
            behaviorSessionId: Number(post.behaviorSessionId) || 0,
            attackSessionId: Number(post.attackSessionId) || 0,
            targetPlayerId: post.targetPlayerId == null ? -1 : post.targetPlayerId,
            streamOwnerId: post.streamOwnerId == null ? -1 : post.streamOwnerId,
            ctrlVer: Number(post.ctrlVer) || 0,
            units: [post.leader, ...post.guards].map((unit) => ({
                unitId: unit.id,
                pedId: unit.exists() ? unit.ped.id : -1,
                role: unit.role,
                alive: !!unit.exists(),
                x: unit.exists() ? Number(unit.ped.position.x) : unit.spawnPos.x,
                y: unit.exists() ? Number(unit.ped.position.y) : unit.spawnPos.y,
                z: unit.exists() ? Number(unit.ped.position.z) : unit.spawnPos.z,
                heading: unit.exists() ? Number(unit.ped.getHeading ? unit.ped.getHeading() : unit.spawnHeading) : unit.spawnHeading,
                weaponHash: unit.weaponHash || 0,
                returnX: unit.spawnPos.x,
                returnY: unit.spawnPos.y,
                returnZ: unit.spawnPos.z,
                returnHeading: unit.spawnHeading,
                hasReachedReturn: unit.exists() ? dist3(unit.ped.position, unit.spawnPos) <= 1.5 : false,
                guardState: unit.exists() ? String(unit.ped.getVariable("guardState") || "idle") : "dead",
                guardTarget: unit.exists() ? Number(unit.ped.getVariable("guardTarget") || -1) : -1,
            })),
        };
    }

    syncUnitLifeProtocol(post) {
        const units = [post.leader, ...post.guards];
        units.forEach((unit) => {
            const alive = !!unit.exists();
            const prev = post.unitAlive.get(unit.id);
            if (prev == null) {
                post.unitAlive.set(unit.id, alive);
                return;
            }
            if (prev === alive) return;
            post.unitAlive.set(unit.id, alive);
            const target = this.getCurrentTarget(post);
            this.dispatchNpcCommand(post, alive ? "respawn" : "dead", target, { force: true });
        });
    }

    broadcastAttackBurst(post, target, now) {
        const interval = Math.max(120, Number(post.cfg.attackBurstIntervalMs || this.config.attackBurstIntervalMs || 280));
        if (now - (post.lastAttackBurstAt || 0) < interval) return;
        post.lastAttackBurstAt = now;
        const pedIds = [post.leader, ...post.guards]
            .filter((u) => u && u.exists())
            .map((u) => u.ped.id);
        if (!pedIds.length) return;
        const payload = {
            postId: post.id,
            commandSeq: Number(post.commandSeq) || 0,
            behaviorSessionId: Number(post.behaviorSessionId) || 0,
            attackSessionId: Number(post.attackSessionId) || 0,
            targetId: target ? target.id : -1,
            pedIds,
            at: now,
        };
        this.forEachPlayersInPost(post, (rec) => rec.call("guardCheckpoint:attackBurst", [payload]));
        this.plog(`burst post=${post.id} seq=${payload.commandSeq} as=${payload.attackSessionId} owner=${post.streamOwnerId} target=${payload.targetId} peds=${payload.pedIds.length}`);
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
