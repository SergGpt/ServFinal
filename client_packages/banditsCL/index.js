// ============================
// RAGE:MP — Zombies (Client) — raycast hits + forceRemove
// ============================

const DEBUG = false;
let VERBOSE = false;

const me = mp.players.local;
const zombies = new Map(); // zid -> { ped, followRid, lastFollowAt, lastNudgeAt }
const pendingControllerAssign = new Map(); // zid -> { ver, at }

const STEP_SPEED = 1.35;
const DIST_SPEEDUP_FROM = 40.0;
const ZOMBIE_STYLE_PRESETS = [
    { name: 'stagger_heavy', clipset: 'move_m@drunk@verydrunk', speedMult: 0.95, fast: false },
    { name: 'stagger_mid', clipset: 'move_m@drunk@moderatedrunk', speedMult: 1.0, fast: false },
    { name: 'stagger_light', clipset: 'move_m@drunk@slightlydrunk', speedMult: 1.05, fast: false },
    { name: 'normal_walk', clipset: null, speedMult: 1.1, fast: false },
    { name: 'runner', clipset: null, speedMult: 1.35, fast: true },
];
const STOP_DIST  = 1.6;
const FOLLOW_CD  = 700;
const FOLLOW_COORD_REFRESH_MS = 700;
const STUCK_CD   = 1000;
const MIN_STEP   = 0.04;
const DEAD_REPORT_CD = 1000;
const deadReportAt = new Map(); // zid -> ts
const deadConfirmedAt = new Map(); // zid -> ts
const CTRL_HEARTBEAT_MS = 1000;
const PLAYER_HIT_SHAKE_MS = 5000;
const playerHitFx = {
    shakeUntil: 0,
    shakeActive: false,
};

const ZOMBIE_ZONE_MAP_BLIP_NAME = 'точка вспышки';
const ZOMBIE_ZONE_AREA_ALPHA = 65;
const ZOMBIE_ZONE_CONTOUR_ALPHA = 170;
const ZOMBIE_ZONE_AREA_COLOR = 1;
const ZOMBIE_ZONE_MARKER_SPRITE = 84;
const ADD_BLIP_FOR_AREA_NATIVE = '0xCE5D0E5E315DB238';
const SET_BLIP_SPRITE_NATIVE = '0xDF735600A4696DAF';
const SET_BLIP_ALPHA_NATIVE = '0x45FF974EEE1C8734';
const SET_BLIP_ROTATION_NATIVE = '0xF87683CDF73C3F6E';
const SET_BLIP_COLOUR_NATIVE = '0x03D7FB09E75D6B7E';
const zombieZoneMapBlips = [];

function removeZombieZoneMapBlips() {
    while (zombieZoneMapBlips.length) {
        const entry = zombieZoneMapBlips.pop();
        const areas = Array.isArray(entry.areas) ? entry.areas : (entry.area ? [entry.area] : []);
        areas.forEach((area) => {
            try { if (area) mp.game.ui.removeBlip(area); } catch {}
        });
        try { if (entry.marker && mp.blips.exists(entry.marker)) entry.marker.destroy(); } catch {}
    }
}

