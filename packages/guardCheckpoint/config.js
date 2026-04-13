"use strict";

const GUARD_CHECKPOINT_CONFIG = {
    debug: true,
    debugTick: false,
    debugSync: false,
    tickMs: 300,
    movementThreshold: 0.08,
    transitionCooldownMs: 900,
    warningTimeoutMs: 8000,
    aggressiveMemoryMs: 12000,
    defaultRespawnMs: 5000,
    defaultCheckDurationMs: 5000,
    defaultWarnDistance: 18,
    defaultMaxChaseDistance: 25,
    npcStreamDistance: 220,
    spawnGraceMs: 3500,
    npcHealth: 250,
    npcArmor: 100,
    warningResponseMs: 10000,
    warningMoveTolerance: 0.09,
    stopZoneProgressEpsilon: 0.03,
    warningAdvanceTolerance: 0.6,
    attackDamageIntervalMs: 450,
    attackDamageRange: 38,
    attackDamagePerAttacker: 7,

    // Независимые посты охраны
    posts: [
        {
            id: "army_north_gate",
            name: "Army North Gate",
            dimension: 0,
            guardZone: {
                center: { x: 740.25, y: -2528.21, z: 19.55 },
                radius: 75,
            },
            postZone: {
                type: "sphere",
                center: { x: 740.25, y: -2528.21, z: 19.55 },
                radius: 75,
            },
            pursuitZone: {
                type: "sphere",
                center: { x: 740.25, y: -2528.21, z: 19.55 },
                radius: 95,
            },
            stopZone: {
                type: "sphere",
                center: { x: 752.42, y: -2538.51, z: 19.55 },
                radius: 5.0,
            },
            violationZone: {
                type: "sphere",
                center: { x: 750.34, y: -2536.46, z: 19.55 },
                radius: 3.5,
            },
            warnDistance: 24,
            warningResponseMs: 10000,
            checkDurationMs: 5000,
            maxChaseDistance: 30,
            spawnGraceMs: 4000,
            leader: {
                id: "leader",
                model: "s_m_y_marine_01",
                heading: 56.0,
                weaponHash: "WEAPON_CARBINERIFLE",
                spawn: { x: 748.25, y: -2534.27, z: 19.55 },
            },
            guards: [
                {
                    id: "guard_1",
                    model: "s_m_y_marine_01",
                    heading: 25.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: 744.67, y: -2539.43, z: 19.55 },
                },
                {
                    id: "guard_2",
                    model: "s_m_y_marine_01",
                    heading: 78.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: 753.76, y: -2532.58, z: 19.55 },
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
