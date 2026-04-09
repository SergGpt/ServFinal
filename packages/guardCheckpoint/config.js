"use strict";

const GUARD_CHECKPOINT_CONFIG = {
    debug: true,
    debugTick: false,
    tickMs: 300,
    movementThreshold: 0.08,
    transitionCooldownMs: 900,
    warningTimeoutMs: 8000,
    aggressiveMemoryMs: 12000,
    defaultRespawnMs: 15000,
    defaultCheckDurationMs: 5000,
    defaultWarnDistance: 18,
    defaultMaxChaseDistance: 25,
    npcStreamDistance: 220,

    // Независимые посты охраны
    posts: [
        {
            id: "army_north_gate",
            name: "Army North Gate",
            dimension: 0,
            guardZone: {
                center: { x: -2260.53, y: 3184.4, z: 32.81 },
                radius: 75,
            },
            stopZone: {
                center: { x: -2248.36, y: 3174.1, z: 32.81 },
                radius: 5.0,
            },
            warnDistance: 24,
            checkDurationMs: 5000,
            maxChaseDistance: 30,
            leader: {
                id: "leader",
                model: "s_m_y_marine_01",
                heading: 56.0,
                weaponHash: "WEAPON_CARBINERIFLE",
                spawn: { x: -2252.53, y: 3178.34, z: 32.81 },
            },
            guards: [
                {
                    id: "guard_1",
                    model: "s_m_y_marine_01",
                    heading: 25.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: -2256.11, y: 3173.18, z: 32.81 },
                },
                {
                    id: "guard_2",
                    model: "s_m_y_marine_01",
                    heading: 78.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: -2247.02, y: 3180.03, z: 32.81 },
                },
            ],
            warningUi: {
                text: "ОХРАНА: Остановитесь и пройдите проверку!",
                soundName: "5s",
                soundSet: "MP_MISSION_COUNTDOWN_SOUNDSET",
            },
        },
    ],
};

module.exports = {
    GUARD_CHECKPOINT_CONFIG,
};
