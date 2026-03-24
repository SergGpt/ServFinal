"use strict";

let allowed = [];

module.exports = {
    enabled: false, // Вайтлист выключен, все пускаются

    isEnabled() {
        return false; // Всегда возвращаем false
    },

    getAllowed() {
        return allowed;
    },

    async init() {
        try {
            // Просто загружаем список для статистики, но не блокируем никого
            allowed = await db.Models.WhiteList.findAll();
            console.log(`[WHITELIST] Вайтлист загружен (${allowed.length} записей), но вход свободный.`);
        } catch (err) {
            console.error('[WHITELIST] Ошибка при загрузке вайтлиста:', err);
        }
    },

    isInWhiteList(socialClub) {
        return true; // Всегда возвращаем true, всем разрешен вход
    },

    pushToAllowed(record) {
        // Можно просто игнорировать добавление
    },

    removeFromAllowed(socialClub) {
        // Можно просто игнорировать удаление
    }
};
