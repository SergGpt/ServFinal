let player = mp.players.local;
let playerIsFrozen = false;

let clothesLoaded = 0;
let clothesList = {
    "bags": [],
    "bracelets": [],
    "ears": [],
    "glasses": [],
    "watches": [],
    "ties": [],
    "hats": [],
    "tops": [],
    "pants": [],
    "shoes": [],
}
let shopClass;
let priceMultiplier;
// let currentItem = {
//     group: 0,
//     index: 0,
//     textureIndex: 0
// };

let hairInfo = {};

let input = {
    clothes: {
        4: {
            drawable: 0,
            texture: 0
        },
        5: {
            drawable: 0,
            texture: 0
        },
        6: {
            drawable: 0,
            texture: 0
        },
        7: {
            drawable: 0,
            texture: 0
        },
        11: {
            drawable: 0,
            texture: 0
        },
        3: {
            drawable: 0,
            texture: 0
        },
        8: {
            drawable: 0,
            texture: 0
        },
    },
    props: {
        7: {
            drawable: 0,
            texture: 0
        },
        2: {
            drawable: 0,
            texture: 0
        },
        1: {
            drawable: 0,
            texture: 0
        },
        0: {
            drawable: 0,
            texture: 0
        },
        6: {
            drawable: 0,
            texture: 0
        },
    }
}

let clothesInfo = {
    "bags": {
        component: 5,
        menuName: 'Bags',
        name: 'Рюкзаки'
    },
    "bracelets": {
        prop: 7,
        menuName: 'Bracelets',
        name: 'Браслеты'
    },
    "ears": {
        prop: 2,
        menuName: 'Ears',
        name: 'Серьги'
    },
    "glasses": {
        prop: 1,
        menuName: 'Glasses',
        name: 'Очки'
    },
    "hats": {
        prop: 0,
        menuName: 'Hats',
        name: 'Головные уборы'
    },
    "pants": {
        component: 4,
        menuName: 'Pants',
        name: 'Ноги'
    },
    "shoes": {
        component: 6,
        menuName: 'Shoes',
        name: 'Обувь'
    },
    "ties": {
        component: 7,
        menuName: 'Ties',
        name: 'Галстуки'
    },
    "tops": {
        component: 11,
        menuName: 'Tops',
        name: 'Тело'
    },
    "watches": {
        prop: 6,
        menuName: 'Watches',
        name: 'Часы'
    },
}

let rotation = {
    left: false,
    right: false
}

let debugMode = false;
let debugText;
let editClothingShopInfo = {
    id: null,
    enter: null,
    place: null,
    camera: null
};
let editMarkers = {
    enter: null,
    place: null,
    camera: null
};
let topEditor = {
    active: false,
    sex: 1,
    variation: 0,
    texture: 0,
    torso: 0,
    undershirt: 15,
    uTexture: 0,
    textureList: [0],
    uTextureList: [0],
    price: 1000,
    class: 1,
    pockets: [4, 4, 5, 5],
    clime: [-10, 20]
};

function destroyEditMarker(key) {
    if (editMarkers[key] != null) {
        editMarkers[key].destroy();
        editMarkers[key] = null;
    }
}

function updateEditMenuValue(index, value) {
    mp.callCEFV(`if (selectMenu.menu && selectMenu.menu.name === "clothingShopEditMenu") selectMenu.menu.items[${index}].values = ${JSON.stringify([value])};`);
}

function syncEditMenuValues() {
    updateEditMenuValue(0, editClothingShopInfo.enter ? 'OK' : 'No');
    updateEditMenuValue(1, editClothingShopInfo.place ? 'OK' : 'No');
    updateEditMenuValue(2, editClothingShopInfo.camera ? 'OK' : 'No');
}

function resetEditClothingShopState() {
    editClothingShopInfo = {
        id: null,
        enter: null,
        place: null,
        camera: null
    };
    destroyEditMarker('enter');
    destroyEditMarker('place');
    destroyEditMarker('camera');
}