function normalizeZombieZoneMapPoints(zone) {
    const points = zone && Array.isArray(zone.points) ? zone.points : [];
    return points
        .map((point) => ({
            x: Number(point && point.x),
            y: Number(point && point.y),
            z: Number(point && point.z),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getZombieZoneMapCenter(zone) {
    const points = normalizeZombieZoneMapPoints(zone);
    if (points.length >= 3) {
        const sum = points.reduce((acc, point) => {
            acc.x += point.x;
            acc.y += point.y;
            acc.z += Number.isFinite(point.z) ? point.z : 0;
            return acc;
        }, { x: 0, y: 0, z: 0 });

        return {
            x: sum.x / points.length,
            y: sum.y / points.length,
            z: sum.z / points.length,
        };
    }

    return {
        x: Number(zone && zone.x) || 0,
        y: Number(zone && zone.y) || 0,
        z: Number(zone && zone.z) || 0,
    };
}

function getZombieZoneMapRadius(zone, center) {
    const points = normalizeZombieZoneMapPoints(zone);
    if (points.length >= 3) {
        const radius = points.reduce((max, point) => {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            return Math.max(max, Math.sqrt(dx * dx + dy * dy));
        }, 0);
        return Math.max(5, radius);
    }

    return Math.max(5, Number(zone && zone.radius) || 30);
}

function createZombieZoneAreaBlip(x, y, z, width, height, alpha, rotation = 0) {
    let blip = 0;
    try {
        if (mp.game.ui.addBlipForArea) blip = mp.game.ui.addBlipForArea(x, y, z, width, height);
    } catch {}
    if (!blip) {
        try { blip = mp.game.invoke(ADD_BLIP_FOR_AREA_NATIVE, x, y, z, width, height); } catch {}
    }
    if (!blip) return null;

    mp.game.invoke(SET_BLIP_SPRITE_NATIVE, blip, 5);
    mp.game.invoke(SET_BLIP_ALPHA_NATIVE, blip, alpha);
    mp.game.invoke(SET_BLIP_COLOUR_NATIVE, blip, ZOMBIE_ZONE_AREA_COLOR);
    mp.game.invoke(SET_BLIP_ROTATION_NATIVE, blip, Math.round(rotation));
    return blip;
}

function getZombieZoneMapBounds(points) {
    return points.reduce((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        maxX: Math.max(bounds.maxX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxY: Math.max(bounds.maxY, point.y),
    }), {
        minX: points[0].x,
        maxX: points[0].x,
        minY: points[0].y,
        maxY: points[0].y,
    });
}

function createZombieZonePolygonFillBlips(points, z) {
    if (!Array.isArray(points) || points.length < 3) return [];

    const bounds = getZombieZoneMapBounds(points);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    let step = Math.max(8, Math.min(30, Math.max(width, height) / 45));
    if (height / step > 140) step = height / 140;

    const blips = [];
    for (let y = bounds.minY + step / 2; y < bounds.maxY; y += step) {
        const intersections = [];
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            if (!a || !b || a.y === b.y) continue;
            const crosses = (a.y <= y && b.y > y) || (b.y <= y && a.y > y);
            if (!crosses) continue;
            intersections.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }

        intersections.sort((a, b) => a - b);
        for (let i = 0; i + 1 < intersections.length; i += 2) {
            const x1 = intersections[i];
            const x2 = intersections[i + 1];
            const stripWidth = x2 - x1;
            if (stripWidth <= 1) continue;
            const blip = createZombieZoneAreaBlip((x1 + x2) / 2, y, z, stripWidth, step, ZOMBIE_ZONE_AREA_ALPHA);
            if (blip) blips.push(blip);
        }
    }

    return blips;
}

function createZombieZonePolygonContourBlips(points, z) {
    if (!Array.isArray(points) || points.length < 2) return [];

    const blips = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length <= 1) continue;

        const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
        const thickness = Math.max(8, Math.min(18, length * 0.08));
        const blip = createZombieZoneAreaBlip(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            z,
            length,
            thickness,
            ZOMBIE_ZONE_CONTOUR_ALPHA,
            rotation
        );
        if (blip) blips.push(blip);
    }

    return blips;
}

function createZombieZoneMapBlips(zones) {
    removeZombieZoneMapBlips();
    if (!Array.isArray(zones)) return;

    zones.forEach((zone) => {
        const center = getZombieZoneMapCenter(zone);
        const points = normalizeZombieZoneMapPoints(zone);
        const name = String((zone && zone.name) || ZOMBIE_ZONE_MAP_BLIP_NAME);
        const areas = [];

        if (points.length >= 3) {
            areas.push(...createZombieZonePolygonFillBlips(points, center.z));
            areas.push(...createZombieZonePolygonContourBlips(points, center.z));
        } else {
            const radius = getZombieZoneMapRadius(zone, center);
            const area = mp.game.ui.addBlipForRadius(center.x, center.y, center.z, radius);
            mp.game.invoke(SET_BLIP_SPRITE_NATIVE, area, 5);
            mp.game.invoke(SET_BLIP_ALPHA_NATIVE, area, ZOMBIE_ZONE_AREA_ALPHA);
            mp.game.invoke(SET_BLIP_COLOUR_NATIVE, area, ZOMBIE_ZONE_AREA_COLOR);
            areas.push(area);
        }

        const marker = mp.blips.new(ZOMBIE_ZONE_MARKER_SPRITE, new mp.Vector3(center.x, center.y, center.z), {
            name,
            color: ZOMBIE_ZONE_AREA_COLOR,
            alpha: 255,
            shortRange: false,
            scale: 0.8,
        });

        zombieZoneMapBlips.push({ areas, marker });
    });
}

function chatRaw(str){ try{ mp.gui.chat.push(str); }catch{} }
function chat(msg,color='#ffffff'){ chatRaw(`!{${color}}${msg}`); }
function dlog(msg){ if(DEBUG && VERBOSE) chat(`[ZDBG] ${msg}`,'#99ccff'); }
const LOOT_DEBUG = true;
const LOOT_CHAT_DEBUG = false;
function lootDebug(msg){
    if (!LOOT_DEBUG) return;
    try { mp.console.logInfo(`[ZLOOT-CL] ${msg}`); } catch {}
    try { dlog(`[loot] ${msg}`); } catch {}
    if (LOOT_CHAT_DEBUG) {
        try { chat(`[ZLOOT] ${msg}`, '#99ccff'); } catch {}
    }
}

function chooseZombieStyle(zid) {
    const n = Math.abs(parseInt(zid, 10) || 0);
    return ZOMBIE_STYLE_PRESETS[n % ZOMBIE_STYLE_PRESETS.length] || ZOMBIE_STYLE_PRESETS[0];
}

function applyZombieWalkStyle(ped, clipset = null) {
    try {
        if (!ped || !mp.peds.exists(ped)) return;
        const style = clipset;
        if (!style) {
            try { ped.resetMovementClipset(0.0); } catch {}
            return;
        }
        if (!mp.game.streaming.hasClipSetLoaded(style)) {
            mp.game.streaming.requestClipSet(style);
            let i = 0;
            while (!mp.game.streaming.hasClipSetLoaded(style) && i++ < 80) mp.game.wait(0);
        }
        if (!mp.game.streaming.hasClipSetLoaded(style)) {
            try { ped.resetMovementClipset(0.0); } catch {}
            return;
        }
        try { ped.setMovementClipset(style, 0.25); } catch {}
    } catch {}
}

function forceAggroPedState(ped, clipset = null){
    try { if (!ped || !mp.peds.exists(ped)) return; } catch { return; }

    applyZombieWalkStyle(ped, clipset);

    try { ped.setCanRagdoll(true); } catch {}
    try { ped.setBlockingOfNonTemporaryEvents(true); } catch {}
    try { ped.setKeepTask(true); } catch {}

    try { mp.game.ped.setPedFleeAttributes(ped.handle, 0, false); } catch {}
    try { mp.game.ped.setPedCombatAttributes(ped.handle, 17, true); } catch {} // always fight
    try { mp.game.ped.setPedCombatAttributes(ped.handle, 46, true); } catch {} // BF_CanFightArmedPedsWhenNotArmed
    try { mp.game.ped.setPedCombatMovement(ped.handle, 2); } catch {}
    try { mp.game.ped.setPedCombatRange(ped.handle, 0); } catch {}
    try { mp.game.ped.setPedAlertness(ped.handle, 3); } catch {}
}


function getZombieGroundZ(zid) {
    try {
        const obj = zombies.get(zid);
        if (!obj || !obj.ped || !mp.peds.exists(obj.ped)) return null;
        const pos = obj.ped.position;
        if (!pos) return null;
        const groundZ = mp.game.gameplay.getGroundZFor3dCoord(pos.x, pos.y, pos.z + 1.0, false, false);
        return Number.isFinite(groundZ) ? groundZ : null;
    } catch {}
    return null;
}

function sendHitRemote(zid, dmg, reason = 'unknown') {
    try {
        const groundZ = getZombieGroundZ(zid);
        dlog(`sending z:hit zid=${zid} dmg=${dmg} reason=${reason} groundZ=${groundZ}`);
        mp.events.callRemote('z:hit', zid, dmg, groundZ);
        return true;
    } catch (e) {
        dlog(`z:hit send error zid=${zid} reason=${reason} err=${e.message}`);
    }
    return false;
}

function sendDeadRemote(zid, reason = 'unknown') {
    try {
        const groundZ = getZombieGroundZ(zid);
        dlog(`sending z:deadSignal zid=${zid} reason=${reason} groundZ=${groundZ}`);
        mp.events.callRemote('z:deadSignal', zid, reason, groundZ);
        return true;
    } catch (e) {
        dlog(`z:deadSignal send error zid=${zid} reason=${reason} err=${e.message}`);
    }
    return false;
}

function reportDead(zid, reason = 'unknown', force = false) {
    try {
        const now = Date.now();
        const last = deadReportAt.get(zid) || 0;
        if (!force && (now - last < DEAD_REPORT_CD)) {
            dlog(`reportDead skip zid=${zid} reason=${reason} cooldown=${now - last}`);
            return false;
        }
        deadReportAt.set(zid, now);
        return sendDeadRemote(zid, reason);
    } catch (e) {
        dlog(`reportDead error zid=${zid} reason=${reason} err=${e.message}`);
    }
    return false;
}

function triggerZombiePlayerHitFx() {
    const now = Date.now();
    playerHitFx.shakeUntil = now + PLAYER_HIT_SHAKE_MS;
    const shakeAmp = 0.16;
    try {
        mp.game.cam.shakeGameplayCam('SMALL_EXPLOSION_SHAKE', shakeAmp);
        mp.game.cam.setGameplayCamShakeAmplitude(shakeAmp);
        playerHitFx.shakeActive = true;
    } catch {}
}

mp.events.add('render', () => {
    try {
        const now = Date.now();
        if (playerHitFx.shakeActive && now > playerHitFx.shakeUntil) {
            try { mp.game.cam.stopGameplayCamShaking(true); } catch {}
            playerHitFx.shakeActive = false;
        }
    } catch {}
});

// ====== подготовка педа ======
function prepPed(ped, obj = null){
    try{ mp.game.entity.setEntityAsMissionEntity(ped.handle,true,true);}catch{}
    try{ ped.setInvincible(true); }catch{}
    try{ mp.game.entity.setEntityProofs(ped.handle, true, true, true, true, true, true, true, true); }catch{}
    try{ ped.setCollision(true,true); }catch{}
    try{ ped.setBlockingOfNonTemporaryEvents(true); }catch{}
    try{ ped.setKeepTask(true); }catch{}
    try{ ped.setCanRagdoll(true); }catch{}
    const clipset = obj && obj.style ? obj.style.clipset : null;
    applyZombieWalkStyle(ped, clipset);
    forceAggroPedState(ped, clipset);
}

// ====== attach / detach ======
function attachIfZombie(ped){
    if(!ped || ped.type !== 'ped') return false;
    const zid = ped.getVariable('zid');
    const zoneId = ped.getVariable('zoneId');
    if (typeof zid !== 'number' || !zoneId) return false;

    if (!zombies.has(zid)) {
        zombies.set(zid, { ped, style: chooseZombieStyle(zid) });
        dlog(`✅ streamIn zid=${zid} total=${zombies.size}`);
    }
    const obj = zombies.get(zid);
    if (obj && !obj.style) obj.style = chooseZombieStyle(zid);
    prepPed(ped, obj);
    return true;
}
function detachIfZombie(ped){
    if(!ped || ped.type !== 'ped') return;
    const zid = ped.getVariable('zid');
    if(typeof zid !== 'number') return;
    if(zombies.has(zid)){
        zombies.delete(zid);
        dlog(`❌ streamOut zid=${zid} total=${zombies.size}`);
    }
}

function ackController(zid, ver) {
    try { mp.events.callRemote('z:ctrlAck', zid, ver); } catch {}
}

function hydrateFollowFromPed(obj, ped) {
    try {
        const cmd = ped.getVariable('command');
        const extra = ped.getVariable('commandExtra') || {};
        if (cmd !== 'follow') return;

        obj.followRid = (extra && typeof extra.rid === 'number') ? extra.rid : me.id;
        obj.followSpeed = (extra && typeof extra.speed === 'number') ? extra.speed : STEP_SPEED;
        obj.stopDist = (extra && typeof extra.stopDist === 'number') ? extra.stopDist : STOP_DIST;
        const target = findPlayerById(obj.followRid);
        dlog(`hydrateFollowFromPed zid=${ped.getVariable('zid')} ctrl=${isController(ped)} rid=${obj.followRid} target=${target ? target.id : 'none'}`);
        applyFollowTask(obj, ped, target, Date.now(), 'hydrateFollowFromPed');
    } catch {}
}

function tryResolvePendingAssignByPed(ped) {
    try {
        if (!ped || ped.type !== 'ped') return;
        const zid = ped.getVariable('zid');
        if (typeof zid !== 'number') return;

        const pending = pendingControllerAssign.get(zid);
        if (!pending) return;

        attachIfZombie(ped);
        const obj = zombies.get(zid);
        if (obj) {
            hydrateFollowFromPed(obj, ped);
        }

        ackController(zid, pending.ver);
        setTimeout(() => ackController(zid, pending.ver), 350);

        pendingControllerAssign.delete(zid);
    } catch {}
}

mp.events.add('entityStreamIn', (ent) => {
    try {
        if (ent && ent.type === 'ped') {
            const attached = attachIfZombie(ent);
            if (attached) forceAggroPedState(ent);
            tryResolvePendingAssignByPed(ent);
        }
    } catch {}
});
mp.events.add('entityStreamOut', (ent) => {
    try { if (ent && ent.type === 'ped') detachIfZombie(ent); } catch {}
});

// принудительный первый проход
setTimeout(() => {
    try {
        mp.peds.forEach(ped => {
            try { attachIfZombie(ped); tryResolvePendingAssignByPed(ped); } catch {}
        });
        chat(`✅ Zombies client loaded (${zombies.size} peds)`, '#aaffaa');
    } catch (e) {
        chat(`❌ init err: ${e.message}`, '#ff6666');
    }
}, 1000);

// ====== контроллер ======
function isController(ped){
    const rid = ped.getVariable('controllerRid');
    return typeof rid === 'number' && rid === me.id;
}

function findZombiePedByZid(zid){
    const obj = zombies.get(zid);
    if (obj && obj.ped && mp.peds.exists(obj.ped)) return obj.ped;

    let found = null;
    try {
        mp.peds.forEach((ped) => {
            if (found) return;
            if (!ped || !mp.peds.exists(ped)) return;
            if (ped.getVariable('zid') === zid) found = ped;
        });
    } catch {}

    return found;
}

function findPlayerById(rid){
    if (typeof rid !== 'number') return null;
    let found = null;
    try { mp.players.forEach(p => { if (!found && p.id === rid) found = p; }); } catch {}
    return found;
}

function getAdaptiveZombieSpeed(obj, baseSpeed, dist) {
    let speed = Number(baseSpeed) || STEP_SPEED;
    const styleMult = obj && obj.style && typeof obj.style.speedMult === 'number' ? obj.style.speedMult : 1.0;
    speed *= styleMult;

    if (dist > DIST_SPEEDUP_FROM) {
        const extraDist = dist - DIST_SPEEDUP_FROM;
        const boost = 1 + Math.min(1.5, extraDist / 30.0);
        speed *= boost;
    }

    return Math.max(0.65, Math.min(speed, 4.8));
}


function applyFollowTask(obj, ped, target, now, source = 'unknown') {
    try {
        if (!obj || !ped) return;

        const zid = ped.getVariable('zid');
        const ctrl = isController(ped);
        if (!ctrl) {
            dlog(`follow skip zid=${zid} source=${source} reason=not-controller`);
            return;
        }

        const speed = (obj && typeof obj.followSpeed === 'number') ? obj.followSpeed : STEP_SPEED;
        const stopDist = (obj && typeof obj.stopDist === 'number') ? obj.stopDist : STOP_DIST;
        const targetRid = typeof obj.followRid === 'number' ? obj.followRid : me.id;
        const actualTarget = target || findPlayerById(targetRid) || me;
        if (!actualTarget || !actualTarget.handle) {
            dlog(`follow skip zid=${zid} source=${source} rid=${targetRid} reason=target-invalid`);
            return;
        }

        const dist = actualTarget.position.distanceTo(ped.position);
        const targetPos = actualTarget.position;
        const adaptiveSpeed = getAdaptiveZombieSpeed(obj, speed, dist);
        dlog(`follow tick zid=${zid} source=${source} ctrl=${ctrl} rid=${targetRid} target=${actualTarget.id} dist=${dist.toFixed(2)}`);
        if (dist <= stopDist) {
            if (!obj.wasInStopRange) {
                obj.wasInStopRange = true;
                dlog(`follow stop zid=${zid} dist=${dist.toFixed(2)} <= ${stopDist}`);
            }
            return;
        }
        obj.wasInStopRange = false;

        const lastPos = obj.lastPos || ped.position;
        const moved = ped.position.distanceTo(lastPos);
        obj.lastPos = ped.position;
        const moving = moved > MIN_STEP;

        const lastTargetPos = obj.lastTaskTargetPos;
        const targetMoved = !lastTargetPos || Math.abs(targetPos.x - lastTargetPos.x) > 0.8 || Math.abs(targetPos.y - lastTargetPos.y) > 0.8 || Math.abs(targetPos.z - lastTargetPos.z) > 1.5;
        const targetChanged = obj.lastTaskTargetRid !== targetRid;
        const coordRefreshDue = !obj.lastCoordTaskAt || (now - obj.lastCoordTaskAt) >= FOLLOW_COORD_REFRESH_MS;
        const needReissueCoord = targetChanged || targetMoved || !moving || coordRefreshDue;

        if (!obj.lastFollowAt || (now - obj.lastFollowAt) >= FOLLOW_CD) {
            if (needReissueCoord) {
                obj.lastFollowAt = now;
                obj.lastCoordTaskAt = now;
                obj.lastTaskTargetRid = targetRid;
                obj.lastTaskTargetPos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
                try { ped.clearTasks(); } catch {}
                forceAggroPedState(ped, obj && obj.style ? obj.style.clipset : null);
                ped.taskGoToCoordAnyMeans(targetPos.x, targetPos.y, targetPos.z, adaptiveSpeed, 0, false, 0, 0.0);
                dlog(`follow taskGoToCoordAnyMeans zid=${zid} target=${actualTarget.id} dist=${dist.toFixed(2)} speed=${adaptiveSpeed.toFixed(2)} moving=${moving}`);

                try {
                    ped.taskFollowToOffsetOfEntity(actualTarget.handle, 0, 0, 0, adaptiveSpeed, 2000, stopDist, true);
                    dlog(`follow fallback taskFollowToOffsetOfEntity zid=${zid} target=${actualTarget.id}`);
                } catch {}
            }
        }

        if ((!obj.lastNudgeAt || (now - obj.lastNudgeAt) >= STUCK_CD) && !moving) {
            obj.lastNudgeAt = now;
            try { ped.clearTasks(); } catch {}
            forceAggroPedState(ped, obj && obj.style ? obj.style.clipset : null);
            ped.taskGoStraightToCoord(targetPos.x, targetPos.y, targetPos.z, adaptiveSpeed, 1200, 0.0, 0.0);
            dlog(`follow nudge taskGoStraightToCoord zid=${zid} dist=${dist.toFixed(2)} speed=${adaptiveSpeed.toFixed(2)}`);
        }
    } catch {}
}

// ====== события от сервера ======

// сервер говорит: "ты контроллер вот этого педа"
mp.events.add('z:assignController', (zid, ver) => {
    try{
        zid = parseInt(zid);
        ver = parseInt(ver);

        const ped = findZombiePedByZid(zid);
        if(!ped || !mp.peds.exists(ped)) {
            pendingControllerAssign.set(zid, { ver, at: Date.now() });
            return;
        }

        attachIfZombie(ped);
        const obj = zombies.get(zid);
        if (obj) {
            hydrateFollowFromPed(obj, ped);
        }

        ackController(zid, ver);
        setTimeout(() => ackController(zid, ver), 350);

        pendingControllerAssign.delete(zid);
    }catch{}
});

// сервер говорит: "выполни команду"
mp.events.add('z:executeCommand', (zid, cmd, extraJson) => {
    try{
        const obj = zombies.get(zid);
        if(!obj) {
            dlog(`executeCommand skip zid=${zid} cmd=${cmd} reason=no-obj`);
            return;
        }
        const ped = obj.ped;
        if(!mp.peds.exists(ped)) {
            dlog(`executeCommand skip zid=${zid} cmd=${cmd} reason=ped-missing`);
            return;
        }

        const extra = extraJson ? JSON.parse(extraJson) : {};
        dlog(`executeCommand zid=${zid} cmd=${cmd} ctrl=${isController(ped)} extra=${JSON.stringify(extra)}`);

        switch (cmd) {
            case 'idle':
                try { ped.taskStandStill(500); } catch {}
                break;
            case 'follow': {
                obj.followRid = (extra && typeof extra.rid === 'number') ? extra.rid : me.id;
                obj.followSpeed = (extra && typeof extra.speed === 'number') ? extra.speed : STEP_SPEED;
                obj.stopDist = (extra && typeof extra.stopDist === 'number') ? extra.stopDist : STOP_DIST;
                const target = findPlayerById(obj.followRid);
                dlog(`execute follow zid=${zid} rid=${obj.followRid} target=${target ? target.id : 'none'} ped=${mp.peds.exists(ped)}`);
                applyFollowTask(obj, ped, target, Date.now(), 'z:executeCommand');
                break;
            }
            case 'goMe': {
                let target = me;
                if (extra && typeof extra.rid === 'number') {
                    mp.players.forEach(p => { if (p.id === extra.rid) target = p; });
                }
                const p = target.position;
                try { ped.taskGoStraightToCoord(p.x,p.y,p.z, STEP_SPEED, -1, 0.0, 0.0); } catch {}
                break;
            }
        }
    }catch{}
});

// сервер говорит: "убери этого зомби"
mp.events.add('z:forceRemove', (zid) => {
    try {
        zid = parseInt(zid);
        const obj = zombies.get(zid);
        if(!obj) return;
        const ped = obj.ped;
        if (ped && mp.peds.exists(ped)) {
            try { ped.destroy(); } catch {}
        }
        zombies.delete(zid);
        pendingControllerAssign.delete(zid);
        deadReportAt.delete(zid);
        deadConfirmedAt.delete(zid);
        dlog(`🗑 forceRemove zid=${zid}`);
    } catch {}
});

// сервер говорит: "анимка удара"
mp.events.add('npc:animHit', (zid, targetId) => {
    zid = parseInt(zid);
    const obj = zombies.get(zid);
    if(!obj) return;
    const ped = obj.ped;
    if(!mp.peds.exists(ped)) return;

    const dict='melee@unarmed@streamed_core', name='heavy_punch_a';
    mp.game.streaming.requestAnimDict(dict);
    let i=0; while(!mp.game.streaming.hasAnimDictLoaded(dict) && i++<50) mp.game.wait(10);

    let t = null;
    try { mp.players.forEach(p => { if (p.id === targetId) t = p; }); } catch {}
    if (t && t.handle) {
        try { ped.taskLookAt(t.handle, 300); } catch {}
        try { ped.taskTurnToFaceEntity(t.handle, 250); } catch {}
    }

    ped.taskPlayAnim(dict, name, 8.0, -8.0, 600, 0, 0.0, false, false, false);
});

mp.events.add('z:playerDamagedByZombie', () => {
    triggerZombiePlayerHitFx();
});

// сервер: "упал"
mp.events.add('z:dead', (zid) => {
    zid = parseInt(zid);
    const obj = zombies.get(zid);
    if(!obj) return;
    const ped = obj.ped;
    if(!mp.peds.exists(ped)) return;
    deadConfirmedAt.set(zid, Date.now());
    try { ped.setInvincible(false); } catch {}
    try { mp.game.entity.setEntityProofs(ped.handle, false, false, false, false, false, false, false, false); }catch{}
    try { ped.clearTasksImmediately(); } catch {}
    try { ped.setHealth(0); } catch {}
    try { mp.game.ped.setPedToRagdoll(ped.handle, 5000, 5000, 0, false, false, false); } catch {}
    // дальше сервер сам его удалит через z:forceRemove
});

setInterval(() => {
    zombies.forEach((obj, zid) => {
        try {
            const ped = obj.ped;
            if (!mp.peds.exists(ped)) return;
            const hp = Number(ped.getHealth ? ped.getHealth() : ped.health) || 0;
            const deadFlag = !!ped.getVariable('deadFlag');
            if (!deadFlag) return;
            if (deadConfirmedAt.has(zid)) return;
            const sent = reportDead(zid, `client-loop deadFlag=${deadFlag} hp=${hp}`, false);
            if (sent) deadConfirmedAt.set(zid, Date.now());
        } catch {}
    });
}, 1000);

// ====== ДВИЖЕНИЕ У КОНТРОЛЛЕРА ======
setInterval(() => {
    zombies.forEach((obj) => {
        const ped = obj.ped;
        if (!mp.peds.exists(ped)) return;
        if (!isController(ped)) return;

        try {
            const targetRid = typeof obj.followRid === 'number' ? obj.followRid : me.id;
            const target = findPlayerById(targetRid);
            applyFollowTask(obj, ped, target, Date.now(), 'controller-loop');
        } catch {}
    });
}, 450);

setInterval(() => {
    zombies.forEach((obj, zid) => {
        try {
            const ped = obj.ped;
            if (!mp.peds.exists(ped)) return;
            if (!isController(ped)) return;
            const ver = parseInt(ped.getVariable('ctrlVer')) || 0;
            mp.events.callRemote('z:ctrlHeartbeat', zid, ver);
        } catch {}
    });
}, CTRL_HEARTBEAT_MS);


const lootBags = new Map(); // lootId -> { id, objectId, dimension }
function joaat(str) {
    let hash = 0;
    const key = String(str || '').toLowerCase();
    for (let i = 0; i < key.length; i++) {
        hash += key.charCodeAt(i);
        hash += (hash << 10);
        hash ^= (hash >>> 6);
    }
    hash += (hash << 3);
    hash ^= (hash >>> 11);
    hash += (hash << 15);
    return hash >>> 0;
}
const LOOT_MODEL_HASH = joaat('prop_cs_heist_bag_01');
const LOOT_INTERACT_DISTANCE = 2.2;
const LOOT_START_REQUEST_COOLDOWN_MS = 800;
const LOOT_HARD_TIMEOUT_EXTRA_MS = 2500;
let activeLoot = null; // { lootId, startedAt, durationMs, watchdogTimer }
let lootPromptVisibleFor = null;
let lastLootStartRequestAt = 0;
let lootAnimPlaying = false;
let lootAnimLastPlayAt = 0;

function findLootObjectById(objectIdRaw) {
    const objectId = parseInt(objectIdRaw, 10);
    if (!Number.isFinite(objectId) || objectId < 0) return null;
    try {
        if (!mp.objects || typeof mp.objects.atRemoteId !== 'function') return null;
        const obj = mp.objects.atRemoteId(objectId);
        if (!obj || !mp.objects.exists(obj)) return null;
        if ((obj.model >>> 0) !== LOOT_MODEL_HASH) return null;
        return obj;
    } catch {}
    return null;
}

function distanceToEntity(entity) {
    try {
        if (!entity || !entity.position || !me || !me.position) return null;
        const px = Number(me.position.x);
        const py = Number(me.position.y);
        const pz = Number(me.position.z);
        const ox = Number(entity.position.x);
        const oy = Number(entity.position.y);
        const oz = Number(entity.position.z);
        if (![px, py, pz, ox, oy, oz].every(Number.isFinite)) return null;
        const dx = px - ox;
        const dy = py - oy;
        const dz = pz - oz;
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    } catch {}
    return null;
}

function getNearestLootBag() {
    let nearest = null;
    let nearestDist = Infinity;

    lootBags.forEach((bag) => {
        try {
            if (!bag) return;
            const bagDim = typeof bag.dimension === 'number' ? bag.dimension : 0;
            if (bagDim !== me.dimension) return;

            const obj = findLootObjectById(bag.objectId);
            if (!obj || !obj.position) return;

            const dist = distanceToEntity(obj);
            if (!Number.isFinite(dist)) return;
            if (dist >= nearestDist) return;

            nearestDist = dist;
            nearest = {
                bag,
                object: obj,
                distance: dist,
            };
        } catch {}
    });

    return nearest;
}

function lootIsPlayerBusy() {
    try {
        if (!me || !mp.players.exists(me)) return true;
        return !!me.vehicle;
    } catch {}
    return false;
}

function loadAnimDict(dict) {
    try {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) return true;
        mp.game.streaming.requestAnimDict(dict);
        let i = 0;
        while (!mp.game.streaming.hasAnimDictLoaded(dict) && i++ < 70) mp.game.wait(10);
        return mp.game.streaming.hasAnimDictLoaded(dict);
    } catch {}
    return false;
}

