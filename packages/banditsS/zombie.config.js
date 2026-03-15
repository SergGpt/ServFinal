const ZOMBIE_CONFIG = {
    debug: false,
    models: ['u_m_y_zombie_01'],

    stats: {
        hp: 100,
        damage: 5,
        attackRange: 2.8,
        attackWarmupMs: 3000,
        moveSpeed: 1.35,
        stopDistance: 1.6,
    },

    timers: {
        zonePresenceMs: 15000,
        waveSpawnCheckMs: 5000,
        waveIntervalMs: 60 * 1000,
        zoneEntryScanMs: 1000,
        syncMs: 700,
        attackMs: 350,
        deadSyncMs: 450,
        cleanupMs: 1200,
        hpDebugMs: 12000,
        cmdDebugMs: 5000,
        deadRemoveDelayMs: 5000,
        deadSignalCooldownMs: 1500,
        heartbeatTimeoutMs: 5000,
        switchAckTimeoutMs: 5000,
        switchCooldownMs: 900,
        maxSwitchAttempts: 3,
        switchAssignJitterMs: 120,
        lootBagLifetimeMs: 5 * 60 * 1000,
        lootDurationMs: 5000,
    },

    loot: {
        bagModel: 'prop_cs_heist_bag_01',
        bagDropChancePercent: 25,
        interactDistance: 2.2,
        cancelDistance: 3.5,
        itemIds: [234, 235, 237, 238, 239, 240, 241, 242, 243, 244],
    },

    network: {
        heartbeatMs: 700,
    },

    ai: {
        maxTargetDistance: 80,
        sleepWakeDistance: 45,
        controllerMaxDistance: 90,
        emptyZoneBehavior: 'idle', // idle | destroy
        stuckDistanceEps: 0.45,
        stuckTimeoutMs: 3200,
        maxStuckBeforeReassign: 4,
        skipDuplicateFollowMs: 1500,
        stuckGraceAfterSpawnMs: 4000,
        stuckGraceAfterAckMs: 2500,
        stuckGraceAfterFollowMs: 1800,
        stuckRecoveryBursts: 2,
    },

    zones: [
        {
            id: 1,
            name: 'LS Construction',
            x: -624.3607,
            y: 282.3673,
            z: 81.60345,
            radius: 30,
            zombieCount: 3,
            maxZombieCount: 18,
            waveSize: 3,
        },
    ],
};

module.exports = {
    ZOMBIE_CONFIG,
};
