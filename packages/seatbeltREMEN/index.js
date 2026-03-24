"use strict";

// Хранение состояния ремня для игроков
let seatbeltStates = new Map();

// Обработка переключения ремня с клиента
mp.events.add("server:seatbelt:toggle", (player, state) => {
    seatbeltStates.set(player, state);
    // Можно передать обратно клиенту для синхронизации (опционально)
    player.call("client:seatbelt:update", [state]);
});

// Обработка аварии
mp.events.add("server:vehicle:crash", (player, speed) => {
    const seatbelt = seatbeltStates.get(player);

    // Если ремень не пристёгнут, выброс игрока
    if (!seatbelt && player.vehicle) {
        // Вынуть игрока из машины
        player.removeFromVehicle();

        // Пуш уведомление клиенту
        player.call("client:seatbelt:eject");

        // Можно также немного нанести урон
        player.health = Math.max(player.health - Math.floor(speed / 2), 0);
    }
});