function stopLootAnim() {
    lootAnimPlaying = false;
    try { me.clearTasksImmediately(); } catch {}
    try { me.clearTasks(); } catch {}
    try { me.stopAnimTask('amb@prop_human_bum_bin@idle_b', 'idle_d', 2.0); } catch {}
}

function playLootAnim() {
    lootAnimPlaying = true;
    lootAnimLastPlayAt = Date.now();
    const dict = 'amb@prop_human_bum_bin@idle_b';
    const name = 'idle_d';
    if (!loadAnimDict(dict)) return;
    try { me.taskPlayAnim(dict, name, 8.0, -8.0, -1, 1, 0.0, false, false, false); } catch {}
}

function clearActiveLootLocal() {
    if (!activeLoot) return null;
    const lootId = activeLoot.lootId;
    if (activeLoot.watchdogTimer) clearTimeout(activeLoot.watchdogTimer);
    activeLoot = null;
    stopLootAnim();
    return lootId;
}

function cancelActiveLoot(reason = 'client-cancel') {
    const lootId = clearActiveLootLocal();
    if (!Number.isFinite(lootId)) return;

    try { mp.events.callRemote('zloot:cancel', lootId, reason); } catch {}
}

mp.events.add('zloot:create', (data) => {
    try {
        if (!data || typeof data.id !== 'number' || typeof data.objectId !== 'number') return;
        const bag = {
            id: data.id,
            objectId: data.objectId,
            dimension: typeof data.dimension === 'number' ? data.dimension : me.dimension,
        };
        lootBags.set(data.id, bag);
        const obj = findLootObjectById(bag.objectId);
        const pos = obj && obj.position ? `${obj.position.x.toFixed(2)},${obj.position.y.toFixed(2)},${obj.position.z.toFixed(2)}` : 'no-object';
        lootDebug(`zloot:create lootId=${bag.id} obj=${bag.objectId} pos=${pos} dim=${bag.dimension}`);
    } catch {}
});

