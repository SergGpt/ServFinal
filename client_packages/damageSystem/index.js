"use strict";

const DEBUG_ZOMBIE_DAMAGE = false;
const ENABLE_RAYCAST_FALLBACK = true;

const ZOMBIE_IMPACT_RADIUS = 1.6;
const ZOMBIE_HIT_DEDUP_MS = 2;
const DEFAULT_ZOMBIE_DAMAGE = 12;
const ZOMBIE_RAYCAST_DIST = 120.0;
const ZOMBIE_STRICT_RAY_DIST_MAX = 1.05;
const ZOMBIE_STRICT_IMPACT_DIST_MAX = 1.25;
const ZOMBIE_STRICT_ANGLE_MAX_DEG = 8.5;
const ZOMBIE_MULTIPLIER_HEAD = 1.8;
const ZOMBIE_MULTIPLIER_BODY = 1.0;
const ZOMBIE_MULTIPLIER_LIMB = 0.65;
const zombieHitSignature = new Map(); // zid -> { ts, sig }
const zombieWeaponDamage = new Map();
const unknownZombieWeapons = new Set();
const HIT_FEEDBACK_MS = 550;
const hitFeedbackState = { value: null, until: 0 };

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
    if (!DEBUG_ZOMBIE_DAMAGE) return;
    try { mp.gui.chat.push(`!{#99ccff}[DMG-Z] ${msg}`); } catch {}
}

function zerr(msg) {
    try { mp.gui.chat.push(`!{#ff6666}[DMG-Z:ERR] ${msg}`); } catch {}
}

function resolveZombieDamage(weaponHash) {
    const dmg = zombieWeaponDamage.get(weaponHash);
    if (typeof dmg === 'number' && dmg > 0) return dmg;
    if (!unknownZombieWeapons.has(weaponHash)) unknownZombieWeapons.add(weaponHash);
    return DEFAULT_ZOMBIE_DAMAGE;
}


function resolveZombieFromPed(ped) {
    if (!ped || ped.type !== 'ped' || !mp.peds.exists(ped)) return null;
    const zid = ped.getVariable('zid');
    if (typeof zid !== 'number') return null;
    return { ped, zid };
}

