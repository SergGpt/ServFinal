"use strict";

let inRange = false;
const npcPos = new mp.Vector3(207.33, -818.84, 30.76);

// === BLIP и маркер ===
mp.blips.new(225, npcPos, { name: "Автошкола", color: 2, shortRange: true });
mp.markers.new(1, npcPos, 1.5, { color: [0, 255, 0, 100] });

// === NPC ===
mp.peds.new(mp.game.joaat("s_m_y_cop_01"), npcPos, 180, null, 0);

// === Колшейп ===
const shape = mp.colshapes.newSphere(npcPos.x, npcPos.y, npcPos.z, 2.5);

// === Вход/выход в колшейп ===
mp.events.add("playerEnterColshape", (colshape) => {
    if (colshape === shape) {
        inRange = true;
        mp.gui.chat.push("!{00b894}Нажмите !{ffffff}E!{00b894} для открытия автошколы.");
    }
});

mp.events.add("playerExitColshape", (colshape) => {
    if (colshape === shape) {
        inRange = false;
        closeMenu();
    }
});

// === Привязка клавиши E ===
mp.keys.bind(0x45, true, () => { // E
    if (inRange && !mp.busy.includes("licenseNPC")) {
        openMenu();
    }
});

// === Функции открытия/закрытия меню ===
function openMenu() {
    mp.callCEFV(`selectMenu.menu = cloneObj(selectMenu.menus["licenseMenu"])`);
    mp.callCEFV(`selectMenu.show = true`);
    mp.gui.cursor.show(true, true);
    mp.busy.add("licenseNPC");
}

function closeMenu() {
    mp.callCEFV(`selectMenu.show = false`);
    mp.gui.cursor.show(false, false);
    mp.busy.remove("licenseNPC");
}

// === Обработчик закрытия меню (для кнопки в SelectMenu) ===
mp.events.add("license.menu.close", () => {
    closeMenu();
});

// === Событие покупки лицензии из меню ===
mp.events.add("license.buy", (type) => {
    if (inRange) {
        // Сразу закрываем меню и снимаем курсор/блокировку
        mp.events.call("license.menu.close");

        // Отправляем покупку на сервер
        mp.events.callRemote("licenseNPC.buy", type);
    }
});

// === Ответы сервера (пуши через notifications) ===
mp.events.add("licenseNPC.menu.success", (msg) => {
    mp.callCEFV(`notifications.success("${msg}", "Автошкола")`);
});

mp.events.add("licenseNPC.menu.error", (msg) => {
    mp.callCEFV(`notifications.error("${msg}", "Автошкола")`);
});