mp.events.add('zloot:reset', () => {
    try {
        lootBags.clear();
        clearActiveLootLocal();
        if (lootPromptVisibleFor !== null) {
            lootPromptVisibleFor = null;
            try { if (mp.prompt && mp.prompt.hide) mp.prompt.hide(); } catch {}
        }
    } catch {}
});

mp.events.add('zloot:remove', (lootIdRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        lootBags.delete(lootId);
        lootDebug(`loot remove lootId=${lootId}`);
        if (activeLoot && activeLoot.lootId === lootId) clearActiveLootLocal();
    } catch {}
});

mp.events.add('zloot:start', (lootIdRaw, durationRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        const durationMs = parseInt(durationRaw, 10) || 5000;
        if (!Number.isFinite(lootId) || durationMs <= 0) return;

        if (activeLoot && activeLoot.lootId === lootId) return;
        clearActiveLootLocal();

        activeLoot = {
            lootId,
            startedAt: Date.now(),
            durationMs,
            watchdogTimer: setTimeout(() => {
                try {
                    if (!activeLoot || activeLoot.lootId !== lootId) return;
                    cancelActiveLoot('client-hard-timeout');
                } catch {}
            }, durationMs + LOOT_HARD_TIMEOUT_EXTRA_MS),
        };

        try { if (mp.prompt && mp.prompt.hide) mp.prompt.hide(); } catch {}
        lootPromptVisibleFor = null;
        playLootAnim();
    } catch {}
});

