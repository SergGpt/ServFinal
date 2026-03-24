"use strict";

exports = {
    /**
     * IPL, которые нужно запросить на клиенте.
     *
     * Сюда добавляй названия IPL из CodeWalker, например:
     * "hei_sm_16_interior_v_bahama_milo_"
     */
    request: [
        // Больница
        "coronertrash",
        "Coroner_Int_On",

        // DMV
        "ex_dt1_02_office_02b",

        // Трейлер Тревора
        "TrevorsTrailerTidy",

        // Казино
        "vw_casino_main",
        "vw_casino_garage",
        "vw_casino_carpark",
        "vw_casino_penthouse",

        // Кастомная больница в Pillbox
        "hirurg_bath",
        "elevator",
    ],

    /**
     * IPL, которые нужно отключить, если они конфликтуют с картой.
     */
    remove: [
        "rc12b_fixed",
        "rc12b_destroyed",
        "rc12b_default",
        "rc12b_hospitalinterior_lod",
        "rc12b_hospitalinterior",
    ],

    /**
     * Дополнительная настройка интерьеров/MLO.
     *
     * Пример для своего MLO:
     * {
     *   coords: { x: 1100.0, y: 220.0, z: -50.0 },
     *   props: ["entity_set_name"],
     *   refresh: true,
     * }
     */
    interiors: [
        // Пример структуры оставлен намеренно пустым,
        // потому что набор props/entity sets зависит от конкретного MLO.
    ],
};
