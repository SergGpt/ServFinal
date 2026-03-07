// ============================
// RAGE:MP — Zombies (Server) — TTL VERSION
// зомби живёт 12 секунд и ОБЯЗАТЕЛЬНО удаляется
// ============================

const zones = new Map();
const zombies = new Map();          // zid -> { ped, zoneId, spawnAt, dead }
const desiredCmd = new Map();       // zid -> { name, extra }
const ctrlVerMap = new Map();       // zid -> number

const ZOMBIES_PER_PLAYER = 3;
const WAVE_INTERVAL_MS = 15000;
const CORPSE_LIFETIME_MS = 5000;

// ---- 1. зона ----
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
    activatorId: null,
};
zones.set(ZONE_1.id, ZONE_1);

// ---- 2. утилы ----
function dist2d(x1, y1, x2, y2) {
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx*dx + dy*dy);
}
function dist3(a, b) {
    try {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    } catch { return 99999; }
}
function isPlayerInZone(player, zone) {
    try { return dist2d(player.position.x, player.position.y, zone.x, zone.y) <= zone.radius; }
    catch { return false; }
}
function playersInZone(zone) {
    const list = [];
    try { mp.players.forEach(p => { if (isPlayerInZone(p, zone)) list.push(p); }); } catch {}
    return list;
}
function getZoneDataSafe(id) {
    const z = zones.get(id);
    if (!z) return null;
    if (!z.zombieIds) z.zombieIds = [];
    return z;
}
function pickModel() {
    const arr = ['u_m_y_zombie_01'];
    return arr[(Math.random() * arr.length) | 0];
}
function getPlayerById(id) {
    if (typeof id !== 'number') return null;
    let found = null;
    try {
        mp.players.forEach(p => {
            if (!found && p.id === id) found = p;
        });
    } catch {}
    return found;
}

function nextZid() {
    let zid = (Math.random() * 1e9 | 0);
    while (zombies.has(zid)) zid = (Math.random() * 1e9 | 0);
    return zid;
}


function randomSpawnPointInZone(zone) {
    const ang = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * Math.max(5, zone.radius - 12);
    return {
        x: zone.x + Math.cos(ang) * d,
        y: zone.y + Math.sin(ang) * d,
        z: zone.z,
    };
}

function spawnWaveForZone(zoneId, zone, players, needCount) {
    if (!zone || !players || !players.length || needCount <= 0) return 0;

    let spawned = 0;
    for (let i = 0; i < needCount; i++) {
        const pt = randomSpawnPointInZone(zone);
        const owner = players[i % players.length];
        spawnServerZombie(zoneId, pt.x, pt.y, pt.z, pickModel(), owner);
        spawned++;
    }

    if (spawned > 0) {
        zone.active = true;
        zone.spawnedAt = Date.now();
    }
    return spawned;
}

// ---- 3. команды педу (оставим, вдруг пригодится) ----
let __cmdSeq = 0;
function sendCommand(ped, name, extra) {
    try {
        __cmdSeq = (__cmdSeq + 1) | 0;
        if (typeof extra !== 'undefined')
            ped.setVariable('commandExtra', extra);
        ped.setVariable('commandSeq', __cmdSeq);
        ped.setVariable('command', name);
    } catch {}
}
function setDesired(zid, name, extra) {
    desiredCmd.set(zid, { name, extra });
}
function replayDesiredIfReady(zid) {
    const z = zombies.get(zid);
    if (!z) return;
    if (z.dead) return;
    const ped = z.ped;
    if (!mp.peds.exists(ped)) return;
    const st = desiredCmd.get(zid);
    if (!st) return;
    const ctrl = ped.controller;
    if (ctrl && mp.players.exists(ctrl)) {
        try { ctrl.call('z:executeCommand', [zid, st.name, JSON.stringify(st.extra || {})]); } catch {}
    }
    sendCommand(ped, st.name, st.extra);
}

// ---- 4. контроллер ----
function nearestPlayerForPedInZone(ped, zone) {
    let best = null, bestD = Infinity;
    try {
        mp.players.forEach(p => {
            if (!isPlayerInZone(p, zone)) return;
            if (p.dimension !== ped.dimension) return;
            const d = dist3(ped.position, p.position);
            if (d < 50 && d < bestD) {
                best = p;
                bestD = d;
            }
        });
    } catch {}
    return best;
}

