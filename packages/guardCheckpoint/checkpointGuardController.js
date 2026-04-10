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
        this.tickTimer = null;

        this.notifs = call("notifications");

        this.log = (msg) => {
            if (!this.config.debug) return;
            console.log(`[GUARD-CHECKPOINT] ${msg}`);
        };

        this.initPosts();
    }

    initPosts() {
        for (const rawPost of this.config.posts || []) {
            const post = this.createPostRuntime(rawPost);
            this.posts.set(post.id, post);
            this.log(`post initialized id=${post.id}`);
        }
    }

    createPostRuntime(rawPost) {
        const mergedPost = {
            ...rawPost,
            npcStreamDistance: Number(rawPost.npcStreamDistance || this.config.npcStreamDistance || 220),
            spawnGraceMs: Number(rawPost.spawnGraceMs || this.config.spawnGraceMs || 3500),
            npcHealth: Number(rawPost.npcHealth || this.config.npcHealth || 250),
            npcArmor: Number(rawPost.npcArmor || this.config.npcArmor || 0),
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
        const dist = dist3(target.position, post.cfg.guardZone.center);
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

        this.ensureLeaderWarningBehavior(post, target);

        if (this.shouldTriggerAttack(post, target, now)) {
            this.transition(post, POST_STATE.ATTACK, "warning-violation", now);
            return;
        }

        const elapsed = now - (post.warningIssuedAt || now);
        const distToStop = dist3(target.position, post.cfg.stopZone.center);
        const prevDistToStop = Number(post.warningPrevDistToStopZone || distToStop);
        const moved = prevTargetPos ? dist3(target.position, prevTargetPos) : 0;
        const movementThreshold = Number(this.config.warningMoveTolerance || 0.09);
        const progressEpsilon = Number(this.config.stopZoneProgressEpsilon || 0.03);

        const distToLeader = post.leader && post.leader.exists() ? dist3(target.position, post.leader.ped.position) : Number.MAX_SAFE_INTEGER;
        const closestGuardDist = post.guards.reduce((min, guard) => {
            if (!guard.exists()) return min;
            return Math.min(min, dist3(target.position, guard.ped.position));
        }, Number.MAX_SAFE_INTEGER);

        const advanceTolerance = Number(this.config.warningAdvanceTolerance || 0.6);
        if (distToLeader < (post.warningStartDistToLeader - advanceTolerance)) {
            this.transition(post, POST_STATE.ATTACK, "advanced-to-leader-after-warning", now);
            return;
        }
        if (closestGuardDist < (post.warningStartClosestGuardDist - advanceTolerance)) {
            this.transition(post, POST_STATE.ATTACK, "advanced-to-guard-after-warning", now);
            return;
        }

        if (inSphere(target.position, post.cfg.stopZone)) {
            post.targetStopStaySince = now;
            this.transition(post, POST_STATE.CHECKING, "entered-stop-zone", now);
            return;
        }

        if (moved > movementThreshold && (distToStop > prevDistToStop - progressEpsilon)) {
            this.transition(post, POST_STATE.ATTACK, "moved-without-going-to-stop-zone", now);
            return;
        }

        if (elapsed > Number(this.config.warningResponseMs || 2500)) {
            this.transition(post, POST_STATE.ATTACK, "did-not-enter-stop-zone-in-time", now);
        }

        post.warningPrevDistToStopZone = distToStop;
    }

    handleChecking(post, target, prevTargetPos, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-checking", now);
            return;
        }

        if (this.shouldTriggerAttack(post, target, now)) {
            this.transition(post, POST_STATE.ATTACK, "checking-violation", now);
            return;
        }

        if (!inSphere(target.position, post.cfg.stopZone)) {
            this.transition(post, POST_STATE.ATTACK, "left-stop-zone", now);
            return;
        }

        const moved = prevTargetPos ? dist3(target.position, prevTargetPos) : 0;
        if (moved > Number(this.config.movementThreshold || 0.08)) {
            this.log(`post=${post.id} movement during check=${moved.toFixed(3)} reset timer target=${target.name}[${target.id}]`);
            post.targetStopStaySince = now;
            if (moved > Number(this.config.movementThreshold || 0.08) * 2.2) {
                this.transition(post, POST_STATE.ATTACK, "movement-during-check", now);
            }
            return;
        }

        const checkDurationMs = Number(post.cfg.checkDurationMs || this.config.defaultCheckDurationMs);
        const stayedMs = now - (post.targetStopStaySince || now);
        if (stayedMs >= checkDurationMs) {
            this.sendWarningStop(target, post.id);
            this.transition(post, POST_STATE.RETURN, "check-success", now);
        }
    }

    handleAttack(post, target, now) {
        if (!target) {
            this.transition(post, POST_STATE.RETURN, "no-target-attack", now);
            return;
        }

        post.leader.attack(target);
        for (const guard of post.guards) guard.attack(target);

        const maxChaseDistance = Number(post.cfg.maxChaseDistance || this.config.defaultMaxChaseDistance);
        const allUnits = [post.leader, ...post.guards];
        for (const unit of allUnits) {
            if (unit.isOutsideLimits(post.cfg.guardZone, maxChaseDistance)) {
                this.log(`post=${post.id} unit=${unit.id} outside limits -> force return`);
                unit.forceReturn();
            }
        }

        if (!inSphere(target.position, post.cfg.guardZone)) {
            this.transition(post, POST_STATE.RETURN, "target-left-guard-zone", now);
        }
    }

    handleReturn(post, now) {
        post.leader.goIdle();
        for (const guard of post.guards) guard.goIdle();

        const arrived = [post.leader, ...post.guards].every((unit) => {
            if (!unit.exists()) return false;
            return dist3(unit.ped.position, unit.spawnPos) <= 2.0;
        });

        if (arrived || now - post.stateSince > 6000) {
            this.transition(post, POST_STATE.IDLE, "returned", now);
            post.targetPlayerId = null;
            post.targetPlayerLastPos = null;
            post.targetStopStaySince = 0;
        }
    }

    shouldTriggerAttack(post, target) {
        if (!target || !mp.players.exists(target)) return false;
        if (this.isPlayerAggressive(target.id)) {
            this.log(`post=${post.id} attack reason=aggressive target=${target.name}[${target.id}]`);
            return true;
        }

        if (post.cfg.violationZone && inSphere(target.position, post.cfg.violationZone)) {
            this.log(`post=${post.id} attack reason=violation-zone target=${target.name}[${target.id}]`);
            return true;
        }

        return false;
    }

    ensureLeaderWarningBehavior(post, target) {
        if (!post.leader) return;
        post.leader.setFacing(target.position);
        post.leader.playStopAnim();
        post.leader.aimAt(target);
        for (const guard of post.guards) {
            guard.aimAt(target);
        }
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

        mp.players.forEachInRange(post.cfg.guardZone.center, Number(post.cfg.guardZone.radius || 1), (player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;

            const d = dist3(player.position, post.cfg.guardZone.center);
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
                post.warningPrevDistToStopZone = dist3(target.position, post.cfg.stopZone.center);
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
        }

        if (nextState === POST_STATE.ATTACK) {
            const target = this.resolveTargetPlayer(post);
            if (target) this.sendWarningStop(target, post.id);
        }

        if (nextState === POST_STATE.IDLE || nextState === POST_STATE.RETURN) {
            const target = this.resolveTargetPlayer(post);
            if (target) this.sendWarningStop(target, post.id);
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
        }]);
        if (this.notifs && !this.notifs.isEmpty) {
            this.notifs.warning(player, "Остановитесь и зайдите в зону досмотра", "Пост охраны");
        }
        this.log(`warning start sent to ${player.name}[${player.id}] post=${post.id}`);
    }

    sendWarningStop(player, postId) {
        if (!isValidPlayer(player)) return;
        player.call("guardCheckpoint:warning:stop", [postId]);
        this.log(`warning stop sent to ${player.name}[${player.id}] post=${postId}`);
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

    emitDebugToNearby(post, text) {
        if (!this.config.debug) return;
        const payload = `[${post.id}] ${text}`;
        mp.players.forEachInRange(post.cfg.guardZone.center, Number(post.cfg.guardZone.radius || 1), (player) => {
            if (!isValidPlayer(player)) return;
            if (Number(player.dimension) !== Number(post.cfg.dimension || 0)) return;
            player.call("guardCheckpoint:debug", [payload]);
        });
    }
}

module.exports = {
    CheckpointGuardController,
    POST_STATE,
};
