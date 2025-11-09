const lootboxes = call('lootboxes');

module.exports = {
    "init": async () => {
        lootboxes.init();
        inited(__dirname);
    },
    "lootboxes.crate.hit": async (player) => {
        await lootboxes.hitCrate(player);
    },
    "playerEnterWorldObject": (player, colshape) => {
        if (!colshape?.db || colshape.db.type !== lootboxes.crateWorldType) return;

        if (colshape.destroyTime && Date.now() - colshape.destroyTime > lootboxes.respawnTime) {
            colshape.health = lootboxes.crateMaxHealth;
            delete colshape.destroyTime;
        }

        lootboxes.onPlayerEnter(player, colshape);
    },
    "playerExitWorldObject": (player, colshape) => {
        if (!colshape?.db || colshape.db.type !== lootboxes.crateWorldType) return;
        lootboxes.onPlayerExit(player, colshape);
    },
};
