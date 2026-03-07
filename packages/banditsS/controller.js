const { ZOMBIE_CONFIG } = require('./zombie.config');
const {
    createLogger,
    dist3,
    getPlayerById,
    isPlayerInZone,
    playersInZone,
    isPlayerValidTarget,
    chooseNearestTarget,
} = require('./zombie.utils');
const { ZOMBIE_STATE, setZombieState } = require('./zombie.state');

const zlog = createLogger(ZOMBIE_CONFIG.debug, 'ZCTRL');

const zones = new Map();
const zombies = new Map();
const ctrlVerMap = new Map();

ZOMBIE_CONFIG.zones.forEach((z) => {
    zones.set(z.id, {
        ...z,
        zombieIds: [],
        active: false,
        activatorRid: null,
    });
});

function randomModel() {
    const arr = ZOMBIE_CONFIG.models;
    return arr[(Math.random() * arr.length) | 0] || 'u_m_y_zombie_01';
}

function nextZid() {
    let zid = (Math.random() * 1e9) | 0;
    while (zombies.has(zid)) zid = (Math.random() * 1e9) | 0;
    return zid;
}

function chooseController(zone, ped, preferredPlayer = null) {
    if (preferredPlayer && isPlayerValidTarget(mp, preferredPlayer, zone)) {
        return preferredPlayer;
    }

    const plist = playersInZone(mp, zone);
    if (!plist.length) return null;

    let best = null;
    let bestDist = Infinity;

    plist.forEach((p) => {
        if (!mp.players.exists(p)) return;
        const d = dist3(p.position, ped.position);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    });

    return best;
}

function assignController(st, reason = 'periodic') {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;

    const zone = zones.get(st.zoneId);
    if (!zone) return;

    const target = getPlayerById(mp, st.ownerRid);
    const controller = chooseController(zone, st.ped, target);
    const zid = st.zid;

    if (!controller) {
        st.ped.controller = undefined;
        st.ped.setVariable('controllerRid', -1);
        st.ped.setVariable('ctrlState', 'no-controller');
        return;
    }

    const currentRid = Number(st.ped.getVariable('controllerRid'));
    if (currentRid === controller.id && st.controllerRid === controller.id) {
        return;
    }

    const ver = (ctrlVerMap.get(zid) || 0) + 1;
    ctrlVerMap.set(zid, ver);

    st.ped.dimension = controller.dimension;
    st.ped.controller = controller;
    st.ped.setVariable('controllerRid', controller.id);
    st.ped.setVariable('ctrlVer', ver);
    st.ped.setVariable('ctrlState', 'ready');

    st.controllerRid = controller.id;
    st.lastHeartbeatAt = Date.now();

    try {
        controller.call('z:assignController', [zid, ver, st.ped.handle]);
    } catch {}

    zlog(`assignController zid=${zid}: controller=${controller.id} ver=${ver} reason=${reason}`);
}

function sendFollowToOwner(st) {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;

    const owner = getPlayerById(mp, st.ownerRid);
    if (!owner || !mp.players.exists(owner)) return;

    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    if (st.lastFollowTargetRid === owner.id && Date.now() - (st.lastFollowSentAt || 0) < ZOMBIE_CONFIG.ai.skipDuplicateFollowMs) {
        return;
    }

    const payload = { rid: owner.id, speed: ZOMBIE_CONFIG.stats.moveSpeed, stopDist: ZOMBIE_CONFIG.stats.stopDistance };

    try {
        ctrl.call('z:executeCommand', [st.zid, 'follow', JSON.stringify(payload)]);
    } catch {}

    try {
        st.ped.setVariable('command', 'follow');
        st.ped.setVariable('commandExtra', payload);
    } catch {}

    st.lastFollowTargetRid = owner.id;
    st.lastFollowSentAt = Date.now();

    const now = Date.now();
    if (!st.lastCmdLogAt || now - st.lastCmdLogAt >= ZOMBIE_CONFIG.timers.cmdDebugMs) {
        st.lastCmdLogAt = now;
        zlog(`cmd attack/follow zid=${st.zid} -> targetRid=${owner.id}`);
    }
}

