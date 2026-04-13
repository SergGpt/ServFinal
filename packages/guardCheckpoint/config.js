"use strict";

const GUARD_CHECKPOINT_CONFIG = {
    debug: true,
    debugProtocol: false,
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
    attackBurstIntervalMs: 280,

    // Независимые посты охраны
    posts: [
        {
            id: "army_north_gate",
            name: "Army North Gate",
            dimension: 0,
            guardZone: {
                center: { x: 733.0470581054688, y: -2549.67333984375, z: 19.984865188598633 },
                radius: 75,
            },
            postZone: {
                type: "sphere",
                center: { x: 733.0470581054688, y: -2549.67333984375, z: 19.984865188598633 },
                radius: 75,
            },
            pursuitZone: {
                type: "sphere",
                center: { x: 733.0470581054688, y: -2549.67333984375, z: 19.984865188598633 },
                radius: 95,
            },
            stopZone: {
                type: "sphere",
                center: { x: 745.2170581054688, y: -2559.97333984375, z: 19.984865188598633 },
                radius: 5.0,
            },
            violationZone: {
                type: "sphere",
                center: { x: 743.1370581054687, y: -2557.92333984375, z: 19.984865188598633 },
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
                spawn: { x: 741.0470581054688, y: -2555.73333984375, z: 19.984865188598633 },
            },
            guards: [
                {
                    id: "guard_1",
                    model: "s_m_y_marine_01",
                    heading: 25.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: 737.4670581054688, y: -2560.89333984375, z: 19.984865188598633 },
                },
                {
                    id: "guard_2",
                    model: "s_m_y_marine_01",
                    heading: 78.0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: 746.5570581054688, y: -2554.04333984375, z: 19.984865188598633 },
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
