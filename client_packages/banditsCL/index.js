// ============================
// RAGE:MP — Zombies (Client) — raycast hits + forceRemove
// ============================

const DEBUG = false;
let VERBOSE = false;

const me = mp.players.local;
const zombies = new Map(); // zid -> { ped, followRid, lastFollowAt, lastNudgeAt }
const pendingControllerAssign = new Map(); // zid -> { ver, at }

const STEP_SPEED = 1.35;
const STOP_DIST  = 1.6;
const FOLLOW_CD  = 700;
const FOLLOW_COORD_REFRESH_MS = 700;
const STUCK_CD   = 1000;
const MIN_STEP   = 0.04;
const DEAD_REPORT_CD = 1000;
const deadReportAt = new Map(); // zid -> ts
const deadConfirmedAt = new Map(); // zid -> ts
const CTRL_HEARTBEAT_MS = 1000;

function chatRaw(str){ try{ mp.gui.chat.push(str); }catch{} }
function chat(msg,color='#ffffff'){ chatRaw(`!{${color}}${msg}`); }
function dlog(msg){ if(DEBUG && VERBOSE) chat(`[ZDBG] ${msg}`,'#99ccff'); }
const LOOT_DEBUG = true;
const LOOT_CHAT_DEBUG = true;
function lootDebug(msg){
    if (!LOOT_DEBUG) return;
    try { mp.console.logInfo(`[ZLOOT-CL] ${msg}`); } catch {}
    try { dlog(`[loot] ${msg}`); } catch {}
    if (LOOT_CHAT_DEBUG) {
        try { chat(`[ZLOOT] ${msg}`, '#99ccff'); } catch {}
    }
}