function getGameplayCameraCoord() {
    let camPos = null;

    if (mp.game.cam && typeof mp.game.cam.getGameplayCamCoord === 'function') {
        camPos = mp.game.cam.getGameplayCamCoord();
    } else if (mp.game.cam && typeof mp.game.cam.getFinalRenderedCamCoord === 'function') {
        camPos = mp.game.cam.getFinalRenderedCamCoord();
    } else {
        camPos = new mp.Vector3(
            mp.players.local.position.x,
            mp.players.local.position.y,
            mp.players.local.position.z + 1.0
        );
    }

    return {
        x: camPos.x,
        y: camPos.y,
        z: camPos.z
    };
}

function normalizeEditShopData(shopData) {
    if (!shopData || typeof shopData !== 'object') return;

    editClothingShopInfo.id = shopData.id;
    editClothingShopInfo.enter = shopData.enter || null;
    editClothingShopInfo.place = shopData.place || null;
    editClothingShopInfo.camera = shopData.camera || null;
}

function applyTopEditorLook() {
    if (!topEditor.active) return;
    player.setComponentVariation(3, topEditor.torso, 0, 0);
    player.setComponentVariation(8, topEditor.undershirt, topEditor.uTexture, 0);
    player.setComponentVariation(11, topEditor.variation, topEditor.texture, 0);
}

function addUniqueValue(list, value) {
    value = parseInt(value);
    if (!Number.isFinite(value) || value < 0) return list;
    if (!list.includes(value)) list.push(value);
    list.sort((a, b) => a - b);
    return list;
}

