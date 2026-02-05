"use strict";

module.exports = {
    // Настройки дрифта по моделям авто (ключ - modelName в нижнем регистре).
    // Здесь можно добавлять/удалять авто и настраивать уникальные характеристики для каждого.
    vehicles: {
        futo: {
            speedMin: 8,
            angleMin: 12,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.35,
            smokeScaleMax: 1.1,
        },
        sultan: {
            speedMin: 9,
            angleMin: 14,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.4,
            smokeScaleMax: 1.15,
        },
        elegy: {
            speedMin: 10,
            angleMin: 15,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.42,
            smokeScaleMax: 1.2,
        },
        elegy2: {
            speedMin: 10,
            angleMin: 15,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.42,
            smokeScaleMax: 1.2,
        },
        jester: {
            speedMin: 10,
            angleMin: 16,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.38,
            smokeScaleMax: 1.1,
        },
        banshee: {
            speedMin: 10,
            angleMin: 16,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.38,
            smokeScaleMax: 1.15,
        },
        tampa: {
            speedMin: 8,
            angleMin: 12,
            burnoutSpeedMax: 5,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.45,
            smokeScaleMax: 1.25,
        },
        coquette: {
            speedMin: 11,
            angleMin: 16,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.35,
            smokeScaleMax: 1.05,
        },
        kuruma: {
            speedMin: 9,
            angleMin: 14,
            burnoutSpeedMax: 4,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.4,
            smokeScaleMax: 1.2,
        },
        schafter3: {
            speedMin: 9,
            angleMin: 14,
            burnoutSpeedMax: 5,
            reduceGrip: true,
            assistForce: 1.1,
            smokeScaleMin: 0.43,
            smokeScaleMax: 1.25,
        },
    },
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
    // Базовые значения, применяются если для модели нет персональной настройки.
    // Минимальная скорость для дрифта (м/с)
    speedMin: 9,
    // Минимальный угол скольжения (градусы)
    angleMin: 15,
    // Максимальная скорость для бернаута (м/с)
    burnoutSpeedMax: 4,
    // Сила дрифт-ассиста (боковой импульс), чтобы авто заметно уходило в занос
    assistForce: 0.9,
    // Минимальная скорость для ассиста (м/с)
    assistSpeedMin: 4,
    // Интервал синхронизации состояния дрифта (мс)
    syncIntervalMs: 250,
    // Интервал обновления дыма (мс)
    smokeIntervalMs: 100,
    // Включать уменьшение сцепления (drift-настройка)
    reduceGrip: true,
};
