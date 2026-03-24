"use strict";

const config = require("./config");

function isVehicleAllowed(vehicle) {
    if (!vehicle) return false;
    if (!vehicle.modelName) return false;
    return config.driftVehicles.includes(vehicle.modelName.toLowerCase());
}

module.exports = {
    "init": () => {
        inited(__dirname);
    },
    "player.joined": (player) => {
        player.call("drift.config", [config]);
    },
    "playerQuit": (player) => {
        if (player.vehicle && mp.vehicles.exists(player.vehicle)) {
            player.vehicle.setVariable("drift:state", { active: false });
        }
    },
    "drift.state.update": (player, active, mode, scale) => {
        if (!player.vehicle || !mp.vehicles.exists(player.vehicle)) return;
        if (player.vehicle.getOccupant(0) !== player) return;
        if (!isVehicleAllowed(player.vehicle)) {
            player.vehicle.setVariable("drift:state", { active: false });
            return;
        }

        const safeMode = mode === "burnout" ? "burnout" : "drift";
        const safeScale = Math.min(Math.max(Number(scale) || 0, 0), 2);
        const isActive = Boolean(active);

        player.vehicle.setVariable("drift:state", {
            active: isActive,
            mode: safeMode,
            scale: safeScale,
        });
    },
};
