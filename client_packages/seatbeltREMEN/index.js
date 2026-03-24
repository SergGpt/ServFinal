"use strict";

// Состояние ремня для текущей машины
let seatbeltOn = false;

// Последняя машина игрока
let currentVehicle = null;

// Привязка клавиши X
mp.keys.bind(0x58, true, () => { // X
    const player = mp.players.local;

    if (!player.vehicle) {
        mp.notify.error("Вы должны быть в машине!", "Ремень безопасности");
        return;
    }

    // Переключение состояния ремня
    seatbeltOn = !seatbeltOn;
    currentVehicle = player.vehicle; // Запоминаем машину

    // Отправляем серверу
    mp.events.callRemote("server:seatbelt:toggle", seatbeltOn);

    // Уведомление
    if (seatbeltOn) {
        mp.notify.success("Ремень пристегнут", "Ремень безопасности");
    } else {
        mp.notify.error("Ремень отстёгнут", "Ремень безопасности");
    }
});

// Сброс ремня при выходе из машины
mp.events.add("playerLeaveVehicle", (vehicle, seat) => {
    if (seatbeltOn) {
        seatbeltOn = false;
        currentVehicle = null;
        mp.notify.info("Ремень автоматически отстёгнут", "Ремень безопасности");
        mp.events.callRemote("server:seatbelt:toggle", false);
    }
});

// Сброс ремня при входе в новую машину (чисто на всякий случай)
mp.events.add("playerEnterVehicle", (vehicle, seat) => {
    seatbeltOn = false;
    currentVehicle = vehicle;
});

// Сообщение при выбросе игрока из машины
mp.events.add("client:seatbelt:eject", () => {
    mp.notify.error("Вы вылетели из машины из-за отсутствия ремня!", "Ремень безопасности");
});

// Аварийная проверка для выброса
let lastSpeed = 0;
mp.events.add("render", () => {
    const player = mp.players.local;

    if (player.vehicle && player.vehicle.getPedInSeat(-1) === player.handle) {
        let speed = player.vehicle.getSpeed() * 3.6; // км/ч
        let delta = lastSpeed - speed;

        // Если резко тормозит и ремень не пристёгнут
        if (delta > 45 && !seatbeltOn) {
            mp.events.callRemote("server:vehicle:crash", lastSpeed);
        }

        lastSpeed = speed;
    } else {
        lastSpeed = 0;
    }
});
