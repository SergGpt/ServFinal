"use strict";

const prices = {
    car: 5000,
    bike: 300,
    truck: 700,
    air: 2000,
    boat: 1000
};

// подключение модулей
let money = call('money');
let notify = call('notifications');

mp.events.add("licenseNPC.buy", async (player, type) => {
    try {
        if (!player.character) {
            notify.error(player, "Ошибка: персонаж не найден.");
            return;
        }

        const price = prices[type];
        if (!price) {
            notify.error(player, "Ошибка: неизвестный тип лицензии.");
            return;
        }

        // Проверяем достаточно ли денег
        if (player.character.cash < price) {
            notify.error(player, "У вас недостаточно денег.");
            return;
        }

        // Снимаем деньги через модуль money, чтобы HUD обновился
        money.removeCash(player, price, async function(result) {
            if (!result) {
                notify.error(player, "Ошибка списания денег.");
                return;
            }

            // Выдаём лицензию
            switch(type) {
                case "car": player.character.carLicense = 1; break;
                case "bike": player.character.bikeLicense = 1; break;
                case "truck": player.character.truckLicense = 1; break;
                case "air": player.character.airLicense = 1; break;
                case "boat": player.character.boatLicense = 1; break;
            }

            // Сохраняем изменения в базе
            await player.character.save();

            // Уведомляем игрока
            notify.success(player, `Вы купили лицензию на ${type}`);
        });

    } catch (err) {
        console.error("licenseNPC.buy error:", err);
        notify.error(player, "Произошла ошибка при покупке лицензии.");
    }
});
