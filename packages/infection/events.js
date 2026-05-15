const infection = require('./index');

module.exports = {
    "init": async () => {
        await infection.init();
    },
    "characterInit.done": (player) => {
        if (player.character && player.character.infection == null) player.character.infection = 0;
        infection.sync(player);
        infection.startTimer(player);
    },
    "playerQuit": (player) => {
        if (!player.character) return;
        infection.stopTimer(player);
    },
    "playerDeath": (player) => {
        infection.reduceAfterDeath(player);
    },
    "infection.addBite": (player) => {
        infection.addBite(player);
    },
};