function forceAggroPedState(ped){
    try { if (!ped || !mp.peds.exists(ped)) return; } catch { return; }

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

// ====== подготовка педа ======
function prepPed(ped){
    try{ mp.game.entity.setEntityAsMissionEntity(ped.handle,true,true);}catch{}
    try{ ped.setInvincible(true); }catch{}
    try{ mp.game.entity.setEntityProofs(ped.handle, true, true, true, true, true, true, true, true); }catch{}
    try{ ped.setCollision(true,true); }catch{}
    try{ ped.setBlockingOfNonTemporaryEvents(true); }catch{}
    try{ ped.setKeepTask(true); }catch{}
    try{ ped.setCanRagdoll(true); }catch{}
    forceAggroPedState(ped);
}

// ====== attach / detach ======
function attachIfZombie(ped){
    if(!ped || ped.type !== 'ped') return false;
    const zid = ped.getVariable('zid');
    const zoneId = ped.getVariable('zoneId');
    if (typeof zid !== 'number' || !zoneId) return false;

    if (!zombies.has(zid)) {
        zombies.set(zid, { ped });
        dlog(`✅ streamIn zid=${zid} total=${zombies.size}`);
    }
    prepPed(ped);
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
            attachIfZombie(ent);
            forceAggroPedState(ent);
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
                forceAggroPedState(ped);
                ped.taskGoToCoordAnyMeans(targetPos.x, targetPos.y, targetPos.z, speed, 0, false, 0, 0.0);
                dlog(`follow taskGoToCoordAnyMeans zid=${zid} target=${actualTarget.id} dist=${dist.toFixed(2)} moving=${moving}`);

                try {
                    ped.taskFollowToOffsetOfEntity(actualTarget.handle, 0, 0, 0, speed, 2000, stopDist, true);
                    dlog(`follow fallback taskFollowToOffsetOfEntity zid=${zid} target=${actualTarget.id}`);
                } catch {}
            }
        }

        if ((!obj.lastNudgeAt || (now - obj.lastNudgeAt) >= STUCK_CD) && !moving) {
            obj.lastNudgeAt = now;
            try { ped.clearTasks(); } catch {}
            forceAggroPedState(ped);
            ped.taskGoStraightToCoord(targetPos.x, targetPos.y, targetPos.z, speed, 1200, 0.0, 0.0);
            dlog(`follow nudge taskGoStraightToCoord zid=${zid} dist=${dist.toFixed(2)}`);
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


const lootBags = new Map(); // lootId -> { id, x, y, z, dimension, objectId }
const LOOT_INTERACT_DISTANCE = 3.0;
const LOOT_CANCEL_DISTANCE = 3.5;
let activeLoot = null; // { lootId, startedAt, durationMs, finishTimer }
let lootPromptVisibleFor = null;
let lastLootVarsLogAt = 0;
let lastLootVarsLogId = null;

function getObjVarSafe(obj, name) {
    try {
        if (!obj || typeof obj.getVariable !== 'function') return undefined;
        return obj.getVariable(name);
    } catch {}
    return undefined;
}

function getLootObjectById(lootIdRaw) {
    const lootId = parseInt(lootIdRaw, 10);
    if (!Number.isFinite(lootId)) return null;

    let found = null;
    try {
        mp.objects.forEach((obj) => {
            if (found) return;
            try {
                if (!obj || !mp.objects.exists(obj)) return;
                if (obj.dimension !== me.dimension) return;
                if (getObjVarSafe(obj, 'isZombieLootBag') !== true) return;
                const objLootId = parseInt(getObjVarSafe(obj, 'lootId'), 10);
                if (!Number.isFinite(objLootId) || objLootId !== lootId) return;
                found = obj;
            } catch {}
        });
    } catch {}

    return found;
}

function getNearZombieLootObject(pos) {
    let best = null;
    let bestDist = Infinity;

    lootDebug('scan start');
    try {
        mp.objects.forEach((obj) => {
            try {
                if (!obj || !mp.objects.exists(obj)) return;
                if (obj.dimension !== me.dimension) return;

                const rawIsZombieLootBag = getObjVarSafe(obj, 'isZombieLootBag');
                const rawLootId = getObjVarSafe(obj, 'lootId');
                const rawCompatLootId = getObjVarSafe(obj, 'zLootBagId');
                const isZombieLootBag = rawIsZombieLootBag === true;
                const lootId = parseInt(rawLootId, 10);

                lootDebug(`object vars obj=${obj.remoteId} isZombieLootBag=${rawIsZombieLootBag} lootId=${rawLootId} zLootBagId=${rawCompatLootId}`);
                if (!isZombieLootBag) {
                    lootDebug(`reject reason=no-isZombieLootBag obj=${obj.remoteId}`);
                    return;
                }
                if (!Number.isFinite(lootId)) {
                    lootDebug(`reject reason=no-lootId obj=${obj.remoteId} lootId=${rawLootId} zLootBagId=${rawCompatLootId}`);
                    return;
                }

                const d = pos.distanceTo(obj.position);
                lootDebug(`candidate obj found lootId=${lootId} dist=${d.toFixed(2)}`);
                if (d >= bestDist) return;

                bestDist = d;
                best = {
                    object: obj,
                    lootId,
                    pos: obj.position,
                    distance: d,
                };
            } catch {}
        });
    } catch (e) {
        lootDebug(`getNearZombieLootObject error=${e.message}`);
    }

    if (best) {
        lootBags.set(best.lootId, {
            id: best.lootId,
            x: best.pos.x,
            y: best.pos.y,
            z: best.pos.z,
            dimension: me.dimension,
            objectId: best.object.remoteId,
        });
        if (lastLootVarsLogId !== best.lootId || Date.now() - lastLootVarsLogAt > 1500) {
            lastLootVarsLogId = best.lootId;
            lastLootVarsLogAt = Date.now();
            lootDebug(`nearest loot selected lootId=${best.lootId} obj=${best.object.remoteId} dist=${best.distance.toFixed(2)} dim=${me.dimension}`);
        }
    }

    return best;
}

function syncNearbyLootBags() {
    const validIds = new Set();
    try {
        mp.objects.forEach((obj) => {
            try {
                if (!obj || !mp.objects.exists(obj)) return;
                if (obj.dimension !== me.dimension) return;

                const isZombieLootBag = getObjVarSafe(obj, 'isZombieLootBag') === true;
                const lootId = parseInt(getObjVarSafe(obj, 'lootId'), 10);
                if (!isZombieLootBag || !Number.isFinite(lootId)) return;

                validIds.add(lootId);
                lootBags.set(lootId, {
                    id: lootId,
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z,
                    dimension: obj.dimension,
                    objectId: obj.remoteId,
                });
            } catch {}
        });
    } catch {}

    lootBags.forEach((bag, lootId) => {
        if (validIds.has(lootId)) return;
        if (bag && bag.objectId) lootBags.delete(lootId);
    });
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
    try { me.clearTasks(); } catch {}
}

function playLootAnim() {
    const dict = 'amb@prop_human_bum_bin@idle_b';
    const name = 'idle_d';
    if (!loadAnimDict(dict)) return;
    try { me.taskPlayAnim(dict, name, 8.0, -8.0, -1, 1, 0.0, false, false, false); } catch {}
}

function getNearestLootBag() {
    const nearestObject = getNearZombieLootObject(me.position);
    if (!nearestObject) return null;

    return {
        bag: {
            id: nearestObject.lootId,
            x: nearestObject.pos.x,
            y: nearestObject.pos.y,
            z: nearestObject.pos.z,
            dimension: me.dimension,
            objectId: nearestObject.object ? nearestObject.object.remoteId : null,
        },
        distance: nearestObject.distance,
    };
}

function cancelActiveLoot(reason = 'client-cancel') {
    if (!activeLoot) return;

    const lootId = activeLoot.lootId;
    if (activeLoot.finishTimer) clearTimeout(activeLoot.finishTimer);
    activeLoot = null;
    stopLootAnim();

    try { mp.events.callRemote('zloot:cancel', lootId, reason); } catch {}
}

mp.events.add('zloot:create', (data) => {
    try {
        if (!data || typeof data.id !== 'number') return;
        lootBags.set(data.id, {
            ...data,
            dimension: typeof data.dimension === 'number' ? data.dimension : me.dimension,
        });
    } catch {}
});

mp.events.add('zloot:remove', (lootIdRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        lootBags.delete(lootId);
        if (activeLoot && activeLoot.lootId === lootId) {
            if (activeLoot.finishTimer) clearTimeout(activeLoot.finishTimer);
            activeLoot = null;
            stopLootAnim();
        }
    } catch {}
});

