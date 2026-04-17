const SECURITY_CONFIG = {
    debug: false,

    zoneRadius: 100,
    guardsPerZone: 3,
    chiefsPerZone: 1,

    models: {
        guard: [
            's_m_m_security_01',
            's_m_y_blackops_01',
            's_m_y_blackops_02',
        ],
        chief: [
            's_m_m_highsec_01',
            's_m_m_security_01',
        ],
    },

    weapons: {
        guard: 'WEAPON_CARBINERIFLE',
        chief: 'WEAPON_PISTOL',
    },

    stats: {
        hp: 200,
        guardAimDistance: 8.0,
        chiefStopDistance: 0.9,
        friskDistance: 1.0,
        walkSpeed: 1.2,
        runSpeed: 2.0,
        controllerMaxDistance: 120,
        guardReissueMs: 1200,
        chiefReissueMs: 800,
        friskDurationMs: 7000,
    },

    timers: {
        zoneScanMs: 1000,
        behaviorMs: 400,
        heartbeatMs: 1000,
        controllerTimeoutMs: 5000,
        switchCooldownMs: 900,
    },

    testZone: {
        enabled: true,
        name: 'Security Test Zone',
        x: -2273.8115234375,
        y: 3129.416748046875,
        z: 32.811885833740234,
        dimension: 0,
        radius: 100,
    },
};

module.exports = { SECURITY_CONFIG };
