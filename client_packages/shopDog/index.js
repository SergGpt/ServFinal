"use strict";

// ======= Настройки NPC =======
const npcPos = new mp.Vector3(-549.25, -938.38, 23.86);
let inRange = false;

// ======= Blip, Маркер, Пед =======
mp.blips.new(463, npcPos, { name: "Магазин собак", color: 2, shortRange: true });
mp.markers.new(1, npcPos, 1.5, { color: [255, 150, 0, 100] });
mp.peds.new(mp.game.joaat("s_m_y_shop_mask"), npcPos, 180, 0, 0);

// ======= Colshape =======
const shape = mp.colshapes.newSphere(npcPos.x, npcPos.y, npcPos.z, 2.5);
shape.isDogShop = true;

// ======= Вход/выход из зоны =======
mp.events.add("playerEnterColshape", (colshape) => {
    if (colshape === shape) {
        inRange = true;
        mp.gui.chat.push("!{00b894}Нажмите !{ffffff}E!{00b894} для открытия магазина собак.");
    }
});

mp.events.add("playerExitColshape", (colshape) => {
    if (colshape === shape) {
        inRange = false;
        closeDogShopUI();
    }
});

// ======= Клавиша E для открытия магазина =======
mp.keys.bind(0x45, true, () => { // E
    if (!inRange) return;
    mp.events.callRemote("dogshop.requestList"); // сервер пришлёт список собак
});

// ======= Открытие/закрытие магазина =======
function openDogShopUI(list = []) {
    mp.gui.cursor.show(true, true);
    dogShop.show = true;
    dogShop.setDogs(list);
}

function closeDogShopUI() {
    mp.gui.cursor.show(false, false);
    dogShop.show = false;
}

// ======= Получение списка собак с сервера =======
mp.events.add("dogshop.sendList", (list) => {
    openDogShopUI(list);
});

// ======= Покупка собаки =======
mp.events.add("dogshop.buyDog", (dogType) => {
    mp.events.callRemote("dogNPC.buy", dogType);
    closeDogShopUI();
});
