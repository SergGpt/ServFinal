const crafting = require('./index');

module.exports = {
    "init": async () => {
        await crafting.init();
    },
    "crafting.open": (player) => {
        crafting.open(player);
    },
    "crafting.craft": (player, recipeId) => {
        crafting.craft(player, recipeId);
    },
    "crafting.close": (player) => {
        player.call('crafting.close');
    }
};
