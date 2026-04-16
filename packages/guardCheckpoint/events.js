"use strict";

const guardCheckpoint = require("./index");
const { controller } = guardCheckpoint;

module.exports = {
    init: async () => {
        await controller.initialize();
        controller.start();
        inited(__dirname);
    },
    shutdown: () => {
        guardCheckpoint.shutdown();
    },

    playerQuit: (player) => {
        controller.onPlayerQuit(player);
    },

    playerDeath: (player) => {
        controller.onPlayerDeath(player);
    },

    playerWeaponChange: (player, oldWeapon, newWeapon) => {
        controller.onPlayerWeaponChange(player, oldWeapon, newWeapon);
    },

    playerDamage: (player, healthLoss, armourLoss, attacker) => {
        controller.onPlayerDamage(player, attacker);
    },


    "guardCheckpoint:controller.ack": (player, postId, ver) => {
        controller.onControllerAck(player, postId, ver);
    },

    "guardCheckpoint:npc.dead": (player, postId, pedId) => {
        controller.onNpcDeadSignal(player, postId, pedId);
    },

    "guardCheckpoint:syncDamage": (player, postId, sourcePedId, targetPlayerId, weaponHash, boneIndex, damage) => {
        controller.onSyncDamage(player, postId, sourcePedId, targetPlayerId, weaponHash, boneIndex, damage);
    },

    "guardCheckpoint:testConnection": (player, payload = "ping") => {
        if (!player || !player.call) return;
        player.call("guardCheckpoint:testReply", [{ ok: true, payload, at: Date.now() }]);
    },

    "guardCheckpoint:testReply": (player, payload = null) => {
        if (!player || !player.call) return;
        player.call("guardCheckpoint:testReply", [{ ok: true, echo: payload, at: Date.now() }]);
    },

    "guardCheckpoint.reload": async (player) => {
        if (!player || !player.character || player.character.admin < 5) return;
        await controller.reloadFromDb();
        player.call("selectMenu.notification", ["guardCheckpoint: loaded from DB"]);
    },
};
