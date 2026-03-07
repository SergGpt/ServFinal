const DEBUG = true;
const DEAD_REMOVE_DELAY_MS = 5000;

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
    activatorRid: null,
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

function getPlayerById(rid) {
    if (typeof rid !== 'number') return null;
    let found = null;
    try {
        mp.players.forEach((p) => {
            if (!found && p.id === rid) found = p;
        });
    } catch {}
    return found;
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

function chooseController(zone, ped, preferredPlayer = null) {
    if (preferredPlayer && mp.players.exists(preferredPlayer) && isPlayerInZone(preferredPlayer, zone)) {
        return preferredPlayer;
    }

    const plist = playersInZone(zone);
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

function assignController(st) {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;

    const zone = zones.get(st.zoneId);
    if (!zone) return;

    const owner = getPlayerById(st.ownerRid);
    const controller = chooseController(zone, st.ped, owner);
    const zid = st.zid;
    const ver = (ctrlVerMap.get(zid) || 0) + 1;
    ctrlVerMap.set(zid, ver);

    if (!controller) {
        st.ped.controller = undefined;
        st.ped.setVariable('controllerRid', -1);
        st.ped.setVariable('ctrlVer', ver);
        st.ped.setVariable('ctrlState', 'no-controller');
        zlog(`assignController zid=${zid}: no controller`);
        return;
    }

    st.ped.dimension = controller.dimension;
    st.ped.controller = controller;
    st.ped.setVariable('controllerRid', controller.id);
    st.ped.setVariable('ctrlVer', ver);
    st.ped.setVariable('ctrlState', 'ready');

    try {
        controller.call('z:assignController', [zid, ver, st.ped.handle]);
    } catch {}

    zlog(`assignController zid=${zid}: controller=${controller.id} ver=${ver}`);
}

function sendFollowToOwner(st) {
    if (!st || st.dead) return;
    if (!mp.peds.exists(st.ped)) return;

    const owner = getPlayerById(st.ownerRid);
    if (!owner || !mp.players.exists(owner)) return;

    const ctrl = st.ped.controller;
    if (!ctrl || !mp.players.exists(ctrl)) return;

    const payload = { rid: owner.id };

    try {
        ctrl.call('z:executeCommand', [st.zid, 'follow', JSON.stringify(payload)]);
    } catch {}

    try {
        st.ped.setVariable('command', 'follow');
        st.ped.setVariable('commandExtra', payload);
    } catch {}
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

    const st = {
        zid,
        ped,
        zoneId: zone.id,
        ownerRid: owner && mp.players.exists(owner) ? owner.id : null,
        dead: false,
        deadAt: 0,
        lastFollowSyncAt: 0,
        lastAttackAt: 0,
    };

    zombies.set(zid, st);
    zone.zombieIds.push(zid);

    assignController(st);
    sendFollowToOwner(st);

    console.log(`[Z] spawn zid=${zid} in zone=${zone.id}`);
    zlog(`spawn zid=${zid} owner=${st.ownerRid} pos=${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
}

function spawnZoneOnEnter(zone, activator) {
    if (!zone || !activator || !mp.players.exists(activator)) return;
    if (zone.active && zone.zombieIds.length) return;

    zone.active = true;
    zone.activatorRid = activator.id;
    zone.zombieIds = [];

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
        if (mp.peds.exists(st.ped)) {
            st.ped.destroy();
        }
    } catch {}

    zombies.delete(zid);
    ctrlVerMap.delete(zid);

    if (zone) {
        zone.zombieIds = zone.zombieIds.filter((id) => id !== zid);
        if (!zone.zombieIds.length) {
            zone.active = false;
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

    mp.players.forEach((p) => {
        try {
            p.call('z:dead', [zid]);
        } catch {}
    });

    zlog(`dead zid=${zid} killer=${killer}`);
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

function spawnZonesByPresenceCheck() {
    zones.forEach((zone) => {
        const plist = playersInZone(zone);
        if (!plist.length) {
            zlog(`presence-check zone=${zone.id}: empty, skip spawn`);
            return;
        }

        if (zone.active && zone.zombieIds.length) {
            zlog(`presence-check zone=${zone.id}: already active (${zone.zombieIds.length} zombies)`);
            return;
        }

        zlog(`presence-check zone=${zone.id}: players=${plist.length}, spawn start`);
        spawnZoneOnEnter(zone, plist[0]);
    });
}

function syncAllZombieFollow() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const zone = zones.get(st.zoneId);
        if (!zone) return;

        const owner = getPlayerById(st.ownerRid);
        if (!owner || !mp.players.exists(owner) || !isPlayerInZone(owner, zone)) {
            // если инициатор вышел, оставляем прежнюю цель (не перекидываем на других),
            // но контроллер педа всё равно должен быть валиден в зоне
            const currentCtrl = st.ped.controller;
            if (!currentCtrl || !mp.players.exists(currentCtrl) || !isPlayerInZone(currentCtrl, zone)) {
                assignController(st);
            }
            return;
        }

        const currentCtrl = st.ped.controller;
        if (!currentCtrl || !mp.players.exists(currentCtrl) || !isPlayerInZone(currentCtrl, zone)) {
            assignController(st);
        }

        const now = Date.now();
        if (now - st.lastFollowSyncAt < 350) return;
        st.lastFollowSyncAt = now;
        sendFollowToOwner(st);
    });
}

function processZombieAttacks() {
    zombies.forEach((st) => {
        if (st.dead) return;
        if (!mp.peds.exists(st.ped)) return;

        const owner = getPlayerById(st.ownerRid);
        if (!owner || !mp.players.exists(owner)) return;
        if (owner.dimension !== st.ped.dimension) return;

        const d = dist3(st.ped.position, owner.position);
        if (d > 2.8) return;

        const now = Date.now();
        if (now - st.lastAttackAt < 800) return;
        st.lastAttackAt = now;

        const before = Number(owner.health) || 0;
        const after = Math.max(0, before - 5);
        try {
            owner.health = after;
        } catch {}

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
        if (now - st.deadAt < DEAD_REMOVE_DELAY_MS) return;
        destroyZombie(st.zid, 'dead-5s');
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
                zlog(`hit ignored zid=${zid}: not found`);
                return;
            }
            if (st.dead) {
                zlog(`hit ignored zid=${zid}: already dead`);
                return;
            }

            markDeadByHit(zid, player && player.name ? player.name : `rid:${player ? player.id : -1}`);
            zlog(`hit accepted zid=${zid} by=${player ? player.id : -1} dmg=${dmg}`);
        } catch (e) {
            zlog(`z:hit error ${e.message}`);
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
    }, 1000);

    setInterval(() => {
        try {
            spawnZonesByPresenceCheck();
        } catch {}
    }, 20000);

    setInterval(() => {
        try {
            syncAllZombieFollow();
        } catch {}
    }, 300);

    setInterval(() => {
        try {
            processZombieAttacks();
        } catch {}
    }, 200);

    setInterval(() => {
        try {
            cleanupDeadZombies();
        } catch {}
    }, 500);
}

function initZombieController() {
    registerEvents();
    registerLoops();
    console.log('✅ Zombies server controller loaded');
}

module.exports = {
    initZombieController,
};