mp.events.add('zloot:cancel', (lootIdRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        if (!activeLoot || activeLoot.lootId !== lootId) return;
        clearActiveLootLocal();
    } catch {}
});

mp.events.add('zloot:success', (lootIdRaw, itemIdRaw, itemNameRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        if (activeLoot && activeLoot.lootId === lootId) clearActiveLootLocal();
    } catch {}
});

mp.keys.bind(0x45, true, () => {
    try {
        if (activeLoot) return;
        if (lootIsPlayerBusy()) return;
        const nearest = getNearestLootBag();
        if (!nearest) return;
        lootDebug(`loot E lootId=${nearest.bag.id} obj=${nearest.bag.objectId} dist=${nearest.distance.toFixed(2)}`);
        if (nearest.distance > LOOT_INTERACT_DISTANCE) return;

        const now = Date.now();
        if (now - lastLootStartRequestAt < LOOT_START_REQUEST_COOLDOWN_MS) return;
        lastLootStartRequestAt = now;

        lootDebug(`sending zloot:tryStart lootId=${nearest.bag.id}`);
        mp.events.callRemote('zloot:tryStart', nearest.bag.id);
    } catch {}
});

setInterval(() => {
    try {
        if (activeLoot) {
            const hp = Number(me.getHealth ? me.getHealth() : me.health) || 0;
            if (hp <= 0 || lootIsPlayerBusy()) {
                cancelActiveLoot('client-conditions-fail');
                return;
            }

            if (!lootAnimPlaying) playLootAnim();
            return;
        }

        const nearest = getNearestLootBag();
        if (!nearest || nearest.distance > LOOT_INTERACT_DISTANCE) {
            try { if (mp.prompt && mp.prompt.hide) { mp.prompt.hide(); } } catch {}
            if (lootPromptVisibleFor !== null) {
                lootPromptVisibleFor = null;
            }
            return;
        }

        lootDebug(`loot prompt lootId=${nearest.bag.id} obj=${nearest.bag.objectId} dist=${nearest.distance.toFixed(2)}`);
        if (lootIsPlayerBusy()) return;

        try {
            if (mp.prompt && mp.prompt.showByName) {
                mp.prompt.showByName('zombie_loot_search');
                if (lootPromptVisibleFor !== nearest.bag.id) {
                    lootPromptVisibleFor = nearest.bag.id;
                }
            }
        } catch {}
    } catch {}
}, 200);