mp.events.add('zloot:start', (lootIdRaw, durationRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        const durationMs = parseInt(durationRaw, 10) || 5000;

        if (activeLoot && activeLoot.finishTimer) clearTimeout(activeLoot.finishTimer);

        activeLoot = {
            lootId,
            startedAt: Date.now(),
            durationMs,
            finishTimer: setTimeout(() => {
                try { mp.events.callRemote('zloot:finish', lootId); } catch {}
            }, durationMs),
        };

        playLootAnim();
    } catch {}
});

mp.events.add('zloot:cancel', (lootIdRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        if (!activeLoot || activeLoot.lootId !== lootId) return;
        if (activeLoot.finishTimer) clearTimeout(activeLoot.finishTimer);
        activeLoot = null;
        stopLootAnim();
    } catch {}
});

mp.events.add('zloot:success', (lootIdRaw, itemIdRaw) => {
    try {
        const lootId = parseInt(lootIdRaw, 10);
        const itemId = parseInt(itemIdRaw, 10);
        if (activeLoot && activeLoot.lootId === lootId) {
            if (activeLoot.finishTimer) clearTimeout(activeLoot.finishTimer);
            activeLoot = null;
            stopLootAnim();
        }
        chat(`Вы нашли предмет #${itemId}`, '#99ff99');
    } catch {}
});

mp.keys.bind(0x45, true, () => {
    try {
        lootDebug('E pressed');
        if (activeLoot) { lootDebug('E ignored: active loot in progress'); return; }
        if (lootIsPlayerBusy()) { lootDebug('E ignored: player busy'); return; }
        const nearest = getNearestLootBag();
        if (!nearest) { lootDebug('E ignored reason=no-loot'); return; }
        lootDebug(`nearest loot on E lootId=${nearest.bag.id} dist=${nearest.distance.toFixed(2)} dim=${nearest.bag.dimension}`);
        if (nearest.distance > LOOT_INTERACT_DISTANCE) { lootDebug(`E ignored reason=too-far dist=${nearest.distance.toFixed(2)} max=${LOOT_INTERACT_DISTANCE}`); return; }
        lootDebug(`sending zloot:tryStart lootId=${nearest.bag.id}`);
        mp.events.callRemote('zloot:tryStart', nearest.bag.id);
    } catch {}
});

setInterval(() => {
    try {
        syncNearbyLootBags();

        if (activeLoot) {
            const lootObj = getLootObjectById(activeLoot.lootId);
            if (!lootObj || !lootObj.position) {
                cancelActiveLoot('bag-object-missing');
                return;
            }

            const dist = me.position.distanceTo(lootObj.position);
            const hp = Number(me.getHealth ? me.getHealth() : me.health) || 0;
            if (dist > LOOT_CANCEL_DISTANCE || hp <= 0) {
                cancelActiveLoot('client-conditions-fail');
                return;
            }

            playLootAnim();
            return;
        }

        const nearest = getNearestLootBag();
        if (!nearest || nearest.distance > LOOT_INTERACT_DISTANCE) {
            try { if (mp.prompt && mp.prompt.hide) { mp.prompt.hide(); lootDebug('hide prompt'); } } catch {}
            if (lootPromptVisibleFor !== null) {
                lootDebug('hide prompt');
                lootPromptVisibleFor = null;
            }
            return;
        }

        if (lastLootVarsLogId !== nearest.bag.id || Date.now() - lastLootVarsLogAt > 1500) {
            lastLootVarsLogId = nearest.bag.id;
            lastLootVarsLogAt = Date.now();
            lootDebug(`distance ok lootId=${nearest.bag.id} dist=${nearest.distance.toFixed(2)}`);
        }
        if (lootIsPlayerBusy()) {
            lootDebug('prompt blocked reason=player-busy');
            return;
        }

        try {
            if (mp.prompt && mp.prompt.showByName) {
                lootDebug(`show prompt lootId=${nearest.bag.id} key=zombie_loot_search promptPos=${nearest.bag.x.toFixed(2)},${nearest.bag.y.toFixed(2)},${nearest.bag.z.toFixed(2)}`);
                mp.prompt.showByName('zombie_loot_search');
                if (lootPromptVisibleFor !== nearest.bag.id) {
                    lootPromptVisibleFor = nearest.bag.id;
                    lootDebug(`prompt shown lootId=${nearest.bag.id}`);
                }
            }
        } catch {}
    } catch {}
}, 200);

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
