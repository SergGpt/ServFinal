"use strict";

let moduleApi = require('./index');

module.exports = {
    init: async () => {
        await moduleApi.init();
        inited(__dirname);
    },

    'player.joined': (player) => {
        player.call('npcattakzone.zone.sync', [moduleApi.getZoneData()]);
        moduleApi.playerStates.set(player.id, false);
        player.setVariable('npcattakzone:inside', false);
    },

    playerQuit: (player) => {
        if (!player) return;
        moduleApi.onPlayerQuit(player);
    },

    'npcattakzone.menu.open': (player) => {
        if (!player || !player.character || player.character.admin < 6) return;
        player.call('npcattakzone.menu.show', [moduleApi.getZoneData()]);
    },

    'npcattakzone.menu.save': async (player, zoneJson) => {
        if (!player || !player.character || player.character.admin < 6) return;

        let data = null;
        try {
            data = typeof zoneJson === 'string' ? JSON.parse(zoneJson) : zoneJson;
        } catch (e) {}

        if (!data) return;

        const zonePayload = {
            id: moduleApi.zone ? moduleApi.zone.id : null,
            name: data.name || 'NpcAttakZone',
            dimension: Number(player.dimension) || 0,
            points: Array.isArray(data.points) ? data.points : [],
            minZ: data.minZ,
            maxZ: data.maxZ,
            enabled: true,
        };

        const ok = await moduleApi.setZoneFromMenu(player, zonePayload);
        if (ok) {
            player.call('npcattakzone.menu.show', [moduleApi.getZoneData()]);
        }
    },

    'npcattakzone:npc.ctrlAck': (player, nid, ver) => {
        moduleApi.onControllerAck(player, nid, ver);
    },

    'npcattakzone:npc.heartbeat': (player, nid, posJson) => {
        moduleApi.onHeartbeat(player, nid, posJson);
    },

    'npcattakzone.pass.ready': (player, nid, targetRid) => {
        moduleApi.onPassReady(player, nid, targetRid);
    },

    'npcattakzone.pass.answer': (player, answer) => {
        moduleApi.onPassAnswer(player, answer);
    },
};
