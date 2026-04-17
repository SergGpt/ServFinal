"use strict";

const security = require("./index");

module.exports = {
    "init": async () => {
        try {
            await security.init();
        } catch (error) {
            console.error("[SECURITY] init failed:", error);
        }
        inited(__dirname);
    },

    "security.zone.create": async (player, info) => {
        try {
            const parsed = typeof info === "string" ? JSON.parse(info) : info;
            const zone = await security.createZone(parsed || {});

            if (player && mp.players.exists(player)) {
                player.call("security.zone.create.ans", [1, zone.id]);
            }
        } catch (error) {
            console.error("[SECURITY] failed to create zone:", error);
            if (player && mp.players.exists(player)) {
                player.call("security.zone.create.ans", [0]);
            }
        }
    },
};
