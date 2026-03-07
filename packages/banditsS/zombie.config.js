const ZOMBIE_CONFIG = {
    debug: true,
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
        zonePresenceMs: 20000,
        zoneEntryScanMs: 1000,
        syncMs: 300,
        attackMs: 200,
        deadSyncMs: 450,
        cleanupMs: 500,
        hpDebugMs: 2000,
        cmdDebugMs: 1200,
        deadRemoveDelayMs: 5000,
        deadSignalCooldownMs: 700,
        heartbeatTimeoutMs: 2500,
        switchAckTimeoutMs: 5000,
        switchCooldownMs: 200,
        maxSwitchAttempts: 3,
        switchAssignJitterMs: 120,
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
        skipDuplicateFollowMs: 500,
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
        },
    ],
};

module.exports = {
    ZOMBIE_CONFIG,
};
