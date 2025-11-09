"use strict";

const tennis = require('./index');

module.exports = {
    "init": () => {
        tennis.init({ notifications: call('notifications') });
        inited(__dirname);
    },
    "tennis.invite": (player, targetId) => {
        if (!player.character) return;
        tennis.handleInvite(player, targetId);
    },
    "tennis.accept": (player) => {
        if (!player.character) return;
        tennis.handleAccept(player);
    },
    "tennis.leave": (player) => {
        if (!player.character) return;
        tennis.handleLeave(player);
    },
    "tennis.swing": (player, charge, aimX, aimY, aimZ) => {
        if (!player.character) return;
        tennis.handleSwing(player, charge, aimX, aimY, aimZ);
    },
    "playerQuit": (player) => {
        tennis.onPlayerQuit(player);
    },
    "playerDeath": (player) => {
        if (!player.tennisMatch) return;
        player.tennisMatch.stopByPlayer(player);
    }
};
