"use strict";

module.exports = {
    jobId: 12,
    requireEmployment: true,

    items: {
        seed: 300,
        cane: 301,
        emptyBottle: 246,
        moonshineBottle: 303,
    },

    planting: {
        maxActivePerPlayer: 6,
        seededToSproutMs: 10 * 60 * 1000,
        sproutToMatureMs: 20 * 60 * 1000,
        gracePeriodMs: 10 * 60 * 1000,
        witherAfterMs: 45 * 60 * 1000,
        harvestYield: [1, 3],
    },

    vendor: {
        position: { x: 1479.905, y: 1154.073, z: 113.301, heading: 90 },
        pricePerSeed: 50,
        dailyLimit: 20,
    },

    menu: {
        position: { x: 1476.148, y: 1156.927, z: 113.301, heading: 0 },
        radius: 1.75,
        blip: {
            sprite: 566,
            color: 46,
            scale: 0.9,
            name: 'Самогонщик',
        },
    },

    craft: {
        position: { x: 1475.892, y: 1149.214, z: 113.301, heading: 180 },
        durationMs: 25 * 1000,
        caneRequired: 3,
        bottlesRequired: 1,
        xpGain: 5,
        xpCooldownMs: 30 * 1000,
    },

    effect: {
        durationMs: 3 * 60 * 1000,
        speedMultiplier: 1.1,
        maxHealth: 120,
        healthThresholdPercent: 10,
        useCooldownMs: 1500,
    },

    plots: [
        { plotId: 1, x: 1471.312, y: 1160.544, z: 114.322, radius: 1.5 },
        { plotId: 2, x: 1473.812, y: 1158.112, z: 114.312, radius: 1.5 },
        { plotId: 3, x: 1476.256, y: 1155.713, z: 114.305, radius: 1.5 },
        { plotId: 4, x: 1478.731, y: 1153.278, z: 114.296, radius: 1.5 },
        { plotId: 5, x: 1481.228, y: 1150.848, z: 114.287, radius: 1.5 },
        { plotId: 6, x: 1483.690, y: 1148.441, z: 114.278, radius: 1.5 },
        { plotId: 7, x: 1486.167, y: 1146.002, z: 114.269, radius: 1.5 },
        { plotId: 8, x: 1488.670, y: 1143.580, z: 114.260, radius: 1.5 },
        { plotId: 9, x: 1491.132, y: 1141.173, z: 114.251, radius: 1.5 },
        { plotId: 10, x: 1493.625, y: 1138.741, z: 114.242, radius: 1.5 },
        { plotId: 11, x: 1496.108, y: 1136.323, z: 114.233, radius: 1.5 },
        { plotId: 12, x: 1498.570, y: 1133.903, z: 114.224, radius: 1.5 },
    ],
};