function openTopEditorMenu() {
    const priceValues = [500, 1000, 1500, 2000, 3000, 5000].map(x => `$${x}`);
    const classValues = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const sexValues = ['Мужской', 'Женский'];
    const currentPriceIndex = Math.max(0, priceValues.indexOf(`$${topEditor.price}`));
    const currentClassIndex = Math.max(0, classValues.indexOf(String(topEditor.class)));
    const currentSexIndex = topEditor.sex === 0 ? 1 : 0;

    mp.callCEFV(`selectMenu.menu = {
        name: "topEditorMenu",
        header: "Top Editor PRO",
        items: [
            { text: "Пол", values: ${JSON.stringify(sexValues)}, i: ${currentSexIndex} },
            { text: "Variation", values: ["${topEditor.variation}"], i: 0 },
            { text: "Texture", values: ["${topEditor.texture}"], i: 0 },
            { text: "Torso", values: ["${topEditor.torso}"], i: 0 },
            { text: "Undershirt", values: ["${topEditor.undershirt}"], i: 0 },
            { text: "uTexture", values: ["${topEditor.uTexture}"], i: 0 },
            { text: "Цена", values: ${JSON.stringify(priceValues)}, i: ${currentPriceIndex} },
            { text: "Класс", values: ${JSON.stringify(classValues)}, i: ${currentClassIndex} },
            { text: "Textures: [${topEditor.textureList.join(',')}]" },
            { text: "uTextures: [${topEditor.uTextureList.join(',')}]" },
            { text: "Предыдущий variation" },
            { text: "Следующий variation" },
            { text: "Предыдущий texture" },
            { text: "Следующий texture" },
            { text: "Предыдущий torso" },
            { text: "Следующий torso" },
            { text: "Предыдущий undershirt" },
            { text: "Следующий undershirt" },
            { text: "Предыдущий uTexture" },
            { text: "Следующий uTexture" },
            { text: "Добавить texture в список" },
            { text: "Добавить uTexture в список" },
            { text: "Сбросить список textures" },
            { text: "Сбросить список uTextures" },
            { text: "Сохранить в БД" },
            { text: "Закрыть" }
        ],
        i: 0,
        j: 0,
        handler(eventName) {
            var item = this.items[this.i];
            var e = {
                itemName: item.text,
                itemValue: (item.i != null && item.values) ? item.values[item.i] : null
            };
            if (eventName == 'onItemValueChanged') {
                if (e.itemName == 'Пол') mp.trigger('clothingShop.topEditor.sex', e.itemValue == 'Женский' ? 0 : 1);
                if (e.itemName == 'Цена') mp.trigger('clothingShop.topEditor.price', String(e.itemValue || '$1000'));
                if (e.itemName == 'Класс') mp.trigger('clothingShop.topEditor.class', parseInt(e.itemValue || '1'));
            }
            if (eventName == 'onItemSelected') {
                if (e.itemName == 'Предыдущий variation') mp.trigger('clothingShop.topEditor.variation', -1);
                if (e.itemName == 'Следующий variation') mp.trigger('clothingShop.topEditor.variation', 1);
                if (e.itemName == 'Предыдущий texture') mp.trigger('clothingShop.topEditor.texture', -1);
                if (e.itemName == 'Следующий texture') mp.trigger('clothingShop.topEditor.texture', 1);
                if (e.itemName == 'Предыдущий torso') mp.trigger('clothingShop.topEditor.torso', -1);
                if (e.itemName == 'Следующий torso') mp.trigger('clothingShop.topEditor.torso', 1);
                if (e.itemName == 'Предыдущий undershirt') mp.trigger('clothingShop.topEditor.undershirt', -1);
                if (e.itemName == 'Следующий undershirt') mp.trigger('clothingShop.topEditor.undershirt', 1);
                if (e.itemName == 'Предыдущий uTexture') mp.trigger('clothingShop.topEditor.utex', -1);
                if (e.itemName == 'Следующий uTexture') mp.trigger('clothingShop.topEditor.utex', 1);
                if (e.itemName == 'Добавить texture в список') mp.trigger('clothingShop.topEditor.texture.add');
                if (e.itemName == 'Добавить uTexture в список') mp.trigger('clothingShop.topEditor.utex.add');
                if (e.itemName == 'Сбросить список textures') mp.trigger('clothingShop.topEditor.texture.reset');
                if (e.itemName == 'Сбросить список uTextures') mp.trigger('clothingShop.topEditor.utex.reset');
                if (e.itemName == 'Сохранить в БД') mp.trigger('clothingShop.topEditor.save');
                if (e.itemName == 'Закрыть') mp.trigger('clothingShop.topEditor.close');
            }
            if (eventName == 'onEscapePressed' || eventName == 'onBackspacePressed') {
                mp.trigger('clothingShop.topEditor.close');
            }
        }
    };`);
    mp.callCEFV('selectMenu.show = true;');
}

