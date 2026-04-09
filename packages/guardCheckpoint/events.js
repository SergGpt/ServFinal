"use strict";

const { controller } = require("./index");

module.exports = {
    init: () => {
        controller.start();
        inited(__dirname);
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
};
