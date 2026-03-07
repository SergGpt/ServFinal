// ============================
// RAGE:MP — Zombies (Client) — raycast hits + forceRemove
// ============================

const DEBUG = true;
let VERBOSE = true;

const me = mp.players.local;
const zombies = new Map(); // zid -> { ped, followRid, lastFollowAt, lastNudgeAt }
const pendingControllerAssign = new Map(); // zid -> { ver, at }

const STEP_SPEED = 1.35;
const STOP_DIST  = 1.6;
const FOLLOW_CD  = 350;
const STUCK_CD   = 1000;
const MIN_STEP   = 0.04;
const HIT_REPORT_CD = 250;
const hitReportAt = new Map(); // zid -> ts
const DEAD_REPORT_CD = 1000;
const deadReportAt = new Map(); // zid -> ts

function chatRaw(str){ try{ mp.gui.chat.push(str); }catch{} }
function chat(msg,color='#ffffff'){ chatRaw(`!{${color}}${msg}`); }
function dlog(msg){ if(DEBUG && VERBOSE) chat(`[ZDBG] ${msg}`,'#99ccff'); }

function reportHit(zid, dmg, reason = 'unknown') {
    try {
        const now = Date.now();
        const last = hitReportAt.get(zid) || 0;
        if (now - last < HIT_REPORT_CD) return;
        hitReportAt.set(zid, now);
        mp.events.callRemote('z:hit', zid, dmg);
        dlog(`→ reportHit zid=${zid} dmg=${dmg} reason=${reason}`);
    } catch {}
}

function reportDead(zid, reason = 'unknown') {
    try {
        const now = Date.now();
        const last = deadReportAt.get(zid) || 0;
        if (now - last < DEAD_REPORT_CD) return;
        deadReportAt.set(zid, now);
        mp.events.callRemote('z:deadSignal', zid, reason);
        dlog(`→ reportDead zid=${zid} reason=${reason}`);
    } catch {}
}

// ====== подготовка педа ======
function prepPed(ped){
    try{ mp.game.entity.setEntityAsMissionEntity(ped.handle,true,true);}catch{}
    try{ ped.setInvincible(false); }catch{}
    try{ ped.setCollision(true,true); }catch{}
    try{ ped.setBlockingOfNonTemporaryEvents(true); }catch{}
    try{ ped.setKeepTask(true); }catch{}
    try{ ped.setCanRagdoll(true); }catch{}
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
        const target = findPlayerById(obj.followRid) || me;
        applyFollowTask(obj, ped, target, Date.now());
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
        setTimeout(() => ackController(zid, pending.ver), 150);
        setTimeout(() => ackController(zid, pending.ver), 500);

        pendingControllerAssign.delete(zid);
    } catch {}
}

