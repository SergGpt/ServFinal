"use strict";

module.exports = {
    conversionPrice: 125000,
    maxSavedPresets: 8,
    allowedVehicleTypes: [0],
    blockedModels: [
        'caddy',
        'caddy2',
        'caddy3',
        'towtruck',
        'towtruck2',
        'tractor',
        'ripley',
    ],
    workshops: [
        {
            id: 1,
            name: 'Drift Workshop LS',
            position: { x: -337.695, y: -136.863, z: 39.009 },
            radius: 3.0,
            marker: {
                type: 36,
                color: [147, 84, 255, 180],
                scale: 1.2,
            },
            blip: {
                sprite: 72,
                color: 58,
                shortRange: true,
                name: 'Drift Workshop',
            },
        },
    ],
    sliderLimits: {
        wheelOverpower: [0, 100],
        rearGripLoss: [0, 100],
        steeringAngle: [0, 100],
        frontGripHighSpeed: [0, 100],
        powerCoeff: [100, 200],
        diffLock: [0, 1],
        limiterLock: [0, 1],
        limiterSmoke: [0, 1],
    },
    sliderSteps: {
        wheelOverpower: 1,
        rearGripLoss: 1,
        steeringAngle: 1,
        frontGripHighSpeed: 1,
        powerCoeff: 1,
        diffLock: 1,
        limiterLock: 1,
        limiterSmoke: 1,
    },
};