mp.keys.bind(0x1B, true, () => {
    try {
        if (!activeLoot) return;
        cancelActiveLoot('esc');
    } catch {}
});

function getNearestZombieZid() {
    let best = null;
    let bestD = Infinity;
    zombies.forEach((obj, zid) => {
        try {
            if (!obj || !obj.ped || !mp.peds.exists(obj.ped)) return;
            const d = me.position.distanceTo(obj.ped.position);
            if (d < bestD) {
                bestD = d;
                best = zid;
            }
        } catch {}
    });
    return best;
}

// ===== КЛАВИША: убить ближайшего зомби (для теста)
mp.keys.bind(0x6B, true, () => { // NumPad +
    const best = getNearestZombieZid();
    if (best !== null) {
        chat(`→ debug force z:hit zid=${best}`, '#ffcc00');
        sendHitRemote(best, 200, 'debug-key');
    } else {
        chat('нет зомби рядом', '#ff6666');
    }
});

// NumPad -: принудительный тест deadSignal pipeline
mp.keys.bind(0x6D, true, () => {
    const best = getNearestZombieZid();
    if (best !== null) {
        chat(`→ debug force z:deadSignal zid=${best}`, '#ffcc00');
        sendDeadRemote(best, 'debug-force');
    } else {
        chat('нет зомби рядом', '#ff6666');
    }
});

