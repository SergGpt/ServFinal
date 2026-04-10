"use strict";

function toVector3(src = {}) {
    return new mp.Vector3(Number(src.x) || 0, Number(src.y) || 0, Number(src.z) || 0);
}

function safeCall(fn, ...args) {
    try {
        if (typeof fn === "function") fn(...args);
    } catch {}
}

function method(obj, name) {
    if (!obj) return null;
    const fn = obj[name];
    if (typeof fn !== "function") return null;
    return fn.bind(obj);
}

class GuardNpc {
    constructor(postConfig, npcConfig, role, log, respawnMs) {
        this.postConfig = postConfig;
        this.config = npcConfig;
        this.role = role;
        this.log = log;
        this.respawnMs = Math.max(1000, Number(respawnMs) || 15000);

        this.id = `${postConfig.id}:${role}:${npcConfig.id || Math.random().toString(36).slice(2, 8)}`;
        this.spawnPos = toVector3(npcConfig.spawn);
        this.spawnHeading = Number(npcConfig.heading) || 0;
        this.modelHash = mp.joaat(npcConfig.model || "s_m_y_marine_01");
        this.weaponHash = npcConfig.weaponHash ? mp.joaat(npcConfig.weaponHash) : 0;

        this.ped = null;
        this.deadAt = 0;
        this.respawnAt = 0;
        this.respawnTimer = null;
        this.lastOrderAt = 0;
        this.lastOrderName = "none";
        this.spawnedAt = 0;
        this.initializedAt = 0;
        this.hasSeenAliveHealth = false;
        this.spawnGraceMs = Math.max(2000, Number(postConfig.spawnGraceMs) || 3500);
        this.initHealth = Math.max(100, Number(postConfig.npcHealth) || 250);
        this.initArmor = Math.max(0, Number(postConfig.npcArmor) || 0);

        this.spawn();
    }

    exists() {
        return !!(this.ped && mp.peds.exists(this.ped));
    }

    spawn() {
        this.destroy();
        this.spawnedAt = Date.now();
        this.initializedAt = 0;
        this.hasSeenAliveHealth = false;

        this.ped = mp.peds.new(this.modelHash, this.spawnPos, {
            heading: this.spawnHeading,
            dimension: Number(this.postConfig.dimension) || 0,
            streamDistance: Number(this.postConfig.npcStreamDistance) || Number(this.postConfig.streamDistance) || 220,
        });

        const existsNow = this.exists();
        this.log(`spawn npc=${this.id} exists=${existsNow} model=${this.modelHash} graceMs=${this.spawnGraceMs}`);
        if (!existsNow) return;

        safeCall(method(this.ped, "setVariable"), "guardPostId", this.postConfig.id);
        safeCall(method(this.ped, "setVariable"), "guardRole", this.role);
        safeCall(method(this.ped, "setVariable"), "guardNpcId", this.id);
        safeCall(method(this.ped, "setVariable"), "guardState", "idle");

        if (this.weaponHash) {
            safeCall(method(this.ped, "giveWeapon"), this.weaponHash, 9999);
            safeCall(method(this.ped, "setCurrentWeapon"), this.weaponHash);
        }

        this.initializePedCombat();
        this.initializedAt = Date.now();
        this.goIdle();
        this.log(`spawned npc=${this.id} health=${Number(this.ped.health) || 0} initAt=${this.initializedAt}`);
    }

    destroy() {
        if (this.exists()) {
            safeCall(method(this.ped, "destroy"));
        }
        this.ped = null;
        if (this.respawnTimer) {
            clearTimeout(this.respawnTimer);
            this.respawnTimer = null;
        }
    }

    initializePedCombat() {
        if (!this.exists()) return;

        safeCall(method(this.ped, "setHealth"), this.initHealth);
        safeCall(method(this.ped, "setMaxHealth"), this.initHealth);
        safeCall(method(this.ped, "setArmour"), this.initArmor);

        try { this.ped.health = this.initHealth; } catch {}
        try { this.ped.maxHealth = this.initHealth; } catch {}
        try { this.ped.armour = this.initArmor; } catch {}

        safeCall(method(this.ped, "setCanBeDamaged"), true);
        safeCall(method(this.ped, "setCanRagdoll"), true);
        safeCall(method(this.ped, "setFleeAttributes"), 0, false);
        safeCall(method(this.ped, "setCombatAttributes"), 46, true);
        safeCall(method(this.ped, "setCombatAttributes"), 5, true);
        safeCall(method(this.ped, "setCombatAbility"), 2);
        safeCall(method(this.ped, "setCombatRange"), 2);
        safeCall(method(this.ped, "setCombatMovement"), 2);
        safeCall(method(this.ped, "setConfigFlag"), 17, true);
        safeCall(method(this.ped, "setConfigFlag"), 281, true);
        safeCall(method(this.ped, "setBlockingOfNonTemporaryEvents"), true);
    }

    markDead(now, reason = "unknown") {
        if (this.respawnTimer) return;
        this.deadAt = now;
        this.respawnAt = now + this.respawnMs;
        if (this.exists()) {
            safeCall(method(this.ped, "setVariable"), "guardState", "dead");
            safeCall(method(this.ped, "clearTasks"));
            safeCall(method(this.ped, "destroy"));
            this.ped = null;
        }

        this.log(`npc=${this.id} dead reason=${reason}; respawn in ${this.respawnMs}ms`);
        this.respawnTimer = setTimeout(() => {
            this.respawnTimer = null;
            this.respawnAt = 0;
            this.spawn();
        }, this.respawnMs);
    }

