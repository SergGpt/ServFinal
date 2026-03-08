"use strict";

const ZOMBIE_IMPACT_RADIUS = 1.6;
const ZOMBIE_HIT_DEDUP_MS = 15;
const DEFAULT_ZOMBIE_DAMAGE = 12;
const ZOMBIE_RAYCAST_DIST = 120.0;
const zombieHitAt = new Map(); // zid -> ts
const zombieWeaponDamage = new Map();
const unknownZombieWeapons = new Set();

function addZombieWeaponDamage(name, value) {
    try { zombieWeaponDamage.set(mp.game.joaat(name), value); } catch {}
}

[
    ['weapon_unarmed', 8], ['weapon_knife', 20], ['weapon_bat', 18], ['weapon_pistol', 22], ['weapon_combatpistol', 24],
    ['weapon_appistol', 20], ['weapon_pistol50', 30], ['weapon_snspistol', 20], ['weapon_heavypistol', 28],
    ['weapon_vintagepistol', 20], ['weapon_doubleaction', 44], ['weapon_marksmanpistol', 58], ['weapon_revolver', 52],
    ['weapon_microsmg', 17], ['weapon_smg', 19], ['weapon_machinepistol', 16], ['weapon_assaultsmg', 21],
    ['weapon_minismg', 18], ['weapon_combatpdw', 22], ['weapon_gusenberg', 25],
    ['weapon_assaultrifle', 28], ['weapon_carbinerifle', 30], ['weapon_advancedrifle', 29], ['weapon_specialcarbine', 31],
    ['weapon_bullpuprifle', 32], ['weapon_compactrifle', 26], ['weapon_mg', 34], ['weapon_combatmg', 36],
    ['weapon_pumpshotgun', 38], ['weapon_sawnoffshotgun', 36], ['weapon_assaultshotgun', 34], ['weapon_bullpupshotgun', 35],
    ['weapon_dbshotgun', 55], ['weapon_heavyshotgun', 42], ['weapon_autoshotgun', 32],
    ['weapon_sniperrifle', 88], ['weapon_heavysniper', 85], ['weapon_heavysniper_mk2', 95],
    ['weapon_marksmanrifle', 62], ['weapon_marksmanrifle_mk2', 66],
    ['weapon_rpg', 120], ['weapon_hominglauncher', 130], ['weapon_minigun', 42], ['weapon_grenadelauncher', 90],
    ['weapon_compactlauncher', 72], ['weapon_grenade', 70], ['weapon_stickybomb', 80], ['weapon_molotov', 45],
    ['weapon_pipebomb', 85], ['weapon_bzgas', 15], ['weapon_petrolcan', 10],
    ['weapon_crowbar', 18], ['weapon_hammer', 18], ['weapon_machete', 25], ['weapon_battleaxe', 26],
    ['weapon_poolcue', 14], ['weapon_wrench', 15], ['weapon_flashlight', 10],
].forEach(([n, v]) => addZombieWeaponDamage(n, v));

function zlog(msg) {
    try { mp.gui.chat.push(`!{#99ccff}[DMG-Z] ${msg}`); } catch {}
}

function resolveZombieDamage(weaponHash) {
    const dmg = zombieWeaponDamage.get(weaponHash);
    if (typeof dmg === 'number' && dmg > 0) return dmg;
    if (!unknownZombieWeapons.has(weaponHash)) {
        unknownZombieWeapons.add(weaponHash);
        zlog(`unknown weapon hash, using default damage hash=${weaponHash}`);
    }
    return DEFAULT_ZOMBIE_DAMAGE;
}

function resolveWeaponName(weaponHash) {
    try { return mp.weapons.getWeaponName(weaponHash) || 'unknown'; } catch {}
    return 'unknown';
}

function findZombieNearPosition(pos, radius = ZOMBIE_IMPACT_RADIUS) {
    if (!pos) return null;
    let best = null;
    let bestDist = Infinity;
    mp.peds.forEach((ped) => {
        try {
            if (!ped || !mp.peds.exists(ped)) return;
            const zid = ped.getVariable('zid');
            if (typeof zid !== 'number') return;
            const d = ped.position.distanceTo(pos);
            if (d <= radius && d < bestDist) {
                bestDist = d;
                best = { zid, dist: d, ped };
            }
        } catch {}
    });
    return best;
}