function sendIdleToController(st, reason = 'no-target') {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;

    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    try {
        ctrl.call('z:executeCommand', [st.zid, 'idle', JSON.stringify({ reason })]);
    } catch {}

    try {
        st.ped.setVariable('command', 'idle');
        st.ped.setVariable('commandExtra', { reason });
    } catch {}

    const now = Date.now();
    if (!st.lastCmdLogAt || now - st.lastCmdLogAt >= ZOMBIE_CONFIG.timers.cmdDebugMs) {
        st.lastCmdLogAt = now;
        zlog(`cmd idle zid=${st.zid} reason=${reason}`);
    }
}

function spawnZombie(zone, owner) {
    const zid = nextZid();
    const angle = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * Math.max(4, zone.radius - 10);
    const x = zone.x + Math.cos(angle) * d;
    const y = zone.y + Math.sin(angle) * d;
    const z = zone.z;

    const ped = mp.peds.new(mp.joaat(randomModel()), new mp.Vector3(x, y, z), {
        dynamic: true,
        invincible: false,
    });

    ped.setVariable('zoneId', zone.id);
    ped.setVariable('zid', zid);
    ped.setVariable('command', 'idle');
    ped.setVariable('commandExtra', null);
    ped.setVariable('deadFlag', false);
    ped.setVariable('zState', ZOMBIE_STATE.IDLE);

    try {
        ped.health = ZOMBIE_CONFIG.stats.hp;
        if (typeof ped.setHealth === 'function') ped.setHealth(ZOMBIE_CONFIG.stats.hp);
    } catch {}

    const st = {
        zid,
        ped,
        zoneId: zone.id,
        ownerRid: owner && mp.players.exists(owner) ? owner.id : null,
        dead: false,
        deadAt: 0,
        deadSignalAt: 0,
        hp: ZOMBIE_CONFIG.stats.hp,
        attackEnabledAt: Date.now() + ZOMBIE_CONFIG.stats.attackWarmupMs,
        lastFollowSyncAt: 0,
        lastAttackAt: 0,
        lastHpLogAt: 0,
        lastCmdLogAt: 0,
        lastPos: { x, y, z },
        lastMoveAt: Date.now(),
        stuckCount: 0,
        controllerRid: null,
        lastHeartbeatAt: 0,
        state: ZOMBIE_STATE.IDLE,
        lastFollowSentAt: 0,
        lastFollowTargetRid: null,
    };

    zombies.set(zid, st);
    zone.zombieIds.push(zid);

    assignController(st, 'spawn');
    sendFollowToOwner(st);

    console.log(`[Z] spawn zid=${zid} in zone=${zone.id}`);
    zlog(`spawn zid=${zid} owner=${st.ownerRid} pos=${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)} attackInMs=${ZOMBIE_CONFIG.stats.attackWarmupMs}`);
}

function spawnZoneOnEnter(zone, activator) {
    if (!zone || !activator || !mp.players.exists(activator)) return;
    if (zone.zombieIds.length) return;

    zone.active = true;
    zone.activatorRid = activator.id;

    console.log(`[ZONE] Spawning ${zone.zombieCount} zombies in "${zone.name}"`);
    for (let i = 0; i < zone.zombieCount; i++) {
        setTimeout(() => spawnZombie(zone, activator), i * 200);
    }
}

function destroyZombie(zid, reason = 'unknown') {
    const st = zombies.get(zid);
    if (!st) return;

    const zone = zones.get(st.zoneId);

    try {
        if (mp.peds.exists(st.ped)) st.ped.destroy();
    } catch {}

    zombies.delete(zid);
    ctrlVerMap.delete(zid);

    if (zone) {
        zone.zombieIds = zone.zombieIds.filter((id) => id !== zid);
        if (!zone.zombieIds.length) {
            zone.active = false;
            zone.activatorRid = null;
        }
    }

    mp.players.forEach((p) => {
        try {
            p.call('z:forceRemove', [zid]);
        } catch {}
    });

    zlog(`destroy zid=${zid} reason=${reason}`);
}