    syncDeathIfNeeded(now) {
        const existsNow = this.exists();
        if (!existsNow) {
            this.log(`sync npc=${this.id} exists=false sinceSpawn=${now - (this.spawnedAt || now)}ms respawnTimer=${!!this.respawnTimer}`);
            return;
        }

        const sinceSpawnMs = now - (this.spawnedAt || now);
        const hp = Number(this.ped.health) || 0;
        const graceActive = sinceSpawnMs < this.spawnGraceMs;

        this.log(`sync npc=${this.id} exists=true hp=${hp} sinceSpawn=${sinceSpawnMs}ms grace=${graceActive} seenAlive=${this.hasSeenAliveHealth}`);

        if (hp > 0) {
            this.hasSeenAliveHealth = true;
            return;
        }

        if (graceActive) {
            this.log(`sync npc=${this.id} hp<=0 ignored (spawn grace)`);
            return;
        }

        if (!this.hasSeenAliveHealth && sinceSpawnMs < this.spawnGraceMs * 3) {
            this.log(`sync npc=${this.id} hp<=0 ignored (not stabilized yet), reinit health`);
            this.initializePedCombat();
            return;
        }

        this.markDead(now, `hp<=0 sinceSpawn=${sinceSpawnMs}ms seenAlive=${this.hasSeenAliveHealth}`);
    }

    shouldSendOrder(orderName, minDelayMs = 900) {
        const now = Date.now();
        if (this.lastOrderName === orderName && now - this.lastOrderAt < minDelayMs) {
            return false;
        }
        this.lastOrderName = orderName;
        this.lastOrderAt = now;
        return true;
    }

    setFacing(pos) {
        if (!this.exists() || !pos) return;
        const dx = Number(pos.x) - this.spawnPos.x;
        const dy = Number(pos.y) - this.spawnPos.y;
        const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
        safeCall(method(this.ped, "setHeading"), heading - 90.0);
    }

    playStopAnim() {
        if (!this.exists()) return;
        if (!this.shouldSendOrder("warning-stop", 1500)) return;
        safeCall(method(this.ped, "clearTasks"));
        safeCall(method(this.ped, "taskStartScenarioInPlace"), "WORLD_HUMAN_COP_IDLES", 0, true);
    }

    goIdle() {
        if (!this.exists()) return;
        if (!this.shouldSendOrder("idle", 1200)) return;
        safeCall(method(this.ped, "clearTasks"));
        safeCall(method(this.ped, "taskGoToCoordAnyMeans"), this.spawnPos.x, this.spawnPos.y, this.spawnPos.z, 1.0, 0, false, 786603, 1.0);
        safeCall(method(this.ped, "setHeading"), this.spawnHeading);
        safeCall(method(this.ped, "setVariable"), "guardState", "idle");
    }

    attack(targetPlayer) {
        if (!this.exists() || !targetPlayer || !mp.players.exists(targetPlayer)) return;
        if (!this.shouldSendOrder(`attack:${targetPlayer.id}`, 850)) return;
        safeCall(method(this.ped, "setVariable"), "guardState", "attack");
        safeCall(method(this.ped, "taskCombat"), targetPlayer.handle, 0, 16);
    }

    aimAt(targetPlayer) {
        if (!this.exists() || !targetPlayer || !mp.players.exists(targetPlayer)) return;
        if (!this.shouldSendOrder(`aim:${targetPlayer.id}`, 1000)) return;
        safeCall(method(this.ped, "setVariable"), "guardState", "warning_aim");
        safeCall(method(this.ped, "clearTasks"));
        safeCall(method(this.ped, "taskAimGunAt"), targetPlayer.handle, 1200, false);
    }

    forceReturn() {
        if (!this.exists()) return;
        if (!this.shouldSendOrder("force-return", 1200)) return;
        safeCall(method(this.ped, "clearTasks"));
        safeCall(method(this.ped, "taskGoStraightToCoord"), this.spawnPos.x, this.spawnPos.y, this.spawnPos.z, 2.2, -1, this.spawnHeading, 0.05);
        safeCall(method(this.ped, "setVariable"), "guardState", "return");
    }

    isOutsideLimits(guardZone, maxChaseDistance) {
        if (!this.exists()) return false;

        const pos = this.ped.position;
        const dx = pos.x - this.spawnPos.x;
        const dy = pos.y - this.spawnPos.y;
        const dz = pos.z - this.spawnPos.z;
        const distSpawn = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const gx = pos.x - guardZone.center.x;
        const gy = pos.y - guardZone.center.y;
        const gz = pos.z - guardZone.center.z;
        const distZone = Math.sqrt(gx * gx + gy * gy + gz * gz);

        return distSpawn > maxChaseDistance || distZone > guardZone.radius;
    }

    shutdown() {
        this.destroy();
        this.deadAt = 0;
        this.respawnAt = 0;
        this.lastOrderAt = 0;
        this.lastOrderName = "none";
        this.spawnedAt = 0;
        this.initializedAt = 0;
        this.hasSeenAliveHealth = false;
    }
}

module.exports = {
    GuardNpc,
    toVector3,
};