mp.events.add({
    'clothingShop.enter': (shopData) => {
        getInputClothes();
        player.setComponentVariation(1, 0, 0, 0); /// убираем маску
        bindKeys(true);
        setHeaders(shopData.bType);
        initCurrentHair(shopData.appearance);
        setHair();
        mp.events.call('hud.enable', false);
        mp.game.ui.displayRadar(false);
        mp.callCEFR('setOpacityChat', [0.0]);
        mp.utils.cam.create(shopData.camera.x, shopData.camera.y, shopData.camera.z, shopData.pos.x, shopData.pos.y, shopData.pos.z, 42);
        mp.callCEFV('loader.show = false');
        shopClass = shopData.class;
        priceMultiplier = shopData.priceMultiplier;
        initMainMenu();
        mp.events.call('selectMenu.show', 'clothingMain');
        player.position = new mp.Vector3(shopData.pos.x, shopData.pos.y, shopData.pos.z);
        if (!playerIsFrozen) {
            mp.utils.disablePlayerMoving(true);
            player.freezePosition(true);
        }
        mp.timer.add(() => {
            player.setHeading(shopData.pos.h);
            mp.prompt.show('Используйте <span>A</span> и <span>D</span> для того, чтобы вращать персонажа');
        }, 100);
    },
    'clothingShop.exit': () => {
        playerIsFrozen = false;
        mp.events.call(`selectMenu.hide`);
        bindKeys(false);
        mp.utils.cam.destroy();
        mp.events.call('hud.enable', true);
        mp.game.ui.displayRadar(true);
        mp.callCEFR('setOpacityChat', [1.0]);
        player.freezePosition(false);
        mp.utils.disablePlayerMoving(false);
        
        debugText = null;

        mp.events.callRemote('clothingShop.exit');
    },
    'clothingShop.edit.open': (shopData) => {
        if (mp.busy.includes()) return;
        if (!mp.busy.add('clothingShop.edit', false)) return;

        resetEditClothingShopState();
        if (typeof shopData === 'number') {
            editClothingShopInfo.id = shopData;
        } else {
            normalizeEditShopData(shopData);
        }
        mp.callCEFV(`selectMenu.menu = cloneObj(selectMenu.menus["clothingShopEditMenu"]);`);
        mp.callCEFV(`selectMenu.show = true`);
        syncEditMenuValues();
    },
    'clothingShop.edit.close': () => {
        mp.busy.remove('clothingShop.edit');
        mp.callCEFV(`selectMenu.show = false`);
        resetEditClothingShopState();
    },
    'clothingShop.topEditor.open': () => {
        if (mp.busy.includes()) return;
        if (!mp.busy.add('clothingShop.topEditor', false)) return;

        topEditor.active = true;
        topEditor.sex = player.getVariable('gender') ? 0 : 1;
        topEditor.variation = Math.max(0, player.getDrawableVariation(11));
        topEditor.texture = Math.max(0, player.getTextureVariation(11));
        topEditor.torso = Math.max(0, player.getDrawableVariation(3));
        topEditor.undershirt = Math.max(0, player.getDrawableVariation(8));
        topEditor.uTexture = Math.max(0, player.getTextureVariation(8));
        topEditor.textureList = [topEditor.texture];
        topEditor.uTextureList = [topEditor.uTexture];
        topEditor.price = 1000;
        topEditor.class = 1;
        topEditor.pockets = [4, 4, 5, 5];
        topEditor.clime = [-10, 20];
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.close': () => {
        topEditor.active = false;
        mp.busy.remove('clothingShop.topEditor');
        mp.callCEFV(`selectMenu.show = false`);
    },
    'clothingShop.topEditor.sex': (sex) => {
        if (!topEditor.active) return;
        sex = parseInt(sex);
        if (sex !== 0 && sex !== 1) return;
        topEditor.sex = sex;
    },
    'clothingShop.topEditor.variation': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.variation = Math.max(0, topEditor.variation + delta);
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.texture': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.texture = Math.max(0, topEditor.texture + delta);
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.torso': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.torso = Math.max(0, topEditor.torso + delta);
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.undershirt': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.undershirt = Math.max(0, topEditor.undershirt + delta);
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.utex': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.uTexture = Math.max(0, topEditor.uTexture + delta);
        applyTopEditorLook();
        openTopEditorMenu();
    },
    'clothingShop.topEditor.texture.add': () => {
        if (!topEditor.active) return;
        topEditor.textureList = addUniqueValue(topEditor.textureList, topEditor.texture);
        openTopEditorMenu();
    },
    'clothingShop.topEditor.utex.add': () => {
        if (!topEditor.active) return;
        topEditor.uTextureList = addUniqueValue(topEditor.uTextureList, topEditor.uTexture);
        openTopEditorMenu();
    },
    'clothingShop.topEditor.texture.reset': () => {
        if (!topEditor.active) return;
        topEditor.textureList = [topEditor.texture];
        openTopEditorMenu();
    },
    'clothingShop.topEditor.utex.reset': () => {
        if (!topEditor.active) return;
        topEditor.uTextureList = [topEditor.uTexture];
        openTopEditorMenu();
    },
    'clothingShop.topEditor.price': (priceText) => {
        if (!topEditor.active) return;
        const parsed = parseInt(String(priceText).replace('$', ''));
        if (Number.isFinite(parsed) && parsed > 0) topEditor.price = parsed;
    },
    'clothingShop.topEditor.class': (value) => {
        if (!topEditor.active) return;
        value = parseInt(value);
        if (Number.isFinite(value) && value > 0) topEditor.class = value;
    },
    'clothingShop.topEditor.save': () => {
        if (!topEditor.active) return;
        const payload = {
            sex: topEditor.sex,
            variation: topEditor.variation,
            texture: topEditor.texture,
            textures: topEditor.textureList,
            torso: topEditor.torso,
            undershirt: topEditor.undershirt,
            uTexture: topEditor.uTexture,
            uTextures: topEditor.uTextureList,
            price: topEditor.price,
            class: topEditor.class,
            pockets: topEditor.pockets,
            clime: topEditor.clime
        };
        mp.events.callRemote('clothingShop.topEditor.save', JSON.stringify(payload));
    },
    'clothingShop.edit.enter': () => {
        if (mp.players.local.vehicle) return mp.notify.error("Покиньте авто", "Ошибка");

        editClothingShopInfo.enter = {
            x: mp.players.local.position.x,
            y: mp.players.local.position.y,
            z: mp.players.local.position.z - 1.0
        };

        destroyEditMarker('enter');
        editMarkers.enter = mp.markers.new(1, new mp.Vector3(editClothingShopInfo.enter.x, editClothingShopInfo.enter.y, editClothingShopInfo.enter.z - 0.05), 0.8, {
            color: [245, 167, 66, 200],
            visible: true,
            dimension: 0
        });
        updateEditMenuValue(0, 'OK');
    },
    'clothingShop.edit.place': () => {
        if (mp.players.local.vehicle) return mp.notify.error("Покиньте авто", "Ошибка");

        editClothingShopInfo.place = {
            x: mp.players.local.position.x,
            y: mp.players.local.position.y,
            z: mp.players.local.position.z,
            h: mp.players.local.getHeading()
        };

        destroyEditMarker('place');
        editMarkers.place = mp.markers.new(0, new mp.Vector3(editClothingShopInfo.place.x, editClothingShopInfo.place.y, editClothingShopInfo.place.z), 1, {
            direction: new mp.Vector3(0, 0, 0),
            rotation: new mp.Vector3(0, 0, 0),
            color: [0, 255, 0, 255],
            visible: true,
            dimension: 0
        });
        updateEditMenuValue(1, 'OK');
    },
    'clothingShop.edit.camera': () => {
        editClothingShopInfo.camera = getGameplayCameraCoord();

        destroyEditMarker('camera');
        editMarkers.camera = mp.markers.new(28, new mp.Vector3(editClothingShopInfo.camera.x, editClothingShopInfo.camera.y, editClothingShopInfo.camera.z), 0.2, {
            color: [0, 170, 255, 255],
            visible: true,
            dimension: 0
        });
        updateEditMenuValue(2, 'OK');
    },
    'clothingShop.edit.save': () => {
        if (editClothingShopInfo.id == null) return mp.notify.error("Магазин не выбран", "Ошибка");
        if (editClothingShopInfo.enter == null) return mp.notify.error("Укажите вход в магазин", "Ошибка");
        if (editClothingShopInfo.place == null) return mp.notify.error("Укажите место примерки", "Ошибка");
        if (editClothingShopInfo.camera == null) return mp.notify.error("Укажите позицию камеры", "Ошибка");

        mp.events.callRemote('clothingShop.edit.save', editClothingShopInfo.id, JSON.stringify(editClothingShopInfo));
    },
    'render': () => {
        if (rotation.left) player.setHeading(player.getHeading() - 2);
        if (rotation.right) player.setHeading(player.getHeading() + 2);

        if (debugText) {
            mp.game.graphics.drawText(debugText, [0.2, 0.5], {
                font: 0,
                color: [255, 240, 28, 255],
                scale: [0.4, 0.4],
                outline: true
            });
        }
    },
    'clothingShop.list.get': (key, list) => {
        if (!clothesList.hasOwnProperty(key)) return;
        clothesList[key] = Array.isArray(list) ? list : [];
        clothesLoaded++;
        if (clothesLoaded >= Object.keys(clothesList).length) {
            clothesLoaded = 0;
            mp.events.callRemote('clothingShop.enter');
        }
    },
    'clothingShop.player.freeze': () => {
        mp.callCEFV('loader.show = true');
        mp.utils.disablePlayerMoving(true);
        player.freezePosition(true);
        playerIsFrozen = true;
    },
    'clothingShop.item.set': (group, index, textureIndex) => {
        // currentItem.group = group;
        // currentItem.index = index;
        // currentItem.textureIndex = textureIndex;

        let sortedList = getSortedList(group);
        let item = sortedList[index];
        if (!item) return;

        if (debugMode) {
            debugText = '';
            if (item.pockets) {
                debugText += `Карманы ${item.pockets} \n`
            }
            if (item.clime) {
                debugText += `Климат ${item.clime}`
            }
        }

        let notif = '';
        if (item.clime) {
            notif += `Климат: от ${item.clime[0]} до ${item.clime[1]} °C`
        }
        if (item.pockets) {
            notif += ` | Вместимость: ${calculateCapacity(item.pockets)} ед.`
        }

        if (notif.length) mp.callCEFV(`selectMenu.notification = '${notif}'`);     
        setClothes(group, item, textureIndex);
    },
    'clothingShop.inputClothes.set': setInputClothes,
    'clothingShop.item.buy': (group, index, textureIndex) => {
        let sortedList = getSortedList(group);
        let item = sortedList[index];
        if (!item) return;
        mp.events.callRemote('clothingShop.item.buy', group, item.id, textureIndex);
    },
    'clothingShop.item.buy.ans': (ans, data) => {
        mp.callCEFV(`selectMenu.loader = false`);
        switch (ans) {
            case 0:
                mp.callCEFV(`selectMenu.notification = 'Предмет добавлен в инвентарь'`);
                break;
            case 1:
                mp.callCEFV(`selectMenu.notification = 'Предмет не найден'`);
                break;
            case 2:
                mp.callCEFV(`selectMenu.notification = \`${data}\``);
                break;
            case 4:
                mp.callCEFV(`selectMenu.notification = 'Недостаточно денег'`);
                break;
            case 5:
                mp.callCEFV(`selectMenu.notification = 'Ошибка финансовой операции'`);
                break;
            case 6:
                mp.callCEFV(`selectMenu.notification = 'В магазине кончилась одежда'`);
                break;
        }
    }
});