function getAimRay(dist = ZOMBIE_RAYCAST_DIST) {
    const camPos = mp.game.cam.getGameplayCamCoord();
    const camRot = mp.game.cam.getGameplayCamRot(2);
    const pitch = camRot.x * Math.PI / 180.0;
    const yaw = camRot.z * Math.PI / 180.0;

    const dir = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y: Math.cos(yaw) * Math.cos(pitch),
        z: Math.sin(pitch),
    };

    const to = {
        x: camPos.x + dir.x * dist,
        y: camPos.y + dir.y * dist,
        z: camPos.z + dir.z * dist,
    };

    return { from: camPos, to, dir };
}

function runAimRaycast() {
    try {
        const ray = getAimRay(ZOMBIE_RAYCAST_DIST);
        const hit = mp.raycasting.testPointToPoint(ray.from, ray.to, [1, 16]);
        return { ray, hit };
    } catch {
        return { ray: getAimRay(ZOMBIE_RAYCAST_DIST), hit: null };
    }
}

function findZombieAlongRay(ray, step = 4.0, radius = ZOMBIE_IMPACT_RADIUS) {
    if (!ray || !ray.from || !ray.to) return null;
    const dx = ray.to.x - ray.from.x;
    const dy = ray.to.y - ray.from.y;
    const dz = ray.to.z - ray.from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;
    if (len <= 0.001) return null;
    const dir = { x: dx / len, y: dy / len, z: dz / len };

    for (let t = step; t <= len; t += step) {
        const point = {
            x: ray.from.x + dir.x * t,
            y: ray.from.y + dir.y * t,
            z: ray.from.z + dir.z * t,
        };
        const near = findZombieNearPosition(point, radius);
        if (near) return near;
    }

    return null;
}

function trySendZombieHit(zid, damage, weaponHash) {
    const now = Date.now();
    const last = zombieHitAt.get(zid) || 0;
    if (now - last < ZOMBIE_HIT_DEDUP_MS) return false;
    zombieHitAt.set(zid, now);
    zlog(`sending z:hit zid=${zid} damage=${damage} weapon=${weaponHash}`);
    try { mp.events.callRemote('z:hit', zid, damage); } catch (e) { zlog(`z:hit send error zid=${zid} err=${e.message}`); }
    return true;
}

let parts = [
    {
        name: "Head",
        id: 31086,
        size: 0.4
    },
    {
        name: "Left_Clavicle",
        id: 64729,
        size: 0.25
    },
    {
        name: "Right_Clavicle",
        id: 10706,
        size: 0.25
    },
    {
        name: "Upper_Arm Right",
        id: 40269,
        size: 0.25
    },
    {
        name: "Upper_Arm Left",
        id: 45509,
        size: 0.25
    },
    {
        name: "Lower_Arm Right",
        id: 28252,
        size: 0.25
    },
    {
        name: "Lower_Arm Left",
        id: 61163,
        size: 0.25
    },
    {
        name: "Spine_1",
        id: 24816,
        size: 0.25
    },
    {
        name: "Spine_3",
        id: 24818,
        size: 0.25
    },
    {
        name: "Right_Tigh",
        id: 51826,
        size: 0.25
    },
    {
        name: "Left_Tigh",
        id: 58271,
        size: 0.25
    },
    {
        name: "Right_Calf",
        id: 36864,
        size: 0.25
    },
    {
        name: "Left_Calf",
        id: 63931,
        size: 0.25
    },
    {
        name: "Right_Foot",
        id: 52301,
        size: 0.25
    },
    {
        name: "Left_Foot",
        id: 14201,
        size: 0.25
    },
    ];


mp.events.add("characterInit.done", () => {
    mp.players.local.setProofs(true, false, false, false, false, false, false, false);
});