// F7 — вкл/выкл логи
mp.keys.bind(0x76, true, () => {
    VERBOSE = !VERBOSE;
    chat(`[Z] LOGS: ${VERBOSE ? 'ON':'OFF'}`, '#cfc');
});

// ============================
// Zombie Zone Editor (polygon)
// ============================
const zoneEditor = {
    active: false,
    points: [],
    zombieCount: 3,
    respawnSec: 60,
    name: '',
};

function zoneEditorNotify(text, type = 'info') {
    try {
        if (type === 'error') mp.notify.error(text, 'Zombies');
        else mp.notify.info(text, 'Zombies');
    } catch {}
}

function zoneEditorClearPreview() {
    zoneEditor.points = [];
}

function zoneEditorClose(force = false) {
    if (!zoneEditor.active && !force) return;
    zoneEditor.active = false;
    zoneEditorClearPreview();
    try { mp.callCEFV('selectMenu.show = false'); } catch {}
    try { mp.busy.remove('z.zone.editor'); } catch {}
}

function zoneEditorOpenMenu() {
    const pointCount = zoneEditor.points.length;
    const names = ['Zone Downtown', 'Zone East Side', 'Zone Harbor', 'Zone Vinewood', 'Zone Sandy', 'Zone Paleto'];
    const zombieValues = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const respawnValues = [10, 20, 30, 45, 60, 90, 120, 180, 240, 300].map((v) => String(v));
    const currentName = zoneEditor.name && zoneEditor.name.trim() ? zoneEditor.name.trim() : names[0];
    const currentZombieIndex = Math.max(0, zombieValues.indexOf(String(zoneEditor.zombieCount)));
    const currentRespawnIndex = Math.max(0, respawnValues.indexOf(String(zoneEditor.respawnSec)));
    const currentNameIndex = Math.max(0, names.indexOf(currentName));

    mp.callCEFV(`selectMenu.menu = {
        name: "zombieZoneEditor",
        header: "Редактор зомби-зоны",
        items: [
            { text: "Название", values: ${JSON.stringify(names)}, i: ${currentNameIndex} },
            { text: "Кол-во зомби", values: ${JSON.stringify(zombieValues)}, i: ${currentZombieIndex} },
            { text: "Респавн (сек)", values: ${JSON.stringify(respawnValues)}, i: ${currentRespawnIndex} },
            { text: "Точек: ${pointCount}" },
            { text: "Добавить точку (моя позиция)" },
            { text: "Удалить последнюю точку" },
            { text: "Очистить точки" },
            { text: "Сохранить в БД" },
            { text: "Закрыть редактор" }
        ],
        i: 0,
        j: 0,
        handler(eventName) {
            var item = this.items[this.i];
            var e = {
                itemName: item.text,
                itemValue: (item.i != null && item.values) ? item.values[item.i] : null,
                valueIndex: item.i
            };
            if (eventName == 'onItemValueChanged') {
                if (e.itemName == 'Название') mp.trigger('z:zoneEditor:setName', String(e.itemValue || ''));
                if (e.itemName == 'Кол-во зомби') mp.trigger('z:zoneEditor:setZombieCount', parseInt(e.itemValue || '3'));
                if (e.itemName == 'Респавн (сек)') mp.trigger('z:zoneEditor:setRespawnSec', parseInt(e.itemValue || '60'));
            }
            if (eventName == 'onItemSelected') {
                if (e.itemName == 'Добавить точку (моя позиция)') mp.trigger('z:zoneEditor:addPoint');
                if (e.itemName == 'Удалить последнюю точку') mp.trigger('z:zoneEditor:popPoint');
                if (e.itemName == 'Очистить точки') mp.trigger('z:zoneEditor:clear');
                if (e.itemName == 'Сохранить в БД') mp.trigger('z:zoneEditor:save');
                if (e.itemName == 'Закрыть редактор') mp.trigger('z:zoneEditor:close');
            }
            if (eventName == 'onEscapePressed' || eventName == 'onBackspacePressed') {
                mp.trigger('z:zoneEditor:close');
            }
        }
    };`);
    mp.callCEFV('selectMenu.show = true;');
}