function assignControllerStrict(ped, zone, preferred = null) {
    try {
        const zid = ped.getVariable('zid');
        const nextVer = (ctrlVerMap.get(zid) || 0) + 1;
        ctrlVerMap.set(zid, nextVer);

        let controller = null;
        if (preferred && mp.players.exists(preferred) && isPlayerInZone(preferred, zone)) {
            controller = preferred;
        } else {
            controller = nearestPlayerForPedInZone(ped, zone);
        }

        if (!controller) {
            ped.controller = undefined;
            ped.setVariable('controllerRid', -1);
            ped.setVariable('ctrlVer', nextVer);
            ped.setVariable('ctrlState', 'switching');
            return;
        }

        ped.dimension = controller.dimension;
        ped.controller = controller;
        ped.setVariable('controllerRid', controller.id);
        ped.setVariable('ctrlVer', nextVer);
        ped.setVariable('ctrlState', 'switching');

        try {
            controller.call('z:assignController', [zid, nextVer, ped.handle]);
        } catch {}
    } catch {}
}

function reassignControllerIfNeeded(ped) {
    try {
        const zoneId = ped.getVariable('zoneId');
        const zone = zones.get(zoneId);
        if (!zone) return;

        const c = ped.controller;
        if (c && mp.players.exists(c)) {
            const inZone = isPlayerInZone(c, zone);
            let far = true;
            try { far = dist3(ped.position, c.position) > 150; } catch { far = true; }
            if (inZone && !far) return;
        }

        const zid = ped.getVariable('zid');
        const z = zombies.get(zid);
        const preferred = z ? getPlayerById(z.ownerRid) : null;
        assignControllerStrict(ped, zone, preferred);
    } catch {}
}

// ---- 5. spawn / destroy ----
function spawnServerZombie(zoneId, x, y, z, model = pickModel(), targetPlayer = null) {
    const zid = nextZid();
    const ped = mp.peds.new(mp.joaat(model), new mp.Vector3(x, y, z), {
        dynamic: true,
        invincible: false,
    });

    ped.setVariable('zoneId', zoneId);
    ped.setVariable('zid', zid);
    ped.setVariable('command', 'idle');
    ped.setVariable('commandSeq', 0);
    ped.setVariable('commandExtra', null);
    ped.setVariable('ctrlState', 'ready');
    ped.setVariable('ctrlVer', 0);

    const zone = zones.get(zoneId);
    const plist = playersInZone(zone);
    ped.dimension = plist[0]?.dimension ?? 0;

    assignControllerStrict(ped, zone, targetPlayer || plist[0] || null);

    zombies.set(zid, {
        ped,
        zoneId,
        ownerRid: targetPlayer && mp.players.exists(targetPlayer) ? targetPlayer.id : (plist[0] ? plist[0].id : null),
        spawnAt: Date.now(),
        dead: false,
    });

    const zd = getZoneDataSafe(zoneId);
    if (zd) zd.zombieIds.push(zid);

    const tgt = targetPlayer && mp.players.exists(targetPlayer) ? targetPlayer : plist[0];
    if (tgt) {
        setDesired(zid, 'follow', { rid: tgt.id });
        setTimeout(() => replayDesiredIfReady(zid), 400);
    }

    console.log(`[Z] spawn zid=${zid} in zone=${zoneId}`);
    return zid;
}

function destroyZombie(zid) {
    const z = zombies.get(zid);
    if (!z) return;

    const zone = getZoneDataSafe(z.zoneId);

    // 1) убираем пед
    try {
        if (mp.peds.exists(z.ped)) {
            z.ped.destroy();
        }
    } catch {}

    // 2) убираем из коллекций
    zombies.delete(zid);
    desiredCmd.delete(zid);
    ctrlVerMap.delete(zid);

    // 3) убираем из зоны
    if (zone) {
        zone.zombieIds = zone.zombieIds.filter(id => id !== zid);
    }

    // 4) всем клиентам сказать убрать
    mp.players.forEach(p => {
        try { p.call('z:forceRemove', [zid]); } catch {}
    });

    console.log(`[Z] destroy zid=${zid}`);
}

