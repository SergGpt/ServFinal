'use strict';

const enemyZones = require('./server/enemyZones');

module.exports = {
    init: async () => {
        await enemyZones.init();
        inited(__dirname);
    },

    'enemyzone:open': (player) => enemyZones.openEditorMenu(player),
    'z:ctrlAck': (player, npcId, ver) => enemyZones.handleCtrlAck(player, npcId, ver),
    'z:ctrlHeartbeat': (player, npcId, ver) => enemyZones.handleCtrlHeartbeat(player, npcId, ver),
    'enemy:npcDeadSignal': (player, npcId) => enemyZones.onNpcDeadSignal(npcId),

    'enemyzone:menu:action': async (player, action, value) => {
        if (!enemyZones.isPlayerAdmin(player)) return;

        if (action === 'create') {
            const zone = enemyZones.createEditorZone(player, value);
            player.outputChatBox(`!{#66ff66}[ENEMY] Черновик зоны создан: ${zone.name}.`);
        } else if (action === 'addpoint') {
            const zone = enemyZones.addEditorPoint(player);
            player.outputChatBox(zone
                ? `!{#66ff66}[ENEMY] Добавлена точка. Всего точек: ${zone.points.length}.`
                : '!{#ff6666}[ENEMY] Сначала создайте черновик зоны.');
        } else if (action === 'setcount') {
            const zone = enemyZones.setEditorCount(player, value);
            player.outputChatBox(zone
                ? `!{#66ff66}[ENEMY] Количество NPC: ${zone.zombieCount}.`
                : '!{#ff6666}[ENEMY] Нет активного черновика зоны.');
        } else if (action === 'setrespawn') {
            const zone = enemyZones.setEditorRespawn(player, value);
            player.outputChatBox(zone
                ? `!{#66ff66}[ENEMY] Респавн: ${zone.respawnSec} сек.`
                : '!{#ff6666}[ENEMY] Нет активного черновика зоны.');
        } else if (action === 'save') {
            const result = await enemyZones.saveEditorZone(player);
            if (!result.ok) {
                player.outputChatBox(`!{#ff6666}[ENEMY] Ошибка сохранения: ${result.error}`);
            } else {
                player.outputChatBox(`!{#66ff66}[ENEMY] Зона #${result.zone.id} сохранена.`);
            }
        } else if (action === 'list') {
            const list = await enemyZones.getZoneList();
            if (!list.length) return player.outputChatBox('!{#ffcc66}[ENEMY] Зон нет.');
            list.forEach((z) => player.outputChatBox(`!{#aaddff}[ENEMY] #${z.id} ${z.name} | dim=${z.dimension} | npc=${z.zombieCount} | respawn=${z.respawnSec}s | points=${z.points}`));
        } else if (action === 'goto') {
            const ok = enemyZones.gotoZone(player, value);
            if (!ok) player.outputChatBox('!{#ff6666}[ENEMY] Зона не найдена.');
        } else if (action === 'reload') {
            const ok = await enemyZones.reloadZone(value);
            if (!ok) player.outputChatBox('!{#ff6666}[ENEMY] Зона не найдена.');
        }
    },
};