function zoneEditorReopenMenu() {
    if (!zoneEditor.active) return;
    zoneEditorOpenMenu();
}

mp.events.add('z:zoneEditor:start', () => {
    try {
        if (!mp.busy.add('z.zone.editor', false)) return;
    } catch {}

    zoneEditor.active = true;
    zoneEditor.points = [];
    zoneEditor.zombieCount = 3;
    zoneEditor.respawnSec = 60;
    zoneEditor.name = '';
    zoneEditorOpenMenu();
    zoneEditorNotify('Редактор зомби-зоны открыт. Добавляйте точки из меню.');
});

mp.events.add('z:zoneEditor:addPoint', () => {
    if (!zoneEditor.active) return;
    const pos = mp.players.local.position;
    zoneEditor.points.push({
        x: Number(pos.x.toFixed(3)),
        y: Number(pos.y.toFixed(3)),
        z: Number(pos.z.toFixed(3)),
    });
    zoneEditorNotify(`Точка добавлена: ${zoneEditor.points.length}`);
    zoneEditorReopenMenu();
});

mp.events.add('z:zoneEditor:popPoint', () => {
    if (!zoneEditor.active) return;
    if (!zoneEditor.points.length) {
        zoneEditorNotify('Нет точек для удаления.', 'error');
        return;
    }
    zoneEditor.points.pop();
    zoneEditorNotify(`Удалена последняя точка. Осталось: ${zoneEditor.points.length}`);
    zoneEditorReopenMenu();
});

mp.events.add('z:zoneEditor:clear', () => {
    if (!zoneEditor.active) return;
    zoneEditorClearPreview();
    zoneEditorNotify('Точки очищены.');
    zoneEditorReopenMenu();
});

mp.events.add('z:zoneEditor:setZombieCount', (value) => {
    zoneEditor.zombieCount = Math.max(1, parseInt(value, 10) || 3);
});

mp.events.add('z:zoneEditor:setRespawnSec', (value) => {
    zoneEditor.respawnSec = Math.max(1, parseInt(value, 10) || 60);
});

mp.events.add('z:zoneEditor:setName', (value) => {
    zoneEditor.name = String(value || '').trim();
});

mp.events.add('z:zoneEditor:save', () => {
    if (!zoneEditor.active) return;
    if (zoneEditor.points.length < 3) {
        zoneEditorNotify('Минимум 3 точки для сохранения зоны.', 'error');
        return;
    }

    const payload = {
        name: zoneEditor.name || `Zone_${Date.now()}`,
        zombieCount: zoneEditor.zombieCount,
        respawnSec: zoneEditor.respawnSec,
        points: zoneEditor.points,
    };

    try {
        mp.events.callRemote('zombies:zone:addPolygon', JSON.stringify(payload));
        zoneEditorNotify('Зона отправлена на сохранение в БД.');
        zoneEditorClose(true);
    } catch {
        zoneEditorNotify('Ошибка отправки сохранения зоны.', 'error');
    }
});

mp.events.add('z:zoneEditor:close', () => {
    zoneEditorClose();
    zoneEditorNotify('Редактор зомби-зоны закрыт.');
});

mp.events.add('render', () => {
    if (!zoneEditor.active || !zoneEditor.points.length) return;

    for (let i = 0; i < zoneEditor.points.length; i++) {
        const p = zoneEditor.points[i];
        const v = new mp.Vector3(p.x, p.y, p.z);
        mp.game.graphics.drawMarker(
            1,
            v.x, v.y, v.z - 1.0,
            0, 0, 0,
            0, 0, 0,
            0.45, 0.45, 0.45,
            255, 80, 80, 220,
            false, true, 2, false, null, null, false
        );

        const next = zoneEditor.points[(i + 1) % zoneEditor.points.length];
        if (!next) continue;
        const shouldCloseShape = zoneEditor.points.length >= 3 || i < zoneEditor.points.length - 1;
        if (!shouldCloseShape) continue;
        mp.game.graphics.drawLine(
            p.x, p.y, p.z + 0.1,
            next.x, next.y, next.z + 0.1,
            255, 120, 0, 255
        );
    }
});


mp.events.add('zombies:zones:map', (zones) => {
    try { createZombieZoneMapBlips(zones); } catch (e) { lootDebug(`zone map blips error=${e.message}`); }
});