mp.events.add('entityStreamIn', (ent) => {
    try { if (ent && ent.type === 'ped') { attachIfZombie(ent); tryResolvePendingAssignByPed(ent); } } catch {}
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

function findPlayerById(rid){
    if (typeof rid !== 'number') return null;
    let found = null;
    try { mp.players.forEach(p => { if (!found && p.id === rid) found = p; }); } catch {}
    return found;
}


function applyFollowTask(obj, ped, target, now) {
    try {
        if (!obj || !ped || !target) return;

        const dist = target.position.distanceTo(ped.position);
        if (dist <= STOP_DIST) return;

        if (!obj.lastFollowAt || (now - obj.lastFollowAt) >= FOLLOW_CD) {
            obj.lastFollowAt = now;
            ped.taskFollowToOffsetOfEntity(target.handle, 0,0,0, STEP_SPEED, -1, STOP_DIST, true);
        }

        // мягкий "пинок" навигации, если ped визуально завис
        if (!obj.lastNudgeAt || (now - obj.lastNudgeAt) >= 1200) {
            obj.lastNudgeAt = now;
            ped.taskGoStraightToCoord(target.position.x, target.position.y, target.position.z, STEP_SPEED, 1200, 0.0, 0.0);
            ped.taskFollowToOffsetOfEntity(target.handle, 0,0,0, STEP_SPEED, -1, STOP_DIST, true);
        }
    } catch {}
}

// ====== события от сервера ======

// сервер говорит: "ты контроллер вот этого педа"
mp.events.add('z:assignController', (zid, ver, pedHandle) => {
    try{
        zid = parseInt(zid);
        ver = parseInt(ver);

        const ped = mp.peds.atHandle(pedHandle);
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
        setTimeout(() => ackController(zid, ver), 150);
        setTimeout(() => ackController(zid, ver), 500);

        pendingControllerAssign.delete(zid);
    }catch{}
});

// сервер говорит: "выполни команду"
mp.events.add('z:executeCommand', (zid, cmd, extraJson) => {
    try{
        const obj = zombies.get(zid);
        if(!obj) return;
        const ped = obj.ped;
        if(!mp.peds.exists(ped)) return;

        const extra = extraJson ? JSON.parse(extraJson) : {};

        switch (cmd) {
            case 'idle':
                try { ped.taskStandStill(500); } catch {}
                break;
            case 'follow': {
                obj.followRid = (extra && typeof extra.rid === 'number') ? extra.rid : me.id;
                const target = findPlayerById(obj.followRid) || me;
                applyFollowTask(obj, ped, target, Date.now());
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
        hitReportAt.delete(zid);
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
    reportDead(zid, 'server-dead-event');
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
            const deadOrDying = mp.game.entity.isEntityDead(ped.handle, false)
                || mp.game.ped.isPedDeadOrDying(ped.handle, true)
                || hp <= 0;
            if (!deadOrDying) return;
            reportDead(zid, `client-loop hp=${hp}`);
        } catch {}
    });
}, 500);

// ====== ДВИЖЕНИЕ У КОНТРОЛЛЕРА ======
setInterval(() => {
    zombies.forEach((obj) => {
        const ped = obj.ped;
        if (!mp.peds.exists(ped)) return;
        if (!isController(ped)) return;

        try {
            const targetRid = typeof obj.followRid === 'number' ? obj.followRid : me.id;
            const target = findPlayerById(targetRid) || me;
            applyFollowTask(obj, ped, target, Date.now());
        } catch {}
    });
}, 300);

// ====== HIT: raycast по выстрелу ======

// вспомогательная — пуск луча
function raycastFromCam(dist){
    const camPos = mp.game.cam.getGameplayCamCoord();
    const camRot = mp.game.cam.getGameplayCamRot(2);
    const pitch = camRot.x * Math.PI / 180.0;
    const yaw   = camRot.z * Math.PI / 180.0;

    const dir = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y:  Math.cos(yaw) * Math.cos(pitch),
        z:  Math.sin(pitch)
    };

    const to = {
        x: camPos.x + dir.x * dist,
        y: camPos.y + dir.y * dist,
        z: camPos.z + dir.z * dist
    };

    // shapeTestRay
    const ray = mp.raycasting.testPointToPoint(camPos, to, [1, 16]); // 8 - ped?, но чаще берут вот так
    return ray;
}

// ловим выстрел
mp.events.add('playerWeaponShot', () => {
    try {
        const hit = raycastFromCam(60.0);
        if (!hit || !hit.entity || hit.entity.type !== 'ped') return;

        const zid = hit.entity.getVariable('zid');
        if (typeof zid !== 'number') return; // не наш

        // пока ставим фиксированный урон
        const dmg = 35;
        reportHit(zid, dmg, 'weaponShot-raycast');
    } catch (e) {
        // ignore
    }
});

// дополнительный надежный канал: срабатывает при реальном уроне ped
mp.events.add('entityDamaged', (entity, attacker, weapon, damage) => {
    try {
        if (!entity || entity.type !== 'ped') return;
        const zid = entity.getVariable('zid');
        if (typeof zid !== 'number') return;

        if (!attacker || attacker.type !== 'player') return;
        if (attacker.handle !== me.handle) return;

        const dmg = Math.max(1, parseInt(damage) || 25);
        reportHit(zid, dmg, `entityDamaged-w=${weapon}`);

        try {
            const hp = Number(entity.getHealth ? entity.getHealth() : entity.health) || 0;
            if (hp <= 0) reportDead(zid, `entityDamaged-kill w=${weapon}`);
        } catch {}
    } catch {}
});

// ===== КЛАВИША: убить ближайшего зомби (для теста)
mp.keys.bind(0x6B, true, () => { // NumPad +
    let best = null, bestD = Infinity;
    zombies.forEach((obj, zid) => {
        if (!mp.peds.exists(obj.ped)) return;
        const d = me.position.distanceTo(obj.ped.position);
        if (d < bestD) { bestD = d; best = zid; }
    });
    if (best !== null) {
        chat(`→ kill request zid=${best}`, '#ffcc00');
        mp.events.callRemote('z:hit', best, 200); // гарантированно убьём
    } else {
        chat('нет зомби рядом', '#ff6666');
    }
});

// F7 — вкл/выкл логи
mp.keys.bind(0x76, true, () => {
    VERBOSE = !VERBOSE;
    chat(`[Z] LOGS: ${VERBOSE ? 'ON':'OFF'}`, '#cfc');
});