function dot(a, b) {
    return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

function length(v) {
    return Math.sqrt(dot(v, v));
}

function normalize(v) {
    const len = length(v) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function angleDeg(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    const d = Math.max(-1, Math.min(1, dot(na, nb)));
    return Math.acos(d) * 180 / Math.PI;
}

function evaluateZombieCandidateByRay(ped, ray, impactPos = null) {
    if (!ped || !ray || !ray.from || !ray.to || !ray.dir) return null;
    const pedPos = ped.position;
    const vx = pedPos.x - ray.from.x;
    const vy = pedPos.y - ray.from.y;
    const vz = pedPos.z - ray.from.z;

    const rayLen = length({ x: ray.to.x - ray.from.x, y: ray.to.y - ray.from.y, z: ray.to.z - ray.from.z }) || ZOMBIE_RAYCAST_DIST;
    const t = Math.max(0, Math.min(rayLen, dot({ x: vx, y: vy, z: vz }, ray.dir)));
    const closest = {
        x: ray.from.x + ray.dir.x * t,
        y: ray.from.y + ray.dir.y * t,
        z: ray.from.z + ray.dir.z * t,
    };
    const distToRay = length({ x: pedPos.x - closest.x, y: pedPos.y - closest.y, z: pedPos.z - closest.z });
    const distToImpact = impactPos ? pedPos.distanceTo(impactPos) : Infinity;
    const ang = angleDeg(ray.dir, { x: vx, y: vy, z: vz });

    return { distToRay, distToImpact, angle: ang, t };
}

function findStrictZombieCandidate(impactPos, ray) {
    let best = null;
    let bestScore = Infinity;

    mp.peds.forEach((ped) => {
        try {
            if (!ped || !mp.peds.exists(ped)) return;
            const zid = ped.getVariable('zid');
            if (typeof zid !== 'number') return;

            const m = evaluateZombieCandidateByRay(ped, ray, impactPos);
            if (!m) return;
            if (m.distToRay > ZOMBIE_STRICT_RAY_DIST_MAX) return;
            if (m.angle > ZOMBIE_STRICT_ANGLE_MAX_DEG) return;
            if (impactPos && m.distToImpact > ZOMBIE_STRICT_IMPACT_DIST_MAX) return;

            const score = m.distToRay * 2 + (impactPos ? m.distToImpact : 0) + (m.angle / 30);
            if (score < bestScore) {
                bestScore = score;
                best = { zid, ped, metrics: m };
            }
        } catch {}
    });

    return best;
}

function getAimRay(dist = ZOMBIE_RAYCAST_DIST, aimedPoint = null) {
    let camPos = null;
    let originSource = 'unknown';

    try {
        if (mp.game.cam && typeof mp.game.cam.getGameplayCamCoord === 'function') {
            camPos = mp.game.cam.getGameplayCamCoord();
            originSource = 'getGameplayCamCoord';
        }
    } catch {}

    try {
        if (!camPos && mp.game.cam && typeof mp.game.cam.getFinalRenderedCamCoord === 'function') {
            camPos = mp.game.cam.getFinalRenderedCamCoord();
            originSource = 'getFinalRenderedCamCoord';
        }
    } catch {}

    if (!camPos) {
        const p = mp.players.local && mp.players.local.position ? mp.players.local.position : { x: 0, y: 0, z: 0 };
        camPos = { x: p.x, y: p.y, z: p.z + 0.65 };
        originSource = 'player-pos-fallback';
    }

    let dir = null;
    let dirSource = 'cam-rot';

    if (aimedPoint && Number.isFinite(aimedPoint.x) && Number.isFinite(aimedPoint.y) && Number.isFinite(aimedPoint.z)) {
        const delta = {
            x: aimedPoint.x - camPos.x,
            y: aimedPoint.y - camPos.y,
            z: aimedPoint.z - camPos.z,
        };
        const len = length(delta);
        if (len > 0.001) {
            dir = { x: delta.x / len, y: delta.y / len, z: delta.z / len };
            dirSource = 'cam-to-targetPosition';
        }
    }

    if (!dir) {
        let camRot = { x: 0, y: 0, z: 0 };
        try {
            if (mp.game.cam && typeof mp.game.cam.getGameplayCamRot === 'function') {
                camRot = mp.game.cam.getGameplayCamRot(2) || camRot;
            }
        } catch (e) {
            zlog(`raycast cam rot fallback err=${e.message}`);
        }

        const pitch = camRot.x * Math.PI / 180.0;
        const yaw = camRot.z * Math.PI / 180.0;
        const cosPitch = Math.abs(Math.cos(pitch));

        dir = {
            x: -Math.sin(yaw) * cosPitch,
            y: Math.cos(yaw) * cosPitch,
            z: Math.sin(pitch),
        };
    }

    const to = {
        x: camPos.x + dir.x * dist,
        y: camPos.y + dir.y * dist,
        z: camPos.z + dir.z * dist,
    };

    if (DEBUG_ZOMBIE_DAMAGE) zlog(`ray origin source=${originSource} dirSource=${dirSource} origin=${camPos.x.toFixed(2)},${camPos.y.toFixed(2)},${camPos.z.toFixed(2)} dir=${dir.x.toFixed(4)},${dir.y.toFixed(4)},${dir.z.toFixed(4)}`);

    return { from: camPos, to, dir, originSource, dirSource };
}

function runAimRaycast(aimedPoint = null) {
    try {
        const ray = getAimRay(ZOMBIE_RAYCAST_DIST, aimedPoint);
        const hit = mp.raycasting.testPointToPoint(ray.from, ray.to, [1, 16]);
        if (DEBUG_ZOMBIE_DAMAGE) zlog(`raycast success=${!!hit} originSource=${ray.originSource || 'n/a'} dirSource=${ray.dirSource || 'n/a'}`);
        return { ray, hit };
    } catch (e) {
        zerr(`raycast fail reason=${e.message}`);
        try {
            return { ray: getAimRay(ZOMBIE_RAYCAST_DIST, aimedPoint), hit: null };
        } catch (e2) {
            zerr(`raycast fallback fail reason=${e2.message}`);
            return { ray: null, hit: null };
        }
    }
}

function logRayAlignmentDebug(ray, impactPos, candidate, label) {
    if (!DEBUG_ZOMBIE_DAMAGE) return;
    if (!ray || !impactPos) return;
    try {
        const base = `[${label}] impact=${impactPos.x.toFixed(2)},${impactPos.y.toFixed(2)},${impactPos.z.toFixed(2)} rayFrom=${ray.from.x.toFixed(2)},${ray.from.y.toFixed(2)},${ray.from.z.toFixed(2)} dir=${ray.dir.x.toFixed(4)},${ray.dir.y.toFixed(4)},${ray.dir.z.toFixed(4)}`;
        if (!candidate || !candidate.ped || !mp.peds.exists(candidate.ped)) {
            zlog(`${base} candidate=none`);
            return;
        }

        const pedPos = candidate.ped.position;
        const impactToPed = pedPos.distanceTo(impactPos);
        const metrics = candidate.metrics || evaluateZombieCandidateByRay(candidate.ped, ray, impactPos);
        zlog(`${base} candidateZid=${candidate.zid} ped=${pedPos.x.toFixed(2)},${pedPos.y.toFixed(2)},${pedPos.z.toFixed(2)} impactToPed=${impactToPed.toFixed(3)} rayDist=${metrics ? metrics.distToRay.toFixed(3) : 'n/a'} angle=${metrics ? metrics.angle.toFixed(3) : 'n/a'}`);
    } catch {}
}

function makeZombieHitSignature(weaponHash, zone, impactPos = null, damage = 0) {
    const x = impactPos && Number.isFinite(impactPos.x) ? impactPos.x.toFixed(2) : 'n';
    const y = impactPos && Number.isFinite(impactPos.y) ? impactPos.y.toFixed(2) : 'n';
    const z = impactPos && Number.isFinite(impactPos.z) ? impactPos.z.toFixed(2) : 'n';
    return `${weaponHash}|${zone}|${damage}|${x}|${y}|${z}`;
}

function trySendZombieHit(zid, damage, weaponHash, zone = 'body', impactPos = null) {
    const now = Date.now();
    const sig = makeZombieHitSignature(weaponHash, zone, impactPos, damage);
    const last = zombieHitSignature.get(zid);
    if (last && last.sig === sig && (now - last.ts) < ZOMBIE_HIT_DEDUP_MS) return false;

    zombieHitSignature.set(zid, { ts: now, sig });
    zlog(`sending z:hit zid=${zid} damage=${damage} weapon=${weaponHash}`);
    try { mp.events.callRemote('z:hit', zid, damage); } catch (e) { zerr(`z:hit send error zid=${zid} err=${e.message}`); }
    return true;
}

function resolveZombieHitZone(ped, impactPos) {
    if (!ped || !impactPos) return 'body';
    try {
        const head = ped.getBoneCoords(31086, 0.0, 0.0, 0.0);
        const foot = ped.getBoneCoords(14201, 0.0, 0.0, 0.0);
        if (impactPos.z >= head.z - 0.12) return 'head';
        if (impactPos.z <= foot.z + ((head.z - foot.z) * 0.42)) return 'limb';
    } catch {}
    return 'body';
}

function zoneMultiplier(zone) {
    if (zone === 'head') return ZOMBIE_MULTIPLIER_HEAD;
    if (zone === 'limb') return ZOMBIE_MULTIPLIER_LIMB;
    return ZOMBIE_MULTIPLIER_BODY;
}

function sendZombieHitWithZone(ped, zid, baseDamage, weaponHash, impactPos, sourceLog, metrics = null) {
    const zone = resolveZombieHitZone(ped, impactPos);
    const mult = zoneMultiplier(zone);
    const finalDamage = Math.max(1, Math.round(baseDamage * mult));
    if (metrics) {
        zlog(`${sourceLog} zid=${zid} impactDist=${isFinite(metrics.distToImpact) ? metrics.distToImpact.toFixed(2) : 'n/a'} rayDist=${metrics.distToRay.toFixed(2)} angle=${metrics.angle.toFixed(2)} zone=${zone}`);
    } else {
        zlog(`${sourceLog} zid=${zid} zone=${zone}`);
    }
    zlog(`final damage after multiplier=${finalDamage}`);
    const sent = trySendZombieHit(zid, finalDamage, weaponHash, zone, impactPos);
    const registeredDamage = sent ? finalDamage : 0;
    showZombieHitFeedback(registeredDamage);
    return registeredDamage;
}

function showZombieHitFeedback(value) {
    hitFeedbackState.value = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    hitFeedbackState.until = Date.now() + HIT_FEEDBACK_MS;
}

mp.events.add('render', () => {
    try {
        if (!hitFeedbackState.until || Date.now() > hitFeedbackState.until) return;
        const color = hitFeedbackState.value > 0 ? [255, 80, 80, 230] : [180, 180, 180, 220];
        mp.game.graphics.drawText(`${hitFeedbackState.value}`, [0.506, 0.465], {
            font: 4,
            color,
            scale: [0.42, 0.42],
            outline: true,
            centre: true
        });
    } catch {}
});

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
    const damage = resolveZombieDamage(weaponHash);

    if (targetEntity && targetEntity.type === 'player' && mp.players.exists(targetEntity)) {
        let boneName = getHitBone(targetPosition, targetEntity);
        if (boneName != null) {
            //mp.chat.debug(boneName);
            mp.events.callRemote("playerDamaged", targetEntity.remoteId, boneName);
        }
        return;
    }

    const directImpactPos = targetPosition || null;

    if (targetEntity && targetEntity.type === 'ped') {
        const zombie = resolveZombieFromPed(targetEntity);
        if (zombie) {
            sendZombieHitWithZone(zombie.ped, zombie.zid, damage, weaponHash, directImpactPos, 'direct zombie hit');
            return;
        }
    }

    if (!ENABLE_RAYCAST_FALLBACK) return;

    const hasTargetPos = !!(targetPosition && Number.isFinite(targetPosition.x) && Number.isFinite(targetPosition.y) && Number.isFinite(targetPosition.z));
    const { ray, hit } = runAimRaycast(hasTargetPos ? targetPosition : null);

    if (hasTargetPos) {
        const strictFromTargetPos = findStrictZombieCandidate(targetPosition, ray);
        logRayAlignmentDebug(ray, targetPosition, strictFromTargetPos, 'targetPosition-strict');
        if (strictFromTargetPos) {
            sendZombieHitWithZone(strictFromTargetPos.ped, strictFromTargetPos.zid, damage, weaponHash, targetPosition, 'fallback targetPosition zombie hit', strictFromTargetPos.metrics);
            return;
        }
    }

    if (hit && hit.entity && hit.entity.type === 'ped') {
        const zombie = resolveZombieFromPed(hit.entity);
        if (zombie) {
            sendZombieHitWithZone(zombie.ped, zombie.zid, damage, weaponHash, hit.position || targetPosition || null, 'raycast zombie hit');
            return;
        }
    }

    const rayImpactPos = hit && hit.position ? hit.position : null;
    if (rayImpactPos) {
        const strictFromRayImpact = findStrictZombieCandidate(rayImpactPos, ray);
        logRayAlignmentDebug(ray, rayImpactPos, strictFromRayImpact, 'rayImpact-strict');
        if (strictFromRayImpact) {
            sendZombieHitWithZone(strictFromRayImpact.ped, strictFromRayImpact.zid, damage, weaponHash, rayImpactPos, 'raycast impact fallback zombie hit', strictFromRayImpact.metrics);
            return;
        }
    }

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
