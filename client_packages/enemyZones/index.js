"use strict";

const ENEMY_MODEL = (typeof mp.joaat === 'function' ? mp.joaat('s_m_y_army_01') : mp.game.joaat('s_m_y_army_01'));
const FIRING_PATTERN_BURST_FIRE = 0xD6FF6D61;

const state = {
    controlled: new Map(), // pedId -> {pedId,lastSeen}
    streamedNpcIds: new Set(),
    builder: null,
    heartbeatTimer: null,
};

function getPedByRemoteId(id) {
    if (typeof mp.peds.atRemoteId === 'function') return mp.peds.atRemoteId(id);
    if (typeof mp.peds.at === 'function') return mp.peds.at(id);
    return null;
}

function getPlayerByRemoteId(id) {
    if (typeof mp.players.atRemoteId === 'function') return mp.players.atRemoteId(id);
    if (typeof mp.players.at === 'function') return mp.players.at(id);
    return null;
}

function drawBuilderPolygon() {
    const b = state.builder;
    if (!b || !Array.isArray(b.points) || b.points.length === 0) return;

    if (mp.players.local.dimension !== Number(b.dimension || 0)) return;

    for (let i = 0; i < b.points.length; i++) {
        const a = b.points[i];
        const n = b.points[(i + 1) % b.points.length];

        mp.game.graphics.drawLine(
            a.x, a.y, a.z + 0.25,
            n.x, n.y, n.z + 0.25,
            0, 255, 70, 220
        );

        mp.game.graphics.drawText(`#${i + 1}`, [a.x, a.y, a.z + 0.6], {
            font: 0,
            color: [255, 255, 255, 220],
            scale: [0.25, 0.25],
            outline: true,
        });
    }
}

function startHeartbeat() {
    if (state.heartbeatTimer) return;

    state.heartbeatTimer = setInterval(() => {
        state.controlled.forEach((ctrl, pedId) => {
            const ped = getPedByRemoteId(pedId);
            if (!ped || !ped.handle) {
                state.controlled.delete(pedId);
                return;
            }
            mp.events.callRemote('z:ctrlHeartbeat', pedId);
            ctrl.lastSeen = Date.now();
        });
    }, 1000);
}

function openAdminMenu() {
    // Простое динамическое select menu (через CEF runtime-объект)
    const menuJson = JSON.stringify({
        name: 'enemyZoneAdmin',
        header: 'Enemy Zones',
        items: [
            { text: 'Create zone', values: ['Start'], action: 'create' },
            { text: 'Add polygon point', values: ['Current pos'], action: 'addpoint' },
            { text: 'NPC count +1', values: ['+1'], action: 'setcount_plus' },
            { text: 'Respawn +10s', values: ['+10'], action: 'setrespawn_plus' },
            { text: 'Save zone', values: ['DB'], action: 'save' },
            { text: 'List zones', values: ['Chat'], action: 'list' },
            { text: 'Reload zones', values: ['DB->Runtime'], action: 'reload' },
            { text: 'Close', values: ['Exit'], action: 'close' },
        ],
    });

    mp.callCEFV(`selectMenu.menu = ${menuJson};`);
    mp.callCEFV('selectMenu.show = true;');
}

mp.events.add('playerReady', () => startHeartbeat());

mp.events.add('entityStreamIn', (entity) => {
    if (!entity || entity.type !== 'ped') return;
    if (entity.model === ENEMY_MODEL || entity.getVariable('enemyZoneNpc')) {
        state.streamedNpcIds.add(entity.id);
    }
});

mp.events.add('entityStreamOut', (entity) => {
    if (!entity || entity.type !== 'ped') return;
    state.streamedNpcIds.delete(entity.id);
    state.controlled.delete(entity.id);
});

mp.events.add('z:assignController', (pedId) => {
    pedId = Number(pedId);
    const ped = getPedByRemoteId(pedId);
    if (!ped) return;

    state.controlled.set(pedId, { pedId, lastSeen: Date.now() });
    mp.events.callRemote('z:ctrlAck', pedId);
});

mp.events.add('z:executeCommand', (command, pedId, targetRid) => {
    pedId = Number(pedId);
    targetRid = Number(targetRid);

    const ped = getPedByRemoteId(pedId);
    if (!ped) return;

    if (!state.controlled.has(pedId)) {
        state.controlled.set(pedId, { pedId, lastSeen: Date.now() });
    }

    if (command === 'follow') {
        const target = getPlayerByRemoteId(targetRid);
        if (target) ped.taskFollowToOffsetOfEntity(target.handle, 0, 0, 0, 1.35, -1, 5.0, true);
        return;
    }

    if (command === 'idle') {
        ped.clearTasks();
        return;
    }

    if (command === 'fire') {
        const target = getPlayerByRemoteId(targetRid);
        if (target) ped.taskShootAtEntity(target.handle, 100, FIRING_PATTERN_BURST_FIRE);
    }
});

mp.events.add('z:forceRemove', (pedId) => {
    pedId = Number(pedId);
    state.controlled.delete(pedId);
    state.streamedNpcIds.delete(pedId);

    const ped = getPedByRemoteId(pedId);
    if (ped && ped.handle) {
        try { ped.destroy(); } catch {}
    }
});

mp.events.add('render', () => {
    drawBuilderPolygon();

    state.streamedNpcIds.forEach((pedId) => {
        const ped = getPedByRemoteId(pedId);
        if (!ped || !ped.handle) return;

        if (Number(ped.getHealth()) <= 0) {
            mp.events.callRemote('enemy:npcDeadSignal', pedId);
            state.controlled.delete(pedId);
            state.streamedNpcIds.delete(pedId);
        }
    });
});

mp.events.add('enemyzone:builder:update', (payloadJson) => {
    try {
        state.builder = JSON.parse(payloadJson);
    } catch {
        state.builder = null;
    }
});

mp.events.add('enemyzone:builder:clear', () => {
    state.builder = null;
});

mp.events.add('enemyzone:client:openMenu', () => {
    openAdminMenu();
});

// hook selectMenu callbacks for this custom menu
mp.events.add('selectMenu.handler', (menuName, eventName, eJson) => {
    if (menuName !== 'enemyZoneAdmin' || eventName !== 'onItemSelected') return;

    let e = {};
    try { e = JSON.parse(eJson || '{}'); } catch {}

    const action = e.item && e.item.action ? e.item.action : (e.itemName || '');
    if (!action || action === 'close') {
        mp.callCEFV('selectMenu.show = false;');
        return;
    }

    if (action === 'setcount_plus') {
        mp.events.callRemote('enemyzone:menu:action', 'setcount', JSON.stringify({ count: 5 }));
        return;
    }

    if (action === 'setrespawn_plus') {
        mp.events.callRemote('enemyzone:menu:action', 'setrespawn', JSON.stringify({ respawnSec: 70 }));
        return;
    }

    if (action === 'create') {
        mp.events.callRemote('enemyzone:menu:action', 'create', JSON.stringify({ name: 'Enemy Zone' }));
        return;
    }

    mp.events.callRemote('enemyzone:menu:action', action, '{}');
});
