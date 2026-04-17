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
        moduleApi.playerStates.delete(player.id);
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
};
