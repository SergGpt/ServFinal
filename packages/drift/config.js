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
        steeringAngle: [32, 48],
        rearGrip: [0.72, 1.0],
        handbrakePower: [0.8, 1.45],
    },
};