// ---- 6. spawn зоны ----
function spawnZoneZombies(zoneId, zone, targetPlayer = null) {
    if (!zone) return;
    const plist = playersInZone(zone);
    if (!plist.length) return;

    zone.activatorId = targetPlayer && mp.players.exists(targetPlayer) ? targetPlayer.id : plist[0].id;

    const desired = plist.length * ZOMBIES_PER_PLAYER;
    const spawned = spawnWaveForZone(zoneId, zone, plist, desired);
    console.log(`[ZONE] Spawning ${spawned} zombies in "${zone.name}"`);
}

// ---- 7. удары (как раньше) ----
function tryZombieHit(zid, player) {
    const z = zombies.get(zid);
    if (!z) return false;
    if (z.dead) return false;
    const ped = z.ped;
    if (!mp.peds.exists(ped)) return false;
    if (ped.dimension !== player.dimension) return false;

    let d = 9999;
    try { d = dist3(ped.position, player.position); } catch {}
    if (d > 2.8) return false;

    const now = Date.now();
    if (now - (z.lastAttack || 0) < 800) return false;
    z.lastAttack = now;

    const before = Number(player.health) || 0;
    const after = Math.max(0, before - 5);
    try { player.health = after; } catch {}

    mp.players.forEach(p => {
        if (p.dimension === player.dimension) {
            try { p.call('npc:animHit', [zid, player.id]); } catch {}
        }
    });

    return true;
}

// ---- 8. ACK ----
mp.events.add('z:ctrlAck', (player, zid, ver) => {
    try {
        zid = parseInt(zid);
        const z = zombies.get(zid);
        if (!z) return;
        const ped = z.ped;
        if (!mp.peds.exists(ped)) return;
        if (ped.getVariable('controllerRid') !== player.id) return;
        if (ped.getVariable('ctrlVer') !== ver) return;
        ped.setVariable('ctrlState', 'ready');
        replayDesiredIfReady(zid);
    } catch {}
});

// ---- 9. (оставляем) урон от клиента ----
mp.events.add('z:hit', (player, zidRaw, dmgRaw) => {
    try {
        const zid = parseInt(zidRaw);
        const z = zombies.get(zid);
        if (!z) { console.log(`[Z] hit: no zid=${zid}`); return; }
        if (!mp.peds.exists(z.ped)) { console.log(`[Z] hit: ped gone zid=${zid}`); return; }
        if (z.dead) return;

        z.dead = true;

        // всем сказать "упал"
        mp.players.forEach(p => { try { p.call('z:dead', [zid]); } catch {} });

        setTimeout(() => destroyZombie(zid), CORPSE_LIFETIME_MS);

        console.log(`[Z] hit kill zid=${zid} by ${player && player.name}`);
    } catch (e) {
        console.log(`[Z] z:hit error: ${e.message}`);
    }
});

// ---- 10. ТИКЕРЫ ----

// вход/выход
setInterval(() => {
    try {
        mp.players.forEach(player => {
            zones.forEach((zone, zoneId) => {
                const inZone = isPlayerInZone(player, zone);
                const key = `inZone_${zoneId}`;
                const was = !!player.getVariable(key);

                if (inZone && !was) {
                    player.setVariable(key, true);
                    if (!zone.active || !zone.zombieIds || zone.zombieIds.length === 0) {
                        spawnZoneZombies(zoneId, zone, player);
                    }
                } else if (!inZone && was) {
                    player.setVariable(key, false);
                }
            });
        });
    } catch {}
}, 1000);

// волны: каждые N мс добавляем недостающее количество зомби по формуле players * ZOMBIES_PER_PLAYER
setInterval(() => {
    zones.forEach((zone, zoneId) => {
        const plist = playersInZone(zone);
        if (!plist.length) return;

        const activator = getPlayerById(zone.activatorId);
        if (!activator || !isPlayerInZone(activator, zone)) {
            zone.activatorId = plist[0].id;
        }

        const alive = (zone.zombieIds || []).reduce((acc, zid) => {
            const z = zombies.get(zid);
            if (!z) return acc;
            if (z.dead) return acc;
            if (!mp.peds.exists(z.ped)) return acc;
            return acc + 1;
        }, 0);

        const desired = plist.length * ZOMBIES_PER_PLAYER;
        const need = Math.max(0, desired - alive);
        if (need <= 0) return;

        const spawned = spawnWaveForZone(zoneId, zone, plist, need);
        if (spawned > 0) {
            console.log(`[ZONE] Wave +${spawned} (alive=${alive} desired=${desired}) in "${zone.name}"`);
        }
    });
}, WAVE_INTERVAL_MS);

