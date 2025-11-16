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
        position: { x: -1922.2802734375, y: 2040.43994140625, z: 140.73544311523438, heading: 90 },
        pricePerSeed: 50,
        dailyLimit: 20,
    },

    menu: {
        position: { x: -1921.6285400390625, y: 2044.9886474609375, z: 140.7354278564453, heading: 0 },
        radius: 1.75,
        blip: {
            sprite: 566,
            color: 46,
            scale: 0.9,
            name: 'Самогонщик',
        },
    },

    craft: {
        position: { x: -1912.6265869140625, y: 2085.56982421875, z: 140.38400268554688, heading: 180 },
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

    defaultPlotRadius: 1.5,
};
