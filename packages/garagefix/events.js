"use strict";

let isPatched = false;

function syncVehicleDimension(vehicle) {
    if (!vehicle || vehicle.d == null) return;
    vehicle.dimension = vehicle.d;
    if (vehicle.db) vehicle.db.dimension = vehicle.d;
}

function patchVehicles() {
    if (isPatched) return;

    const vehicles = call("vehicles");
    if (!vehicles || vehicles.isEmpty || typeof vehicles.spawnVehicle !== "function") return;

    const originalSpawnVehicle = vehicles.spawnVehicle.bind(vehicles);
    vehicles.spawnVehicle = async function(veh, source) {
        if (veh && veh.d != null) veh.dimension = veh.d;
        const spawnedVehicle = await originalSpawnVehicle(veh, source);
        syncVehicleDimension(spawnedVehicle);
        return spawnedVehicle;
    };

    ["setVehicleHomeSpawnPlace", "setVehicleHomeSpawnPlaceByVeh"].forEach((methodName) => {
        if (typeof vehicles[methodName] !== "function") return;
        const originalMethod = vehicles[methodName].bind(vehicles);
        vehicles[methodName] = function(player, vehicle) {
            const result = originalMethod(player, vehicle);
            syncVehicleDimension(vehicle || (player && player.vehicle));
            return result;
        };
    });

    isPatched = true;
    console.log("[GARAGEFIX] Home garage vehicle dimension patch enabled");
}

module.exports = {
    "init": () => {
        patchVehicles();
        inited(__dirname);
    },
    "vehicles.loaded": () => {
        patchVehicles();
    }
};
