"use strict";

module.exports = {
    // Список моделей авто, которые участвуют в дрифте (редактируйте под свой сервер)
    driftVehicles: [
        "futo",
        "sultan",
        "elegy",
        "elegy2",
        "jester",
        "banshee",
        "tampa",
        "coquette",
        "kuruma",
        "schafter3",
    ],
    // Настройки дыма
    smoke: {
        drift: {
            dict: "core",
            name: "exp_grd_tire_smoke",
            scaleMin: 0.35,
            scaleMax: 1.1,
        },
        burnout: {
            dict: "core",
            name: "exp_grd_tire_smoke",
            scaleMin: 0.5,
            scaleMax: 1.3,
        },
    },
    // Минимальная скорость для дрифта (м/с)
    speedMin: 9,
    // Минимальный угол скольжения (градусы)
    angleMin: 15,
    // Максимальная скорость для бернаута (м/с)
    burnoutSpeedMax: 4,
    // Интервал синхронизации состояния дрифта (мс)
    syncIntervalMs: 250,
    // Интервал обновления дыма (мс)
    smokeIntervalMs: 100,
    // Включать уменьшение сцепления (drift-настройка)
    reduceGrip: true,
};
