"use strict";
var time = require('./index.js');

module.exports = {
    "init": () => {
        time.init();
        inited(__dirname);
    },
    "time.sync.request": (player) => {
        player.call("time.sync", [mp.world.time.hour, mp.world.time.minute]);
    },
}
