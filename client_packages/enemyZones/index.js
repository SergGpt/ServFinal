'use strict';

const me = mp.players.local;
const npcs = new Map(); // npcId -> ped
const pendingAssign = new Map(); // npcId -> ver
const deadReportAt = new Map();

function findPlayerById(rid) {
    let found = null;
    mp.players.forEach((p) => {
        if (!found && p.id === rid) found = p;
    });
    return found;
}

function findNpcPed(npcId) {
    const fromMap = npcs.get(npcId);
    if (fromMap && mp.peds.exists(fromMap)) return fromMap;

    let found = null;
    mp.peds.forEach((ped) => {
        if (found) return;
        if (!ped || !mp.peds.exists(ped)) return;
        if (ped.getVariable('enemyNpcId') === npcId) found = ped;
    });
    return found;
}

function attachEnemyPed(ped) {
    if (!ped || ped.type !== 'ped') return;
    const npcId = ped.getVariable('enemyNpcId');
    if (typeof npcId !== 'number') return;
    npcs.set(npcId, ped);

    try { ped.setBlockingOfNonTemporaryEvents(true); } catch {}
    try { ped.setKeepTask(true); } catch {}

    const pendingVer = pendingAssign.get(npcId);
    if (pendingVer != null) {
        mp.events.callRemote('z:ctrlAck', npcId, pendingVer);
        pendingAssign.delete(npcId);
    }
}

function detachEnemyPed(ped) {
    if (!ped || ped.type !== 'ped') return;
    const npcId = ped.getVariable('enemyNpcId');
    if (typeof npcId !== 'number') return;
    npcs.delete(npcId);
}

function isController(ped) {
    const rid = ped.getVariable('controllerRid');
    return typeof rid === 'number' && rid === me.id;
}

function doFollow(ped) {
    try {
        ped.taskFollowToOffsetOfEntity(me.handle, 0, 0, 0, 1.35, -1, 5.0, true);
    } catch {}
}

function doIdle(ped) {
    try {
        ped.clearTasks();
    } catch {}
}

function doFire(ped, payload) {
    const target = findPlayerById(payload && payload.rid);
    if (!target) return;

    try {
        const weaponHash = mp.game.joaat(payload.weapon || 'WEAPON_ASSAULTRIFLE');
        mp.game.weapon.giveWeaponToPed(ped.handle, weaponHash, 9999, true, true);
    } catch {}

    try {
        ped.taskShootAtEntity(target.handle, 100, mp.game.joaat('FIRING_PATTERN_BURST_FIRE'));
    } catch {
        try { ped.taskShootAtCoord(target.position.x, target.position.y, target.position.z, 100, mp.game.joaat('FIRING_PATTERN_BURST_FIRE')); } catch {}
    }
}

mp.events.add('entityStreamIn', (entity) => {
    try { attachEnemyPed(entity); } catch {}
});

mp.events.add('entityStreamOut', (entity) => {
    try { detachEnemyPed(entity); } catch {}
});

setTimeout(() => {
    mp.peds.forEach((ped) => {
        try { attachEnemyPed(ped); } catch {}
    });
}, 1000);

mp.events.add('z:assignController', (npcId, ver) => {
    const ped = findNpcPed(parseInt(npcId, 10));
    if (ped && mp.peds.exists(ped)) {
        mp.events.callRemote('z:ctrlAck', npcId, ver);
    } else {
        pendingAssign.set(parseInt(npcId, 10), parseInt(ver, 10));
    }
});

mp.events.add('z:executeCommand', (npcIdRaw, command, payloadRaw) => {
    const npcId = parseInt(npcIdRaw, 10);
    const ped = findNpcPed(npcId);
    if (!ped || !mp.peds.exists(ped)) return;
    if (!isController(ped)) return;

    let payload = {};
    try { payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : (payloadRaw || {}); } catch {}

    if (command === 'follow') doFollow(ped);
    else if (command === 'idle') doIdle(ped);
    else if (command === 'fire') doFire(ped, payload);
});

setInterval(() => {
    npcs.forEach((ped, npcId) => {
        if (!ped || !mp.peds.exists(ped)) return;
        if (!isController(ped)) return;

        const ver = parseInt(ped.getVariable('ctrlVer'), 10) || 0;
        mp.events.callRemote('z:ctrlHeartbeat', npcId, ver);
    });
}, 1000);

setInterval(() => {
    npcs.forEach((ped, npcId) => {
        if (!ped || !mp.peds.exists(ped)) return;

        const hp = Number(ped.getHealth ? ped.getHealth() : ped.health) || 0;
        if (hp > 0) return;

        const now = Date.now();
        const last = deadReportAt.get(npcId) || 0;
        if (now - last < 1000) return;

        deadReportAt.set(npcId, now);
        mp.events.callRemote('enemy:npcDeadSignal', npcId);
    });
}, 500);

function ensureEnemyZoneMenu() {
    mp.callCEFV(`(function() {
        selectMenu.menus["enemyZoneAdmin"] = {
            name: "enemyZoneAdmin",
            header: "Enemy NPC Zone",
            items: [
                { text: "Создать зону (на позиции)" },
                { text: "Добавить точку полигона" },
                { text: "NPC count: 1" },
                { text: "Respawn sec: 60" },
                { text: "Сохранить зону" },
                { text: "Список зон" },
                { text: "Закрыть" }
            ],
            i: 0,
            j: 0,
            handler(eventName) {
                var item = this.items[this.i];
                var e = { menuName: this.name, itemName: item.text, itemIndex: this.i };
                mp.trigger("selectMenu.handler", this.name, eventName, JSON.stringify(e));
            }
        };
    })()`);
}

mp.events.add('enemyzone:menu:open', () => {
    ensureEnemyZoneMenu();
    mp.events.call('selectMenu.show', 'enemyZoneAdmin');
});

mp.events.add('selectMenu.handler', (menuName, eventName, eRaw) => {
    if (menuName !== 'enemyZoneAdmin' || eventName !== 'onItemSelected') return;
    let e = eRaw;
    try { e = typeof eRaw === 'string' ? JSON.parse(eRaw) : eRaw; } catch {}

    switch (e.itemIndex) {
        case 0: mp.events.callRemote('enemyzone:menu:action', 'create', `EnemyZone_${Date.now()}`); break;
        case 1: mp.events.callRemote('enemyzone:menu:action', 'addpoint'); break;
        case 2: mp.events.callRemote('enemyzone:menu:action', 'setcount', 6); break;
        case 3: mp.events.callRemote('enemyzone:menu:action', 'setrespawn', 60); break;
        case 4: mp.events.callRemote('enemyzone:menu:action', 'save'); break;
        case 5: mp.events.callRemote('enemyzone:menu:action', 'list'); break;
        default: mp.events.call('selectMenu.hide'); break;
    }
});
