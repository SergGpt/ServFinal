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

    "guardCheckpoint:controller.heartbeat": (player, postId, ver) => {
        controller.onControllerHeartbeat(player, postId, ver);
    },

    "guardCheckpoint:pose:update": (player, postId, ver, payload) => {
        controller.onPoseUpdate(player, postId, ver, payload);
    },

    "guardCheckpoint.reload": async (player) => {
        if (!player || !player.character || player.character.admin < 5) return;
        await controller.reloadFromDb();
        player.call("selectMenu.notification", ["guardCheckpoint: loaded from DB"]);
    },
};
