const rastScrap = require('./index');

module.exports = {
    "init": async () => {
        await rastScrap.init();
    },
    "rast.scrap.collect": (player) => {
        rastScrap.collect(player);
    }
};