function markDeadByHit(zid, killer) {
    const st = zombies.get(zid);
    if (!st || st.dead) return;

    st.dead = true;
    st.deadAt = Date.now();
    st.deadSignalAt = st.deadAt;
    st.hp = 0;
    st.ownerRid = null;

    setZombieState(st, ZOMBIE_STATE.DEAD, zlog, killer);

    try {
        if (mp.peds.exists(st.ped)) {
            st.ped.health = 0;
            st.ped.setVariable('deadFlag', true);
            st.ped.setVariable('command', 'idle');
            st.ped.setVariable('commandExtra', null);
        }
    } catch {}

    mp.players.forEach((p) => {
        try {
            p.call('z:dead', [zid]);
        } catch {}
    });

    zlog(`dead zid=${zid} killer=${killer}`);
}

function markDeadBySignal(zid, source = 'unknown') {
    const st = zombies.get(zid);
    if (!st || st.dead) return;
    markDeadByHit(zid, source);
}

function syncDeadStateFromPed() {
    zombies.forEach((st) => {
        if (!st || st.dead) return;

        if (!mp.peds.exists(st.ped)) {
            markDeadBySignal(st.zid, 'ped-missing');
            zlog(`dead-sync zid=${st.zid}: ped missing`);
            return;
        }

        const hp = Number(st.ped.health) || 0;
        const deadFlag = !!st.ped.getVariable('deadFlag');
        const now = Date.now();
        if (!st.lastHpLogAt || now - st.lastHpLogAt >= ZOMBIE_CONFIG.timers.hpDebugMs) {
            st.lastHpLogAt = now;
            zlog(`hp-check zid=${st.zid} hp=${hp} deadFlag=${deadFlag} state=${st.state}`);
        }
        if (hp <= 0 || deadFlag) {
            markDeadBySignal(st.zid, hp <= 0 ? 'ped-health' : 'ped-flag');
            zlog(`dead-sync zid=${st.zid}: hp=${hp} deadFlag=${deadFlag}`);
        }
    });
}

function updateZoneEntryState() {
    mp.players.forEach((player) => {
        zones.forEach((zone, zoneId) => {
            const key = `inZone_${zoneId}`;
            const inZone = isPlayerInZone(player, zone);
            const wasInZone = !!player.getVariable(key);

            if (inZone && !wasInZone) {
                player.setVariable(key, true);
                zlog(`player ${player.id} entered zone=${zoneId}`);
            } else if (!inZone && wasInZone) {
                player.setVariable(key, false);
                zlog(`player ${player.id} left zone=${zoneId}`);
            }
        });
    });
}

function cleanupEmptyZones() {
    zones.forEach((zone) => {
        const plist = playersInZone(mp, zone);
        if (plist.length) return;

        zone.active = false;
        zone.activatorRid = null;

        zone.zombieIds.forEach((zid) => {
            const st = zombies.get(zid);
            if (!st || st.dead) return;
            st.ownerRid = null;
            setZombieState(st, ZOMBIE_STATE.IDLE, zlog, 'zone-empty');
            if (ZOMBIE_CONFIG.ai.emptyZoneBehavior === 'destroy') {
                destroyZombie(zid, 'zone-empty');
            } else {
                sendIdleToController(st, 'zone-empty');
            }
        });
    });
}

function spawnZonesByPresenceCheck() {
    zones.forEach((zone) => {
        const plist = playersInZone(mp, zone);
        if (!plist.length) {
            zlog(`presence-check zone=${zone.id}: empty, skip spawn`);
            return;
        }

        if (zone.zombieIds.length) {
            zlog(`presence-check zone=${zone.id}: already active (${zone.zombieIds.length} zombies)`);
            return;
        }

        const target = chooseNearestTarget(mp, zone, { x: zone.x, y: zone.y, z: zone.z });
        if (!target) return;

        zlog(`presence-check zone=${zone.id}: players=${plist.length}, spawn start`);
        spawnZoneOnEnter(zone, target);
    });
}

