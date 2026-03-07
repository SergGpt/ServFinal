const DEBUG = true;
const ZOMBIE_TTL = 180000;
const DEAD_CLEANUP_DELAY = 1200;

const zones = new Map();
const zombies = new Map(); // zid -> state
const ctrlVerMap = new Map();

const ZONE_1 = {
    id: 1,
    name: 'LS Construction',
    x: -624.3607,
    y: 282.3673,
    z: 81.60345,
    radius: 30,
    zombieCount: 3,
    zombieIds: [],
    active: false,
    spawnedAt: 0,
    lastEmptyTs: 0,
};
zones.set(ZONE_1.id, ZONE_1);

function zlog(msg) {
    if (!DEBUG) return;
    console.log(`[ZCTRL] ${msg}`);
}

function dist2d(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function dist3(a, b) {
    try {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch {
        return 99999;
    }
}

function isPlayerInZone(player, zone) {
    try {
        return dist2d(player.position.x, player.position.y, zone.x, zone.y) <= zone.radius;
    } catch {
        return false;
    }
}

function playersInZone(zone) {
    const list = [];
    try {
        mp.players.forEach((p) => {
            if (isPlayerInZone(p, zone)) list.push(p);
        });
    } catch {}
    return list;
}

function randomModel() {
    const arr = ['u_m_y_zombie_01', 'a_m_m_tramp_01', 's_m_y_cop_01'];
    return arr[(Math.random() * arr.length) | 0];
}

function nextZid() {
    let zid = (Math.random() * 1e9) | 0;
    while (zombies.has(zid)) zid = (Math.random() * 1e9) | 0;
    return zid;
}

function chooseController(zone, ped) {
    const plist = playersInZone(zone);
    if (!plist.length) return null;

    let best = plist[0];
    let bestDist = Infinity;

    plist.forEach((p) => {
        if (!mp.players.exists(p)) return;
        if (typeof p.dimension !== 'number') return;
        const d = dist3(p.position, ped.position);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    });

    return best;
}

function assignController(z) {
    if (!z || z.dead) return;
    if (!mp.peds.exists(z.ped)) return;

    const zone = zones.get(z.zoneId);
    if (!zone) return;

    const controller = chooseController(zone, z.ped);
    const zid = z.zid;
    const nextVer = (ctrlVerMap.get(zid) || 0) + 1;
    ctrlVerMap.set(zid, nextVer);

    if (!controller) {
        z.ped.controller = undefined;
        z.ped.setVariable('controllerRid', -1);
        z.ped.setVariable('ctrlVer', nextVer);
        z.ped.setVariable('ctrlState', 'no-controller');
        z.controllerRid = -1;
        zlog(`assignController zid=${zid} none zone=${zone.id}`);
        return;
    }

    z.ped.dimension = controller.dimension;
    z.ped.controller = controller;
    z.ped.setVariable('controllerRid', controller.id);
    z.ped.setVariable('ctrlVer', nextVer);
    z.ped.setVariable('ctrlState', 'ready');
    z.controllerRid = controller.id;

    try {
        controller.call('z:assignController', [zid, nextVer, z.ped.handle]);
    } catch {}

    zlog(`assignController zid=${zid} controller=${controller.id} ver=${nextVer}`);
}

function sendFollow(z, target) {
    if (!z || z.dead || !target) return;
    if (!mp.peds.exists(z.ped)) return;

    const ctrl = z.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    const payload = { rid: target.id };
    try {
        ctrl.call('z:executeCommand', [z.zid, 'follow', JSON.stringify(payload)]);
    } catch {}

    try {
        z.ped.setVariable('command', 'follow');
        z.ped.setVariable('commandExtra', payload);
    } catch {}
}

function nearestTargetInZone(z) {
    const zone = zones.get(z.zoneId);
    if (!zone) return null;
    const plist = playersInZone(zone);
    if (!plist.length) return null;

    let best = null;
    let bestDist = Infinity;

    plist.forEach((p) => {
        if (!mp.players.exists(p)) return;
        if (p.dimension !== z.ped.dimension) return;
        const d = dist3(p.position, z.ped.position);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    });

    return best;
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

    const state = {
        zid,
        ped,
        zoneId: zone.id,
        dead: false,
        spawnedAt: Date.now(),
        deadAt: 0,
        controllerRid: -1,
        lastSyncAt: 0,
        lastAttackAt: 0,
        ownerRid: owner && mp.players.exists(owner) ? owner.id : -1,
    };

    zombies.set(zid, state);
    zone.zombieIds.push(zid);

    assignController(state);

    const target = nearestTargetInZone(state) || owner;
    if (target && mp.players.exists(target)) {
        sendFollow(state, target);
    }

    console.log(`[Z] spawn zid=${zid} in zone=${zone.id}`);
    zlog(`spawn zid=${zid} zone=${zone.id} owner=${state.ownerRid} pos=${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
}

function destroyZombie(zid, reason = 'unknown') {
    const st = zombies.get(zid);
    if (!st) return;

    const zone = zones.get(st.zoneId);

    try {
        if (mp.peds.exists(st.ped)) {
            st.ped.destroy();
        }
    } catch {}

    zombies.delete(zid);
    ctrlVerMap.delete(zid);

    if (zone) {
        zone.zombieIds = zone.zombieIds.filter((id) => id !== zid);
    }

    mp.players.forEach((p) => {
        try {
            p.call('z:forceRemove', [zid]);
        } catch {}
    });

    zlog(`destroy zid=${zid} reason=${reason}`);
}

function spawnZoneZombies(zone, owner = null) {
    const plist = playersInZone(zone);
    if (!plist.length) return;

    if (zone.active && zone.zombieIds.length) return;

    zone.active = true;
    zone.spawnedAt = Date.now();
    zone.lastEmptyTs = 0;
    zone.zombieIds = [];

    console.log(`[ZONE] Spawning ${zone.zombieCount} zombies in "${zone.name}"`);

    for (let i = 0; i < zone.zombieCount; i++) {
        setTimeout(() => spawnZombie(zone, owner || plist[0]), i * 200);
    }
}

function respawnIfNeeded(zoneId) {
    const zone = zones.get(zoneId);
    if (!zone) return;

    const plist = playersInZone(zone);
    if (!plist.length) {
        zone.active = false;
        return;
    }

    if (zone.zombieIds.length >= zone.zombieCount) return;
    spawnZombie(zone, plist[0]);
}

function markZombieDead(zid, killerName = 'unknown') {
    const st = zombies.get(zid);
    if (!st) return;
    if (st.dead) return;

    st.dead = true;
    st.deadAt = Date.now();

    mp.players.forEach((p) => {
        try {
            p.call('z:dead', [zid]);
        } catch {}
    });

    zlog(`dead zid=${zid} killer=${killerName}`);
}

function tryFinalizeDead(st) {
    if (!st || !st.dead) return;

    const zone = zones.get(st.zoneId);
    if (!zone) {
        destroyZombie(st.zid, 'zone-missing');
        return;
    }

    const plist = playersInZone(zone);
    if (!plist.length) {
        zlog(`dead-wait zid=${st.zid} zone=${zone.id} no players`);
        return;
    }

    if (Date.now() - st.deadAt < DEAD_CLEANUP_DELAY) return;

    const zoneId = st.zoneId;
    const zid = st.zid;
    destroyZombie(zid, 'dead-finalize');
    setTimeout(() => respawnIfNeeded(zoneId), 2500);
}

function ensureZonePresenceState() {
    mp.players.forEach((player) => {
        zones.forEach((zone, zoneId) => {
            const key = `inZone_${zoneId}`;
            const inZone = isPlayerInZone(player, zone);
            const was = !!player.getVariable(key);

            if (inZone && !was) {
                player.setVariable(key, true);
                zlog(`player ${player.id} entered zone=${zoneId}`);
                spawnZoneZombies(zone, player);
            } else if (!inZone && was) {
                player.setVariable(key, false);
                zlog(`player ${player.id} left zone=${zoneId}`);
            }
        });
    });
}

function syncControllersAndFollow() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) {
            markZombieDead(st.zid, 'ped-missing');
            return;
        }

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const plist = playersInZone(zone);
        if (!plist.length) return;

        const currentCtrl = st.ped.controller;
        if (!currentCtrl || !mp.players.exists(currentCtrl) || !isPlayerInZone(currentCtrl, zone)) {
            assignController(st);
        }

        const now = Date.now();
        if (now - st.lastSyncAt < 500) return;
        st.lastSyncAt = now;

        const target = nearestTargetInZone(st);
        if (target) sendFollow(st, target);
    });
}

function processZombieAttacks() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const plist = playersInZone(zone);
        if (!plist.length) return;

        let best = null;
        let bestDist = Infinity;

        plist.forEach((p) => {
            if (p.dimension !== st.ped.dimension) return;
            const d = dist3(st.ped.position, p.position);
            if (d < bestDist) {
                bestDist = d;
                best = p;
            }
        });

        if (!best || bestDist > 2.8) return;

        const now = Date.now();
        if (now - st.lastAttackAt < 800) return;
        st.lastAttackAt = now;

        const before = Number(best.health) || 0;
        const after = Math.max(0, before - 5);
        try {
            best.health = after;
        } catch {}

        mp.players.forEach((p) => {
            if (p.dimension !== best.dimension) return;
            try {
                p.call('npc:animHit', [st.zid, best.id]);
            } catch {}
        });

        zlog(`attack zid=${st.zid} target=${best.id} hp=${before}->${after}`);
    });
}

function cleanupDeadAndTTL() {
    const now = Date.now();

    zombies.forEach((st) => {
        if (st.dead) {
            tryFinalizeDead(st);
            return;
        }

        if (!mp.peds.exists(st.ped)) {
            markZombieDead(st.zid, 'ttl-ped-missing');
            return;
        }

        const zone = zones.get(st.zoneId);
        if (!zone) {
            destroyZombie(st.zid, 'ttl-zone-missing');
            return;
        }

        if (!playersInZone(zone).length) return;

        if (now - st.spawnedAt >= ZOMBIE_TTL) {
            markZombieDead(st.zid, 'ttl-expired');
        }
    });
}

function cullEmptyZones() {
    zones.forEach((zone) => {
        const plist = playersInZone(zone);
        if (plist.length) {
            zone.lastEmptyTs = 0;
            return;
        }

        if (!zone.active || !zone.zombieIds.length) return;

        if (!zone.lastEmptyTs) {
            zone.lastEmptyTs = Date.now();
            return;
        }

        if (Date.now() - zone.lastEmptyTs < 30000) return;

        zone.zombieIds.slice().forEach((zid) => destroyZombie(zid, 'zone-empty-cull'));
        zone.zombieIds = [];
        zone.active = false;
        zone.spawnedAt = 0;
        zone.lastEmptyTs = 0;

        console.log(`[ZONE] Deactivated "${zone.name}" (empty 30s)`);
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
            zlog(`ctrlAck zid=${zid} by=${player.id} ver=${ver}`);
        } catch {}
    });

    mp.events.add('z:hit', (player, zidRaw, dmgRaw) => {
        try {
            const zid = parseInt(zidRaw, 10);
            const dmg = parseInt(dmgRaw, 10) || 0;
            const st = zombies.get(zid);
            if (!st) {
                zlog(`hit ignored zid=${zid} no zombie`);
                return;
            }
            if (st.dead) {
                zlog(`hit ignored zid=${zid} already dead`);
                return;
            }

            markZombieDead(zid, player && player.name ? player.name : `rid:${player ? player.id : -1}`);
            zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg}`);
        } catch (e) {
            zlog(`z:hit error ${e.message}`);
        }
    });

    mp.events.add('zombies:respawn', (player) => {
        zones.forEach((zone) => {
            zone.zombieIds.slice().forEach((zid) => destroyZombie(zid, 'manual-respawn'));
            zone.zombieIds = [];
            zone.active = false;
            zone.spawnedAt = 0;
            zone.lastEmptyTs = 0;
        });

        if (player && player.outputChatBox) {
            player.outputChatBox('!{#66ff66}[Z] Перезапуск зомби выполнен.');
        }
    });
}

function registerLoops() {
    setInterval(() => {
        try {
            ensureZonePresenceState();
        } catch {}
    }, 1000);

    setInterval(() => {
        try {
            syncControllersAndFollow();
        } catch {}
    }, 350);

    setInterval(() => {
        try {
            processZombieAttacks();
        } catch {}
    }, 200);

    setInterval(() => {
        try {
            cleanupDeadAndTTL();
        } catch {}
    }, 1000);

    setInterval(() => {
        try {
            cullEmptyZones();
        } catch {}
    }, 5000);
}

function initZombieController() {
    registerEvents();
    registerLoops();
    console.log('✅ Zombies server controller loaded');
}

module.exports = {
    initZombieController,
};