function bindKeys(bind) {
    if (bind) {
        mp.keys.bind(0x41, true, startRotationLeft); // A
        mp.keys.bind(0x41, false, stopRotationLeft); // A
        mp.keys.bind(0x44, true, startRotationRight); // D
        mp.keys.bind(0x44, false, stopRotationRight); // D
    } else {
        mp.keys.unbind(0x41, true, startRotationLeft); // A
        mp.keys.unbind(0x41, false, stopRotationLeft); // A
        mp.keys.unbind(0x44, true, startRotationRight); // D
        mp.keys.unbind(0x44, false, stopRotationRight); // D
        rotation.left = false;
        rotation.right = false;
    }
}

function startRotationLeft() {
    rotation.left = true;
}

function stopRotationLeft() {
    rotation.left = false;
}

function startRotationRight() {
    rotation.right = true;
}

function stopRotationRight() {
    rotation.right = false;
}

function setHeaders(type) {
    let img;
    switch (type) {
        case 0:
            img = 'binco';
            break;
        case 1:
            img = 'discount';
            break;
        case 2:
            img = 'suburban';
            break;
        case 3:
            img = 'ponsonbys';
            break;
    }
    ['Main', 'Tops', 'Bags', 'Bracelets', 'Ears', 'Glasses', 'Watches', 'Ties', 'Hats', 'Pants', 'Shoes']
    .forEach(name => mp.callCEFV(`selectMenu.menus["clothing${name}"].headerImg = '${img}.png'`));
}