function processStuck(st, zone) {
    if (!mp.peds.exists(st.ped)) return;

    const pos = st.ped.position;
    const moved = dist3(pos, st.lastPos || pos);
    const now = Date.now();

    if (moved >= ZOMBIE_CONFIG.ai.stuckDistanceEps) {
        st.lastPos = { x: pos.x, y: pos.y, z: pos.z };
        st.lastMoveAt = now;
        st.stuckCount = 0;
        return;
    }

    if (now - (st.lastMoveAt || now) < ZOMBIE_CONFIG.ai.stuckTimeoutMs) return;

    st.stuckCount = (st.stuckCount || 0) + 1;
    st.lastMoveAt = now;
    zlog(`stuck zid=${st.zid} count=${st.stuckCount}`);

    sendFollowToOwner(st);

    if (st.stuckCount >= ZOMBIE_CONFIG.ai.maxStuckBeforeReassign) {
        st.stuckCount = 0;
        assignController(st, 'stuck-reassign');
    }
}

function syncAllZombieFollow() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const target = chooseNearestTarget(mp, zone, st.ped.position, {
            maxDistance: ZOMBIE_CONFIG.ai.maxTargetDistance,
            dimension: st.ped.dimension,
        });

        if (!target) {
            st.ownerRid = null;
            setZombieState(st, ZOMBIE_STATE.LOST_TARGET, zlog, 'no-valid-target');
            sendIdleToController(st, 'zone-empty-or-invalid-target');
            return;
        }

        if (st.ownerRid !== target.id) {
            st.ownerRid = target.id;
            zlog(`retarget zid=${st.zid} -> owner=${st.ownerRid}`);
        }

        const hbDead = st.controllerRid && Date.now() - (st.lastHeartbeatAt || 0) > ZOMBIE_CONFIG.timers.heartbeatTimeoutMs;
        const currentCtrl = st.ped.controller;
        if (hbDead || !currentCtrl || !mp.players.exists(currentCtrl) || !isPlayerInZone(currentCtrl, zone)) {
            assignController(st, hbDead ? 'heartbeat-timeout' : 'invalid-controller');
        }

        const now = Date.now();
        if (now - st.lastFollowSyncAt < ZOMBIE_CONFIG.timers.syncMs) return;
        st.lastFollowSyncAt = now;

        setZombieState(st, ZOMBIE_STATE.CHASE, zlog, `target=${target.id}`);
        sendFollowToOwner(st);
        processStuck(st, zone);
    });
}

function processZombieAttacks() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const owner = getPlayerById(mp, st.ownerRid);
        if (!isPlayerValidTarget(mp, owner, zone, {
            dimension: st.ped.dimension,
            maxDistance: ZOMBIE_CONFIG.ai.maxTargetDistance,
            fromPos: st.ped.position,
        })) {
            setZombieState(st, ZOMBIE_STATE.LOST_TARGET, zlog, 'invalid-target-before-attack');
            return;
        }

        const now = Date.now();
        if (now < (st.attackEnabledAt || 0)) return;

        const d = dist3(st.ped.position, owner.position);
        if (d > ZOMBIE_CONFIG.stats.attackRange) return;
        if (now - st.lastAttackAt < 800) return;
        st.lastAttackAt = now;

        const before = Number(owner.health) || 0;
        const after = Math.max(0, before - ZOMBIE_CONFIG.stats.damage);
        try {
            owner.health = after;
        } catch {}

        setZombieState(st, ZOMBIE_STATE.ATTACK, zlog, `target=${owner.id}`);

        mp.players.forEach((p) => {
            if (p.dimension !== owner.dimension) return;
            try {
                p.call('npc:animHit', [st.zid, owner.id]);
            } catch {}
        });

        zlog(`attack zid=${st.zid} target=${owner.id} hp=${before}->${after}`);
    });
}

function cleanupDeadZombies() {
    const now = Date.now();

    zombies.forEach((st) => {
        if (!st.dead) return;
        if (now - st.deadAt < ZOMBIE_CONFIG.timers.deadRemoveDelayMs) return;
        destroyZombie(st.zid, 'dead-delay');
    });
}