// поддержка контроллера
setInterval(() => {
    zones.forEach(zone => {
        const plist = playersInZone(zone);
        if (!plist.length) return;

        const activator = getPlayerById(zone.activatorId);
        if (!activator || !isPlayerInZone(activator, zone)) {
            zone.activatorId = plist[0].id;
        }

        (zone.zombieIds || []).forEach(zid => {
            const z = zombies.get(zid);
            if (!z) return;
            if (z.dead) return;
            const ped = z.ped;
            if (!mp.peds.exists(ped)) return;

            const owner = getPlayerById(zone.activatorId) || plist[0];
            z.ownerRid = owner ? owner.id : null;
            if (owner) {
                setDesired(zid, 'follow', { rid: owner.id });
                replayDesiredIfReady(zid);
            }

            reassignControllerIfNeeded(ped);
        });
    });
}, 500);

// прокс-удар
setInterval(() => {
    zones.forEach(zone => {
        const plist = playersInZone(zone);
        if (!plist.length) return;

        (zone.zombieIds || []).forEach(zid => {
            const z = zombies.get(zid);
            if (!z) return;
            if (z.dead) return;
            const ped = z.ped;
            if (!mp.peds.exists(ped)) return;

            let best = null, bestD = Infinity;
            plist.forEach(p => {
                if (p.dimension !== ped.dimension) return;
                const d = dist3(ped.position, p.position);
                if (d < bestD) { bestD = d; best = p; }
            });
            if (best && bestD <= 2.8) {
                tryZombieHit(zid, best);
            }
        });
    });
}, 200);

// КУЛЛИНГ
setInterval(() => {
    zones.forEach(zone => {
        const plist = playersInZone(zone);
        if (plist.length) { zone.lastEmptyTs = 0; return; }

        if (!zone.active || !zone.zombieIds || zone.zombieIds.length === 0) return;

        const now = Date.now();
        if (!zone.lastEmptyTs) zone.lastEmptyTs = now;
        if (now - zone.lastEmptyTs >= 30000) {
            zone.zombieIds.slice().forEach(zid => destroyZombie(zid));
            zone.zombieIds = [];
            zone.active = false;
            zone.activatorId = null;
            zone.spawnedAt = 0;
            zone.lastEmptyTs = 0;
            console.log(`[ZONE] Deactivated "${zone.name}" (empty 30s)`);
        }
    });
}, 5000);

// ---- 11. TTL ДЛЯ КАЖДОГО ЗОМБИ ----
// аварийный TTL: удаляем зомби только при долгом зависании
const ZOMBIE_TTL = 180000;
setInterval(() => {
    const now = Date.now();
    zombies.forEach((z, zid) => {
        if (z.dead) return;
        if (!mp.peds.exists(z.ped)) {
            console.log(`[Z] ttl: ped missing, drop zid=${zid}`);
            z.dead = true;
            destroyZombie(zid);
            return;
        }
        if (now - z.spawnAt >= ZOMBIE_TTL) {
            console.log(`[Z] ttl: time is up → kill zid=${zid}`);
            z.dead = true;
            destroyZombie(zid);
        }
    });
}, 1000);

// ---- 12. Команда для твоего /terminal ----
// назови её /ztest
mp.events.add('zombies:respawn', (player) => {
    zones.forEach(zone => {
        (zone.zombieIds || []).slice().forEach(zid => destroyZombie(zid));
        zone.zombieIds = [];
        zone.active = false;
        zone.activatorId = null;
        zone.spawnedAt = 0;
    });
    if (player && player.outputChatBox)
        player.outputChatBox('!{#66ff66}[Z] Очистил. Зайдите в зону — появятся.');
});

console.log('✅ Zombies server loaded (TTL mode)');
