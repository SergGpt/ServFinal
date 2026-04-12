"use strict";

const { GuardNpc } = require("./guardNpc");
const { saveTask, clearTask, restoreTask } = require("./guardTaskMemory");
const { createGuardControllerManager } = require("./guardControllerManager");

const POST_STATE = {
    IDLE: "idle",
    WARNING: "warning",
    CHECKING: "checking",
    ATTACK: "attack",
    RETURN: "return",
};

const GUARD_TASK = {
    IDLE: "idle",
    WARNING_AIM: "warning_aim",
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
    return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
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

        this.controllerManager = createGuardControllerManager({
            chooseController: (post) => this.chooseController(post),
            isValidPlayer,
            getPlayerById,
            log: this.log,
            timers: {
                switchCooldownMs: 400,
                switchAckTimeoutMs: 2200,
                maxSwitchAttempts: 3,
            },
            onControllerAssigned: (post, owner) => this.applyControllerAssignment(post, owner),
            onNoController: (post, reason) => this.onNoController(post, reason),
            onSwitchReady: (post) => this.onControllerReady(post),
        });
    }

    async initialize() {
        if (this.isInitialized) return;
        await this.ensureDbSchema();
        const loaded = await this.loadPostsFromDb();
        if (!loaded) {
            this.initPosts();
            for (const post of this.posts.values()) await this.savePostToDb(post.id);
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
            warningPrevDistToStopZone: Number.MAX_SAFE_INTEGER,
            attackStartedAt: 0,
            targetOutsidePursuitSince: 0,
            streamOwnerId: null,
            controllerRid: null,
            playerSeenAt: new Map(),
            checkingGraceUntil: 0,
            ctrlVer: 0,
            controllerAckVer: 0,
            switching: false,
            switchStartedAt: 0,
            switchReason: null,
            switchAttempts: 0,
            nextOwnerReselectAt: 0,
            lastControllerSwitchAt: 0,
            lastControllerHeartbeatAt: 0,
            pendingMovementCommand: null,
            pendingCombatCommand: null,
            actionSeq: 0,
            lastTaskType: GUARD_TASK.IDLE,
            lastTaskData: {},
            lastTaskAt: Date.now(),
            poseRuntime: new Map(),
            lastPoseSyncAt: 0,
            lastControllerCommandAt: 0,
            lastControllerCommandKey: "",
        };
    }

    start() {
        if (this.tickTimer) return;
        this.log(`controller start posts=${this.posts.size}`);
        this.tickTimer = setInterval(() => this.tick(), this.config.tickMs || 300);
    }

    stop() {
        if (!this.tickTimer) return;
        clearInterval(this.tickTimer);
        this.tickTimer = null;
    }

    shutdown() {
        this.stop();
        for (const post of this.posts.values()) {
            if (post.leader) post.leader.shutdown();
            for (const guard of post.guards || []) guard.shutdown();
        }
        this.posts.clear();
        this.playerAggressiveUntil.clear();
    }

    onPlayerQuit(player) {
        if (!player) return;
        this.clearPlayerAggression(player.id);
        this.resetPostsByPlayer(player.id, "player-quit");
        for (const post of this.posts.values()) {
            if (Number(post.streamOwnerId) === Number(player.id)) {
                this.controllerManager.beginSwitch(post, "owner-quit");
            }
        }
    }

    onPlayerDeath(player) {
        if (!player) return;
        this.clearPlayerAggression(player.id);
        this.resetPostsByPlayer(player.id, "player-death");
        for (const post of this.posts.values()) {
            if (Number(post.streamOwnerId) === Number(player.id)) this.controllerManager.beginSwitch(post, "owner-death");
        }
    }

    onPlayerWeaponChange(player, oldWeapon, newWeapon) {
        if (!isValidPlayer(player)) return;
        if (Number(newWeapon) > 0) this.markAggressive(player.id);
    }

    onPlayerDamage(player, attacker) {
        if (!isValidPlayer(player)) return;
        if (!attacker || !mp.players.exists(attacker)) return;
        this.markAggressive(attacker.id);
    }

    onControllerAck(player, postId, ver) {
        if (!isValidPlayer(player)) return;
        const post = this.getPost(postId);
        if (!post) return;
        this.controllerManager.onControllerAck(post, player.id, Number(ver));
    }

    onControllerPose(player, postId, ver, unitsJson) {
        if (!isValidPlayer(player)) return;
        const post = this.getPost(postId);
        if (!post) return;
        if (Number(post.streamOwnerId) !== Number(player.id)) return;
        if (Number(post.ctrlVer || 0) !== Number(ver || 0)) return;

        let units = [];
        try {
            units = JSON.parse(String(unitsJson || "[]"));
        } catch {
            return;
        }
        if (!Array.isArray(units) || !units.length) return;

        const now = Date.now();
        for (const unitData of units) {
            const pedId = Number(unitData.pedId);
            if (!Number.isFinite(pedId)) continue;
            const unit = [post.leader, ...post.guards].find((u) => u && u.exists() && Number(u.ped.id) === pedId);
            if (!unit) continue;

            const key = unit.id;
            post.poseRuntime.set(key, {
                prevPos: {
                    x: Number(unitData.x) || 0,
                    y: Number(unitData.y) || 0,
                    z: Number(unitData.z) || 0,
                },
                prevHeading: Number(unitData.heading) || 0,
                prevPoseAt: Number(unitData.poseUpdatedAt) || now,
                velX: Number(unitData.velX) || 0,
                velY: Number(unitData.velY) || 0,
                velZ: Number(unitData.velZ) || 0,
                moveState: String(unitData.moveState || "stationary"),
                receivedAt: now,
                fromOwner: true,
            });
        }
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
        for (const post of this.posts.values()) this.tickPost(post, now);
    }

    tickPost(post, now) {
        post.leader.syncDeathIfNeeded(now);
        for (const guard of post.guards) guard.syncDeathIfNeeded(now);

        this.updateController(post);
        this.controllerManager.checkTimeout(post);
        this.publishAuthoritativePose(post, now);

        const target = this.resolveTargetPlayer(post);
        if (target && Number(post.targetPlayerId) !== Number(target.id)) {
            // В idle/return разрешаем мягкий retarget, чтобы второй игрок мог инициировать новую проверку.
            if (post.state === POST_STATE.IDLE || post.state === POST_STATE.RETURN || !getPlayerById(post.targetPlayerId)) {
                post.targetPlayerId = target.id;
            }
        }

        if (!target && post.state !== POST_STATE.IDLE) this.transition(post, POST_STATE.RETURN, "target-lost", now);

        switch (post.state) {
            case POST_STATE.IDLE:
                this.handleIdle(post, target, now);
                break;
            case POST_STATE.WARNING:
                this.handleWarning(post, target, now);
                break;
            case POST_STATE.CHECKING:
                this.handleChecking(post, target, now);
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
            post.targetPlayerLastPos = { x: target.position.x, y: target.position.y, z: target.position.z };
        }
    }

    handleIdle(post, target, now) {
        if (!target || this.isPlayerCleared(target.id)) return;
        const dist = dist3(target.position, zoneCenter(this.getPostZone(post)));
        const warnDistance = Number(post.cfg.warnDistance || this.config.defaultWarnDistance);
        if (dist <= warnDistance) {
            post.targetPlayerId = target.id;
            this.transition(post, POST_STATE.WARNING, "player-in-warn-distance", now);
        }
    }

    handleWarning(post, target, now) {
        if (!target) return this.transition(post, POST_STATE.RETURN, "no-target-warning", now);
        if (!isInsideZone(target.position, this.getPostZone(post))) return this.transition(post, POST_STATE.RETURN, "left-post-zone-warning", now);

        this.applyTaskWarning(post, target);

        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) return this.transition(post, POST_STATE.ATTACK, "warning-violation", now);

        const warningResponseMs = Number(post.cfg.warningResponseMs || this.config.warningResponseMs || 5000);
        const elapsed = now - (post.warningIssuedAt || now);
        if (isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) {
            post.targetStopStaySince = now;
            return this.transition(post, POST_STATE.CHECKING, "entered-stop-zone", now);
        }

        if (elapsed > warningResponseMs) return this.transition(post, POST_STATE.ATTACK, "did-not-enter-stop-zone-in-time", now);
    }

    handleChecking(post, target, now) {
        if (!target) return this.transition(post, POST_STATE.RETURN, "no-target-checking", now);
        if (!isInsideZone(target.position, this.getPostZone(post))) return this.transition(post, POST_STATE.RETURN, "left-post-zone-checking", now);

        this.applyTaskWarning(post, target);

        if (this.shouldTriggerAttack(post, target, now, { ignoreViolation: true })) return this.transition(post, POST_STATE.ATTACK, "checking-violation", now);
        if (!isInsideZoneWithTolerance(target.position, post.cfg.stopZone, 0.9)) return this.transition(post, POST_STATE.ATTACK, "left-stop-zone", now);
        if (now < (post.checkingGraceUntil || 0)) return;

        const checkDurationMs = Number(post.cfg.checkDurationMs || this.config.defaultCheckDurationMs);
        const stayedMs = now - (post.targetStopStaySince || now);
        if (stayedMs >= checkDurationMs) {
            this.markPlayerCleared(target.id, 20000);
            this.sendStatusText(post, "Все отлично, можете проезжать", 3000, target);
            this.sendWarningStop(target, post.id);
            this.transition(post, POST_STATE.RETURN, "check-success", now);
        }
    }

    handleAttack(post, target, now) {
        if (!target) return this.transition(post, POST_STATE.RETURN, "no-target-attack", now);
        if (!isInsideZone(target.position, this.getPostZone(post))) return this.transition(post, POST_STATE.RETURN, "target-escaped-post-zone", now);

        this.applyTaskAttack(post, target);

        const pursuitZone = this.getPursuitZone(post);
        if (!isInsideZone(target.position, pursuitZone)) {
            if (!post.targetOutsidePursuitSince) post.targetOutsidePursuitSince = now;
            if (now - post.targetOutsidePursuitSince > 2200) return this.transition(post, POST_STATE.RETURN, "target-left-guard-zone", now);
        } else {
            post.targetOutsidePursuitSince = 0;
        }
    }

    handleReturn(post, now) {
        this.applyTaskReturn(post);

        const arrived = [post.leader, ...post.guards].every((unit) => {
            if (!unit.exists()) return false;
            return dist3(unit.ped.position, unit.spawnPos) <= 2.0;
        });

        if (arrived || now - post.stateSince > 9000) {
            this.transition(post, POST_STATE.IDLE, "returned", now);
            post.targetPlayerId = null;
            post.targetPlayerLastPos = null;
            post.targetStopStaySince = 0;
            post.targetOutsidePursuitSince = 0;
        }
    }

    shouldTriggerAttack(post, target, now, options = {}) {
        if (!target || !mp.players.exists(target)) return false;
        if (this.isPlayerAggressive(target.id)) return true;
        if (this.isPlayerCleared(target.id)) return false;
        if (!options.ignoreViolation && post.cfg.violationZone && isInsideZone(target.position, post.cfg.violationZone)) return true;
        return false;
    }

    applyTaskWarning(post, target, force = false) {
        post.actionSeq = Number(post.actionSeq || 0) + 1;
        saveTask(post, GUARD_TASK.WARNING_AIM, { targetId: Number(target.id) });
        this.updateUnitState(post, "warning_aim", Number(target.id));
        this.queueControllerCommand(post, {
            command: "warning_aim",
            targetId: Number(target.id),
            actionSeq: post.actionSeq,
            force,
        });
    }

    applyTaskAttack(post, target, force = false) {
        post.actionSeq = Number(post.actionSeq || 0) + 1;
        saveTask(post, GUARD_TASK.ATTACK, { targetId: Number(target.id) });
        this.updateUnitState(post, "attack", Number(target.id));
        this.queueControllerCommand(post, {
            command: "attack",
            targetId: Number(target.id),
            actionSeq: post.actionSeq,
            force,
        });
    }

    applyTaskReturn(post, force = false) {
        post.actionSeq = Number(post.actionSeq || 0) + 1;
        const units = [post.leader, ...post.guards].map((unit) => ({
            pedId: unit.exists() ? Number(unit.ped.id) : -1,
            x: Number(unit.spawnPos.x) || 0,
            y: Number(unit.spawnPos.y) || 0,
            z: Number(unit.spawnPos.z) || 0,
            heading: Number(unit.spawnHeading) || 0,
        }));
        saveTask(post, GUARD_TASK.RETURN, { units });
        this.updateUnitState(post, "return", -1);
        this.queueControllerCommand(post, {
            command: "return",
            targetId: -1,
            units,
            actionSeq: post.actionSeq,
            force,
        });
    }

    applyTaskIdle(post, force = false) {
        post.actionSeq = Number(post.actionSeq || 0) + 1;
        clearTask(post);
        this.updateUnitState(post, "idle", -1);
        this.queueControllerCommand(post, {
            command: "idle",
            targetId: -1,
            actionSeq: post.actionSeq,
            force,
        });
    }

    updateUnitState(post, state, targetId = -1) {
        const now = Date.now();
        for (const unit of [post.leader, ...post.guards]) {
            if (!unit.exists()) continue;
            try { unit.ped.setVariable("guardState", state); } catch {}
            try { unit.ped.setVariable("guardTarget", Number(targetId)); } catch {}
            try { unit.ped.setVariable("guardTargetId", Number(targetId)); } catch {}
            try { unit.ped.setVariable("guardStartedAt", now); } catch {}
            try { unit.ped.setVariable("guardMoveState", state === "return" ? "moving" : "stationary"); } catch {}
            try { unit.ped.setVariable("guardOwnerId", Number(post.streamOwnerId == null ? -1 : post.streamOwnerId)); } catch {}
            try { unit.ped.setVariable("guardCtrlVer", Number(post.ctrlVer || 0)); } catch {}
            try { unit.ped.setVariable("guardActionSeq", Number(post.actionSeq || 0)); } catch {}
            try { unit.ped.setVariable("guardStateStartedAt", Number(post.stateSince || now)); } catch {}
        }
    }

    queueControllerCommand(post, cmd) {
        const payload = this.makeContinuityPayload(post, cmd.command, cmd.targetId, cmd.units || null, cmd.actionSeq);
        const commandKey = `${payload.command}:${payload.targetId}:${payload.ctrlVer}:${payload.actionSeq}:${JSON.stringify(payload.units || [])}`;
        const now = Date.now();

        if (!cmd.force && post.lastControllerCommandKey === commandKey && now - (post.lastControllerCommandAt || 0) < 350) {
            return;
        }

        post.lastControllerCommandKey = commandKey;
        post.lastControllerCommandAt = now;

        if (payload.command === "attack" || payload.command === "warning_aim") post.pendingCombatCommand = payload;
        else post.pendingMovementCommand = payload;

        const owner = getPlayerById(post.streamOwnerId);
        if (!isValidPlayer(owner) || Number(post.controllerAckVer) !== Number(post.ctrlVer)) return;
        owner.call("guardCheckpoint:controller:command", [payload]);
    }

    makeContinuityPayload(post, command, targetId, unitsOverride = null, actionSeqOverride = null) {
        const unitPayload = unitsOverride || [post.leader, ...post.guards]
            .filter((unit) => unit && unit.exists())
            .map((unit) => {
                const ped = unit.ped;
                return {
                    pedId: Number(ped.id),
                    role: unit.role,
                    state: String(ped.getVariable("guardState") || "idle"),
                    weaponHash: Number(unit.weaponHash) || 0,
                    returnX: Number(unit.spawnPos.x) || 0,
                    returnY: Number(unit.spawnPos.y) || 0,
                    returnZ: Number(unit.spawnPos.z) || 0,
                    returnHeading: Number(unit.spawnHeading) || 0,
                    poseX: Number(ped.getVariable("guardPoseX")) || Number(ped.position.x) || 0,
                    poseY: Number(ped.getVariable("guardPoseY")) || Number(ped.position.y) || 0,
                    poseZ: Number(ped.getVariable("guardPoseZ")) || Number(ped.position.z) || 0,
                    heading: Number(ped.getVariable("guardPoseHeading")) || 0,
                    velX: Number(ped.getVariable("guardVelX")) || 0,
                    velY: Number(ped.getVariable("guardVelY")) || 0,
                    velZ: Number(ped.getVariable("guardVelZ")) || 0,
                    moveState: String(ped.getVariable("guardMoveState") || "stationary"),
                    poseUpdatedAt: Number(ped.getVariable("guardPoseUpdatedAt")) || Date.now(),
                };
            });

        return {
            postId: post.id,
            command,
            targetId: Number(targetId),
            ctrlVer: Number(post.ctrlVer || 0),
            state: post.state,
            targetPlayerId: Number(post.targetPlayerId == null ? -1 : post.targetPlayerId),
            stateSince: Number(post.stateSince || 0),
            actionSeq: Number(actionSeqOverride == null ? post.actionSeq || 0 : actionSeqOverride),
            switchReason: post.switchReason || null,
            units: unitPayload,
            sentAt: Date.now(),
        };
    }

    transition(post, nextState, reason, now) {
        if (post.state === nextState) return;
        if (now < (post.stateCooldownUntil || 0)) return;

        const prev = post.state;
        post.state = nextState;
        post.stateSince = now;
        post.stateCooldownUntil = now + (this.config.transitionCooldownMs || 900);

        if (nextState === POST_STATE.WARNING) {
            post.warningIssuedAt = now;
            post.targetStopStaySince = 0;
            const target = this.resolveTargetPlayer(post);
            if (target) {
                this.sendWarningStart(target, post);
                post.warningPrevDistToStopZone = dist3(target.position, zoneCenter(post.cfg.stopZone));
            }
        }

        if (nextState === POST_STATE.CHECKING) {
            post.checkingGraceUntil = now + 1100;
            const target = getPlayerById(post.targetPlayerId);
            this.sendStatusText(post, "Идет досмотр, оставайтесь в зоне проверки (5 секунд)", 5000, target);
        }

        if (nextState === POST_STATE.ATTACK) {
            post.attackStartedAt = now;
            post.targetOutsidePursuitSince = 0;
            const target = getPlayerById(post.targetPlayerId);
            this.sendStatusText(post, "Нарушение! Охрана открывает огонь", 2500, target);
        }

        if (nextState === POST_STATE.IDLE || nextState === POST_STATE.RETURN) {
            const target = getPlayerById(post.targetPlayerId);
            this.sendWarningStop(target, post.id);
        }

        if (nextState === POST_STATE.IDLE) this.applyTaskIdle(post, true);
        if (nextState === POST_STATE.RETURN) this.applyTaskReturn(post, true);

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
        this.forEachPlayersInPost(post, (rec) => rec.call("guardCheckpoint:status:text", [post.id, text, durationMs]));
    }

    sendPhase(post, phase, durationMs, player = null) {
        if (isValidPlayer(player)) {
            player.call("guardCheckpoint:phase", [post.id, phase, Number(durationMs) || 0, Date.now()]);
            return;
        }
        this.forEachPlayersInPost(post, (rec) => rec.call("guardCheckpoint:phase", [post.id, phase, Number(durationMs) || 0, Date.now()]));
    }

    emitDebugToNearby(post, text) {
        if (!this.config.debug) return;
        const payload = `[${post.id}] ${text}`;
        this.forEachPlayersInPost(post, (player) => player.call("guardCheckpoint:debug", [payload]));
    }

    updateController(post) {
        const now = Date.now();
        const currentOwner = getPlayerById(post.streamOwnerId);
        const currentValid = isValidPlayer(currentOwner)
            && Number(currentOwner.dimension) === Number(post.cfg.dimension || 0)
            && isInsideZone(currentOwner.position, this.getPostZone(post));

        // Если текущий владелец жив, в нужном dimension и всё ещё в зоне поста —
        // НЕ перекидываем ownership.
        if (currentValid) return;

        // Во время активного handoff не стартуем новый без причины.
        if (post.switching) return;

        const nextOwner = this.chooseController(post);
        if (!nextOwner) {
            if (now < Number(post.nextOwnerReselectAt || 0)) return;
            post.nextOwnerReselectAt = now + 1200;
        } else {
            post.nextOwnerReselectAt = 0;
        }

        this.controllerManager.beginSwitch(post, currentValid ? "owner-keep" : "owner-reselect");
    }

    chooseController(post) {
        const candidates = [];
        const now = Date.now();
        this.forEachPlayersInPost(post, (player) => {
            if (!post.playerSeenAt.has(player.id)) post.playerSeenAt.set(player.id, now);
            const d = dist3(player.position, zoneCenter(this.getPostZone(post)));
            candidates.push({ player, dist: d, seenAt: post.playerSeenAt.get(player.id) || now });
        });

        if (!candidates.length) {
            const guardZone = post.cfg.guardZone || this.getPostZone(post);
            mp.players.forEach((player) => {
                if (!isValidPlayer(player)) return;
                if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
                if (!isInsideZone(player.position, guardZone)) return;
                if (!post.playerSeenAt.has(player.id)) post.playerSeenAt.set(player.id, now);
                const d = dist3(player.position, zoneCenter(this.getPostZone(post)));
                candidates.push({ player, dist: d, seenAt: post.playerSeenAt.get(player.id) || now });
            });
        }

        for (const pid of Array.from(post.playerSeenAt.keys())) {
            if (!candidates.some((v) => Number(v.player.id) === Number(pid))) post.playerSeenAt.delete(pid);
        }

        if (!candidates.length) return null;

        // 1. Если текущий controller всё ещё среди кандидатов — оставляем его.
        const current = candidates.find((v) => Number(v.player.id) === Number(post.streamOwnerId));
        if (current) return current.player;

        // 2. Иначе берём самого "старого" в зоне, а не самого ближнего.
        candidates.sort((a, b) => a.seenAt - b.seenAt || a.dist - b.dist);
        return candidates[0].player;
    }

    applyControllerAssignment(post, owner) {
        for (const unit of [post.leader, ...post.guards]) {
            if (!unit.exists()) continue;
            try { unit.ped.controller = owner; } catch {}
            try { unit.ped.setVariable("streamOwnerId", Number(owner.id)); } catch {}
            try { unit.ped.setVariable("ctrlVer", Number(post.ctrlVer || 0)); } catch {}
            try { unit.ped.setVariable("controllerRid", Number(owner.id)); } catch {}
            try { unit.ped.setVariable("controllerAckVer", Number(post.controllerAckVer || 0)); } catch {}
            try { unit.ped.setVariable("guardCtrlState", "switching"); } catch {}
        }
    }

    onNoController(post, reason) {
        for (const unit of [post.leader, ...post.guards]) {
            if (!unit.exists()) continue;
            try { unit.ped.controller = undefined; } catch {}
            try { unit.ped.setVariable("streamOwnerId", -1); } catch {}
            try { unit.ped.setVariable("controllerRid", -1); } catch {}
            try { unit.ped.setVariable("guardCtrlState", "detached"); } catch {}
            try { unit.ped.setVariable("guardMoveState", "stationary"); } catch {}
        }
        this.log(`post=${post.id} no-controller reason=${reason}`);
    }

    onControllerReady(post) {
        for (const unit of [post.leader, ...post.guards]) {
            if (!unit.exists()) continue;
            try { unit.ped.setVariable("controllerAckVer", Number(post.controllerAckVer || 0)); } catch {}
            try { unit.ped.setVariable("guardCtrlState", "ready"); } catch {}
        }

        const owner = getPlayerById(post.streamOwnerId);
        if (!isValidPlayer(owner)) return;

        const continuity = this.makeContinuityPayload(
            post,
            post.lastTaskType === GUARD_TASK.WARNING_AIM ? "warning_aim"
                : post.lastTaskType === GUARD_TASK.ATTACK ? "attack"
                    : post.lastTaskType === GUARD_TASK.RETURN ? "return" : "idle",
            Number((post.lastTaskData || {}).targetId || -1),
            (post.lastTaskData || {}).units || null
        );
        continuity.recovery = true;
        owner.call("guardCheckpoint:controller:command", [continuity]);

        restoreTask(post, {
            [GUARD_TASK.WARNING_AIM]: () => {
                const target = getPlayerById(Number((post.lastTaskData || {}).targetId));
                if (target) this.applyTaskWarning(post, target, true);
            },
            [GUARD_TASK.ATTACK]: () => {
                const target = getPlayerById(Number((post.lastTaskData || {}).targetId));
                if (target) this.applyTaskAttack(post, target, true);
            },
            [GUARD_TASK.RETURN]: () => this.applyTaskReturn(post, true),
            [GUARD_TASK.IDLE]: () => this.applyTaskIdle(post, true),
        });

        if (post.pendingCombatCommand) owner.call("guardCheckpoint:controller:command", [post.pendingCombatCommand]);
        if (post.pendingMovementCommand) owner.call("guardCheckpoint:controller:command", [post.pendingMovementCommand]);
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
        if (now - (post.lastPoseSyncAt || 0) < 120) return;
        post.lastPoseSyncAt = now;

        for (const unit of [post.leader, ...post.guards]) {
            if (!unit || !unit.exists()) continue;
            const ped = unit.ped;
            const pos = ped.position;
            const heading = Number(ped.getHeading ? ped.getHeading() : unit.spawnHeading) || 0;
            const key = unit.id;
            const prev = post.poseRuntime.get(key) || {
                prevPos: { x: pos.x, y: pos.y, z: pos.z },
                prevHeading: heading,
                prevPoseAt: now,
                velX: 0,
                velY: 0,
                velZ: 0,
                moveState: "stationary",
            };
            const ownerFresh = prev && prev.fromOwner && (now - Number(prev.receivedAt || 0) < 700);
            const authPos = ownerFresh ? prev.prevPos : { x: pos.x, y: pos.y, z: pos.z };
            const authHeading = ownerFresh ? Number(prev.prevHeading || heading) : heading;
            let velX;
            let velY;
            let velZ;
            let moveState;

            if (ownerFresh) {
                velX = Number(prev.velX) || 0;
                velY = Number(prev.velY) || 0;
                velZ = Number(prev.velZ) || 0;
                moveState = String(prev.moveState || "stationary");
            } else {
                const dt = Math.max(0.05, (now - Number(prev.prevPoseAt || now)) / 1000);
                velX = (Number(pos.x) - Number(prev.prevPos.x || pos.x)) / dt;
                velY = (Number(pos.y) - Number(prev.prevPos.y || pos.y)) / dt;
                velZ = (Number(pos.z) - Number(prev.prevPos.z || pos.z)) / dt;
                const speed = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
                moveState = speed > 0.08 ? "moving" : "stationary";
            }

            post.poseRuntime.set(key, {
                prevPos: { ...authPos },
                prevHeading: authHeading,
                prevPoseAt: now,
                velX,
                velY,
                velZ,
                moveState,
                receivedAt: now,
                fromOwner: ownerFresh,
            });

            const targetId = Number(post.targetPlayerId == null ? -1 : post.targetPlayerId);
            const guardState = String(ped.getVariable("guardState") || "idle");
            try { ped.setVariable("guardPoseX", Number(authPos.x) || 0); } catch {}
            try { ped.setVariable("guardPoseY", Number(authPos.y) || 0); } catch {}
            try { ped.setVariable("guardPoseZ", Number(authPos.z) || 0); } catch {}
            try { ped.setVariable("guardPoseHeading", authHeading); } catch {}
            try { ped.setVariable("guardPoseUpdatedAt", now); } catch {}
            try { ped.setVariable("guardVelX", Number(velX) || 0); } catch {}
            try { ped.setVariable("guardVelY", Number(velY) || 0); } catch {}
            try { ped.setVariable("guardVelZ", Number(velZ) || 0); } catch {}
            try { ped.setVariable("guardMoveState", moveState); } catch {}
            try { ped.setVariable("guardTargetId", targetId); } catch {}
            try { ped.setVariable("guardTarget", targetId); } catch {}
            try { ped.setVariable("guardState", guardState); } catch {}
            try { ped.setVariable("guardOwnerId", Number(post.streamOwnerId == null ? -1 : post.streamOwnerId)); } catch {}
            try { ped.setVariable("guardCtrlVer", Number(post.ctrlVer || 0)); } catch {}
            try { ped.setVariable("guardActionSeq", Number(post.actionSeq || 0)); } catch {}
            try { ped.setVariable("guardPostState", String(post.state || "idle")); } catch {}
            try { ped.setVariable("guardStateStartedAt", Number(post.stateSince || now)); } catch {}
        }
    }

    resolveTargetPlayer(post) {
        const candidates = [];
        const center = zoneCenter(this.getPostZone(post));
        const violationZone = post.cfg.violationZone || null;

        mp.players.forEach((player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
            if (!isInsideZone(player.position, this.getPostZone(post))) return;

            const distance = dist3(player.position, center);
            const aggressive = this.isPlayerAggressive(player.id);
            const cleared = this.isPlayerCleared(player.id);
            const violation = violationZone ? isInsideZone(player.position, violationZone) : false;
            const priority = aggressive || violation ? 0 : cleared ? 3 : 1;
            candidates.push({ player, distance, priority, aggressive, cleared, violation });
        });

        if (!candidates.length) return null;
        candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
        const best = candidates[0].player;

        if (post.targetPlayerId == null) return best;
        const current = getPlayerById(post.targetPlayerId);
        if (!isValidPlayer(current) || Number(current.dimension) !== Number(post.cfg.dimension || 0)) return best;
        if (!isInsideZone(current.position, this.getPostZone(post))) return best;

        const currentInfo = candidates.find((c) => Number(c.player.id) === Number(current.id));
        if (!currentInfo) return best;

        // Если текущий очищен и появился неочищенный кандидат — переключаем таргет.
        if (currentInfo.cleared && !candidates[0].cleared) return best;
        // Если появился агрессивный/нарушитель — переключаем на него сразу.
        if ((candidates[0].aggressive || candidates[0].violation) && Number(candidates[0].player.id) !== Number(current.id)) {
            return candidates[0].player;
        }

        return current;
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
        return !!loaded;
    }
}

module.exports = {
    CheckpointGuardController,
    POST_STATE,
};
