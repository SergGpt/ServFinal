"use strict";

const enemyZonesModule = require('./index');

function isAdmin(player) {
    return !!(player && player.character && Number(player.character.admin) >= 2);
}

module.exports = {
    init: async () => {
        await enemyZonesModule.init(global.db);
        inited(__dirname);
    },

    'z:ctrlAck': (player, pedId) => {
        enemyZonesModule.getSystem().onCtrlAck(player, Number(pedId));
    },

    'z:ctrlHeartbeat': (player, pedId) => {
        enemyZonesModule.getSystem().onCtrlHeartbeat(player, Number(pedId));
    },

    'enemy:npcDeadSignal': (player, pedId) => {
        enemyZonesModule.getSystem().onNpcDeadSignal(player, Number(pedId));
    },

    'enemyzone:menu:action': async (player, action, payloadJson) => {
        if (!isAdmin(player)) return;

        let payload = {};
        try { payload = JSON.parse(payloadJson || '{}'); } catch {}

        const sys = enemyZonesModule.getSystem();
        const act = String(action || '').toLowerCase();

        if (act === 'create') {
            sys.startCreate(player, payload.name || 'Enemy Zone');
            player.call('selectMenu.notification', ['Черновик зоны создан']);
            return;
        }

        if (act === 'addpoint') {
            const r = sys.addPoint(player);
            player.call('selectMenu.notification', [r.msg]);
            return;
        }

        if (act === 'setcount') {
            const r = sys.setCount(player, payload.count);
            player.call('selectMenu.notification', [r.msg]);
            return;
        }

        if (act === 'setrespawn') {
            const r = sys.setRespawn(player, payload.respawnSec);
            player.call('selectMenu.notification', [r.msg]);
            return;
        }

        if (act === 'save') {
            const r = await sys.saveDraft(player);
            player.call('selectMenu.notification', [r.msg]);
            return;
        }

        if (act === 'list') {
            const zones = sys.listZones();
            player.outputChatBox(`!{#f0e68c}[EnemyZones] Всего зон: ${zones.length}`);
            zones.forEach((z) => {
                player.outputChatBox(`!{#c8ffc8}#${z.id} ${z.name} | dim:${z.dimension} | npc:${z.npcCount} | players:${z.players} | alive:${z.npcs}`);
            });
            return;
        }

        if (act === 'goto') {
            const r = await sys.gotoZone(player, payload.id);
            player.call('selectMenu.notification', [r.msg]);
            return;
        }

        if (act === 'reload') {
            await sys.reload();
            player.call('selectMenu.notification', ['Enemy zones перезагружены']);
            return;
        }
    },
};
