"use strict";

const EnemyZonesSystem = require('./server/enemyZones');

let system = null;

module.exports = {
    async init(dbRef) {
        if (!system) {
            system = new EnemyZonesSystem();
            await system.init(dbRef || global.db);
        }
        return system;
    },

    getSystem() {
        return system;
    },

    async stop() {
        if (!system) return;
        system.destroy();
        system = null;
    },
};