function registerEvents() {
    mp.events.add('z:ctrlAck', (player, zid, ver) => {
        try {
            zid = parseInt(zid, 10);
            ver = parseInt(ver, 10);
            const st = zombies.get(zid);
            if (!st || st.dead) return;
            if (!mp.peds.exists(st.ped)) return;
            if (st.ped.getVariable('controllerRid') !== player.id) return;
            if (st.ped.getVariable('ctrlVer') !== ver) return;
            st.ped.setVariable('ctrlState', 'ready');
            st.controllerRid = player.id;
            st.lastHeartbeatAt = Date.now();
            zlog(`ctrlAck zid=${zid} by=${player.id} ver=${ver}`);
        } catch {}
    });

    mp.events.add('z:ctrlHeartbeat', (player, zidRaw, verRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const ver = parseInt(verRaw, 10);
            const st = zombies.get(zid);
            if (!st || st.dead) return;
            if (!mp.peds.exists(st.ped)) return;
            if (st.ped.getVariable('controllerRid') !== player.id) return;
            if (st.ped.getVariable('ctrlVer') !== ver) return;
            st.lastHeartbeatAt = Date.now();
            st.controllerRid = player.id;
        } catch {}
    });

    mp.events.add('z:hit', (player, zidRaw, dmgRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const dmg = parseInt(dmgRaw, 10) || 0;
            const st = zombies.get(zid);
            if (!st || st.dead) return;

            const oldHp = Math.max(0, parseInt(st.hp, 10) || ZOMBIE_CONFIG.stats.hp);
            const newHp = Math.max(0, oldHp - Math.max(1, dmg));
            st.hp = newHp;

            try {
                if (mp.peds.exists(st.ped)) st.ped.health = newHp;
            } catch {}

            if (newHp <= 0) {
                markDeadByHit(zid, player && player.name ? player.name : `rid:${player ? player.id : -1}`);
                zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg} hp=${oldHp}->0 DEAD`);
            } else {
                zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg} hp=${oldHp}->${newHp}`);
            }
        } catch (e) {
            zlog(`z:hit error ${e.message}`);
        }
    });

    mp.events.add('z:deadSignal', (player, zidRaw, reasonRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const st = zombies.get(zid);
            if (!st || st.dead) return;

            const now = Date.now();
            if (now - (st.deadSignalAt || 0) < ZOMBIE_CONFIG.timers.deadSignalCooldownMs) return;
            st.deadSignalAt = now;

            const reason = typeof reasonRaw === 'string' ? reasonRaw : 'client-signal';
            markDeadBySignal(zid, `${reason}:rid=${player ? player.id : -1}`);
            zlog(`deadSignal accepted zid=${zid} by=${player ? player.id : -1} reason=${reason}`);
        } catch (e) {
            zlog(`z:deadSignal error ${e.message}`);
        }
    });

    mp.events.add('zombies:respawn', (player) => {
        zones.forEach((zone) => {
            zone.zombieIds.slice().forEach((zid) => destroyZombie(zid, 'manual-reset'));
            zone.zombieIds = [];
            zone.active = false;
            zone.activatorRid = null;
        });

        if (player && player.outputChatBox) {
            player.outputChatBox('!{#66ff66}[Z] Зомби очищены. Войдите в зону для нового спавна.');
        }
    });
}

function registerLoops() {
    setInterval(() => {
        try {
            updateZoneEntryState();
        } catch {}
    }, ZOMBIE_CONFIG.timers.zoneEntryScanMs);

    setInterval(() => {
        try {
            spawnZonesByPresenceCheck();
        } catch {}
    }, ZOMBIE_CONFIG.timers.zonePresenceMs);

    setInterval(() => {
        try {
            syncAllZombieFollow();
        } catch {}
    }, ZOMBIE_CONFIG.timers.syncMs);

    setInterval(() => {
        try {
            processZombieAttacks();
        } catch {}
    }, ZOMBIE_CONFIG.timers.attackMs);

    setInterval(() => {
        try {
            syncDeadStateFromPed();
        } catch {}
    }, ZOMBIE_CONFIG.timers.deadSyncMs);

    setInterval(() => {
        try {
            cleanupDeadZombies();
            cleanupEmptyZones();
        } catch {}
    }, ZOMBIE_CONFIG.timers.cleanupMs);
}

function initZombieController() {
    registerEvents();
    registerLoops();
    console.log('✅ Zombies server controller loaded');
}

module.exports = {
    initZombieController,
};