function initMainMenu() {
    let items = [];
    for (let key in clothesList) {
        let sortedList = getSortedList(key);
        if (!clothesInfo[key]) continue;
        if (sortedList.length > 0) {
            items.push({
                text: clothesInfo[key].name
            });
            initSubMenu(key, sortedList);
        }
    }
    items.push({
        text: 'Закрыть'
    });
    mp.callCEFV(`selectMenu.setItems('clothingMain', ${JSON.stringify(items)});`)
    mp.callCEFV(`selectMenu.menus["clothingMain"].i = 0`);
    mp.callCEFV(`selectMenu.menus["clothingMain"].j = 0`);
}

function getSortedList(group) {
    let list = Array.isArray(clothesList[group]) ? clothesList[group] : [];
    return list.filter(x => x && x.class == shopClass);
}

function initSubMenu(key, list) {
    let items = [];
    let menuName = clothesInfo[key].menuName;
    list.forEach((current) => {
        let values = [];
        for (let i = 0; i < current.textures.length; i++) {
            values.push(`№${i + 1}`);
        }
        items.push({
            text: `${current.name} [$${parseInt(current.price*priceMultiplier)}]`,
            values: values
        });
    })
    items.push({
        text: 'Назад'
    });
    mp.callCEFV(`selectMenu.setItems('clothing${menuName}', ${JSON.stringify(items)});`)
    mp.callCEFV(`selectMenu.menus["clothing${menuName}"].i = 0`);
    mp.callCEFV(`selectMenu.menus["clothing${menuName}"].j = 0`);
}