mp.events.add('playerWeaponShot', (targetPosition, targetEntity) => {
    const weaponHash = mp.players.local.weapon || 0;
    const weaponName = resolveWeaponName(weaponHash);
    const damage = resolveZombieDamage(weaponHash);
    zlog(`weapon fired weapon=${weaponName} hash=${weaponHash}`);
    zlog(`weapon damage resolved=${damage}`);

    if (targetEntity && targetEntity.type === 'player' && mp.players.exists(targetEntity)) {
        let boneName = getHitBone(targetPosition, targetEntity);
        if (boneName != null) {
            //mp.chat.debug(boneName);
            mp.events.callRemote("playerDamaged", targetEntity.remoteId, boneName);
        }
        zlog('hit entity type=player');
        return;
    }

    if (targetEntity && targetEntity.type === 'ped') {
        const zid = targetEntity.getVariable('zid');
        zlog('hit entity type=ped');
        if (typeof zid === 'number') {
            zlog(`direct zombie hit zid=${zid}`);
            trySendZombieHit(zid, damage, weaponHash);
            return;
        }
        zlog('zid not found on ped, trying fallback by impact position');
    } else if (targetEntity) {
        zlog(`hit entity type=${targetEntity.type}`);
    } else {
        zlog('hit entity type=none');
    }

    const nearFromTargetPos = findZombieNearPosition(targetPosition, ZOMBIE_IMPACT_RADIUS);
    if (nearFromTargetPos) {
        zlog(`fallback targetPosition zombie hit zid=${nearFromTargetPos.zid} dist=${nearFromTargetPos.dist.toFixed(2)}`);
        trySendZombieHit(nearFromTargetPos.zid, damage, weaponHash);
        return;
    }

    const { ray, hit } = runAimRaycast();
    const rayEntityType = (hit && hit.entity && hit.entity.type) ? hit.entity.type : 'none';
    zlog(`raycast entity type=${rayEntityType}`);

    if (hit && hit.entity && hit.entity.type === 'ped') {
        const zid = hit.entity.getVariable('zid');
        if (typeof zid === 'number') {
            zlog(`raycast zombie hit zid=${zid}`);
            trySendZombieHit(zid, damage, weaponHash);
            return;
        }
    }

    const rayImpactPos = hit && hit.position ? hit.position : null;
    const nearFromRayImpact = findZombieNearPosition(rayImpactPos, ZOMBIE_IMPACT_RADIUS);
    if (nearFromRayImpact) {
        zlog(`raycast impact fallback zombie hit zid=${nearFromRayImpact.zid} dist=${nearFromRayImpact.dist.toFixed(2)}`);
        trySendZombieHit(nearFromRayImpact.zid, damage, weaponHash);
        return;
    }

    const nearAlongRay = findZombieAlongRay(ray, 4.0, ZOMBIE_IMPACT_RADIUS);
    if (nearAlongRay) {
        zlog(`raycast impact fallback zombie hit zid=${nearAlongRay.zid} dist=${nearAlongRay.dist.toFixed(2)}`);
        trySendZombieHit(nearAlongRay.zid, damage, weaponHash);
        return;
    }

    zlog('no zombie hit');
});

let getHitBone = (position, target) => {
    let minDistance = 10;
    let targetBone = null;

    parts.forEach((part) => {
        let bonePos = target.getBoneCoords(part.id, 0.0, 0.0, 0.0);
        let newDistance =  mp.game.system.vdist(bonePos.x, bonePos.y, bonePos.z, position.x, position.y, position.z);
        //mp.chat.debug("newDistance" + newDistance);
        if (newDistance < minDistance) {
            minDistance = newDistance;
            targetBone = part;
        }
    });
    //mp.chat.debug(JSON.stringify(targetBone));
    if (targetBone != null) {
        if (!target.vehicle) {
            if (minDistance < targetBone.size) {
                return targetBone.name;

            } else {
                return "Spine_1";
            }

        } else {
            if (minDistance < targetBone.size + 0.4) {
                return targetBone.name;
            } else {
                return null;
            }
        }
    } else {
        if (!target.vehicle) {
            return "Spine_1";
        } else {
            return null;
        }
    }
}