function setClothes(group, item, textureIndex) {
    let info = clothesInfo[group];

    if (group == 'tops') {
        player.setComponentVariation(3, item.torso, 0, 0);
        player.setComponentVariation(8, item.undershirt, 0, 0);
    }

    let texture = item.textures && item.textures[textureIndex] != null ? item.textures[textureIndex] : 0;
    if (info.component != null) {
        player.setComponentVariation(info.component, item.variation, texture, 0);
    } else {
        player.setPropIndex(info.prop, item.variation, texture, true);
    }
}

function getInputClothes() {
    for (let key in input.clothes) {
        key = parseInt(key);
        input.clothes[key].drawable = player.getDrawableVariation(key);
        input.clothes[key].texture = player.getTextureVariation(key);
    }
    for (let key in input.props) {
        key = parseInt(key);
        input.props[key].drawable = player.getPropIndex(key);
        input.props[key].texture = player.getPropTextureIndex(key);
    }
}

function setInputClothes() {
    for (let key in input.clothes) {
        let item = input.clothes[key];
        key = parseInt(key);
        player.setComponentVariation(key, item.drawable, item.texture, 0);
    }
    for (let key in input.props) {
        let item = input.props[key];
        key = parseInt(key);
        player.setPropIndex(key, item.drawable, item.texture, true);
        if (item.drawable == -1) player.clearProp(key);
    }
}

function initCurrentHair(data) {
    hairInfo.hairstyle = data.hairstyle;
    hairInfo.hairColor = data.hairColor;
    hairInfo.hairHighlightColor = data.hairHighlightColor;
}

function setHair() {
    player.setComponentVariation(2, hairInfo.hairstyle, 0, 2);
    player.setHairColor(hairInfo.hairColor, hairInfo.hairHighlightColor);
}

function calculateCapacity(pockets) {
    let capacity = 0;
    for (let i = 0; i < pockets.length; i++) {
        if (i % 2 == 1) continue;
        capacity += pockets[i] * pockets[i + 1];
    }
    return capacity;
}
