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
let clothesLoadState = {
    loadedKeys: new Set(),
    buffer: {}
};
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
    lastId: 0,
    dbId: 0,
    name: '',
    drafts: {},
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

function openTopEditorUi() {
    mp.callCEFV(`(function(){
        if (window.__topEditorInit) return;
        window.__topEditorInit = true;
        var root = document.createElement('div');
        root.id = 'top-editor-pro';
        root.style.cssText = 'position:fixed;right:2vh;top:10vh;width:38vh;background:rgba(15,15,18,.95);color:#fff;z-index:99999;padding:1.2vh;border:1px solid #333;border-radius:.6vh;font-family:Arial;';
        root.innerHTML = '<div style="font-weight:700;margin-bottom:1vh;">Top Editor PRO</div>'
        + '<div id="te-last" style="font-size:1.3vh;opacity:.8;margin-bottom:.8vh;"></div>'
        + '<div style="display:flex;gap:.6vh;margin-bottom:.6vh;"><input id="te-db" placeholder="DB ID" style="width:10vh"><button id="te-db-load">Загрузить из БД</button></div>'
        + '<div style="display:flex;gap:.6vh;margin-bottom:.6vh;"><input id="te-var" placeholder="Variation" style="flex:1"><button id="te-load">Показать</button><button id="te-prev">◀</button><button id="te-next">▶</button></div>'
        + '<div style="display:flex;gap:.6vh;margin-bottom:.6vh;"><input id="te-name" placeholder="Название" style="flex:1"></div>'
        + '<div style="display:flex;gap:.6vh;margin-bottom:.6vh;"><input id="te-price" placeholder="Цена" style="flex:1"><input id="te-class" placeholder="Класс" style="width:8vh"><input id="te-pockets" placeholder="[4,4,5,5]" style="flex:1"></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4vh;margin-bottom:.6vh;">'
        + '<button id="te-vm">Var-</button><button id="te-vp">Var+</button><button id="te-tm">Tex-</button><button id="te-tp">Tex+</button><button id="te-torsom">Torso-</button><button id="te-torsop">Torso+</button><button id="te-um">Under-</button><button id="te-up">Under+</button><button id="te-utm">UTex-</button><button id="te-utp">UTex+</button>'
        + '</div>'
        + '<div id="te-cur" style="font-size:1.2vh;opacity:.85;margin-bottom:.6vh;"></div>'
        + '<div style="display:flex;gap:.6vh;"><button id="te-add" style="flex:1;background:#2f8f4e;color:white;">Добавить в БД</button><button id="te-close">Закрыть</button></div>';
        document.body.appendChild(root);
        var q=function(id){return document.getElementById(id)};
        q('te-db-load').onclick=function(){ mp.trigger('clothingShop.topEditor.db.load', q('te-db').value); };
        q('te-load').onclick=function(){ mp.trigger('clothingShop.topEditor.id.set', q('te-var').value); };
        q('te-prev').onclick=function(){ mp.trigger('clothingShop.topEditor.id.shift', -1); };
        q('te-next').onclick=function(){ mp.trigger('clothingShop.topEditor.id.shift', 1); };
        q('te-vm').onclick=function(){ mp.trigger('clothingShop.topEditor.variation', -1); };
        q('te-vp').onclick=function(){ mp.trigger('clothingShop.topEditor.variation', 1); };
        q('te-tm').onclick=function(){ mp.trigger('clothingShop.topEditor.texture', -1); };
        q('te-tp').onclick=function(){ mp.trigger('clothingShop.topEditor.texture', 1); };
        q('te-torsom').onclick=function(){ mp.trigger('clothingShop.topEditor.torso', -1); };
        q('te-torsop').onclick=function(){ mp.trigger('clothingShop.topEditor.torso', 1); };
        q('te-um').onclick=function(){ mp.trigger('clothingShop.topEditor.undershirt', -1); };
        q('te-up').onclick=function(){ mp.trigger('clothingShop.topEditor.undershirt', 1); };
        q('te-utm').onclick=function(){ mp.trigger('clothingShop.topEditor.utex', -1); };
        q('te-utp').onclick=function(){ mp.trigger('clothingShop.topEditor.utex', 1); };
        q('te-close').onclick=function(){ mp.trigger('clothingShop.topEditor.close'); };
        q('te-add').onclick=function(){ mp.trigger('clothingShop.topEditor.form.save', q('te-name').value, q('te-price').value, q('te-class').value, q('te-pockets').value, q('te-db').value); };
        window.__topEditorSync = function(s){
            q('te-last').innerText = 'Последний ID в БД: ' + s.lastId;
            q('te-db').value = s.dbId || '';
            q('te-var').value = s.variation;
            q('te-name').value = s.name;
            q('te-price').value = s.price;
            q('te-class').value = s.itemClass;
            q('te-pockets').value = s.pockets;
            q('te-cur').innerText = 'var=' + s.variation + ' tex=' + s.texture + ' torso=' + s.torso + ' under=' + s.undershirt + ' uTex=' + s.uTexture;
        };
    })();`);
}

function syncTopEditorUi() {
    const state = {
        lastId: topEditor.lastId || 0,
        dbId: topEditor.dbId || '',
        variation: topEditor.variation,
        texture: topEditor.texture,
        torso: topEditor.torso,
        undershirt: topEditor.undershirt,
        uTexture: topEditor.uTexture,
        name: topEditor.name || `Шмотка ${topEditor.variation}`,
        price: topEditor.price || 100,
        itemClass: topEditor.class || 1,
        pockets: JSON.stringify(topEditor.pockets || [4, 4, 5, 5])
    };
    mp.callCEFV(`if (window.__topEditorSync) window.__topEditorSync(${JSON.stringify(state)});`);
}

function closeTopEditorUi() {
    mp.callCEFV(`(function(){var el=document.getElementById('top-editor-pro'); if(el) el.remove(); window.__topEditorInit=false; window.__topEditorSync=null;})();`);
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
    'clothingShop.topEditor.open': (lastId) => {
        if (mp.busy.includes()) return;
        if (!mp.busy.add('clothingShop.topEditor', false)) return;
        mp.gui.cursor.show(true, true);

        topEditor.active = true;
        topEditor.lastId = parseInt(lastId) || 0;
        topEditor.dbId = 0;
        topEditor.drafts = {};
        topEditor.sex = player.getVariable('gender') ? 0 : 1;
        topEditor.variation = Math.max(0, player.getDrawableVariation(11));
        topEditor.texture = Math.max(0, player.getTextureVariation(11));
        topEditor.torso = Math.max(0, player.getDrawableVariation(3));
        topEditor.undershirt = Math.max(0, player.getDrawableVariation(8));
        topEditor.uTexture = Math.max(0, player.getTextureVariation(8));
        topEditor.textureList = [topEditor.texture];
        topEditor.uTextureList = [topEditor.uTexture];
        topEditor.name = `Шмотка ${topEditor.variation}`;
        topEditor.price = 100;
        topEditor.class = 1;
        topEditor.pockets = [4, 4, 5, 5];
        topEditor.clime = [-10, 20];
        applyTopEditorLook();
        openTopEditorUi();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.close': () => {
        topEditor.active = false;
        mp.busy.remove('clothingShop.topEditor');
        mp.gui.cursor.show(false, false);
        closeTopEditorUi();
    },
    'clothingShop.topEditor.variation': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.variation = Math.max(0, topEditor.variation + delta);
        topEditor.name = `Шмотка ${topEditor.variation}`;
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.id.set': (value) => {
        if (!topEditor.active) return;
        value = parseInt(value);
        if (!Number.isFinite(value) || value < 0) return;
        topEditor.drafts[topEditor.variation] = {
            name: topEditor.name,
            price: topEditor.price,
            pockets: topEditor.pockets
        };
        topEditor.variation = value;
        topEditor.dbId = 0;
        const draft = topEditor.drafts[value] || topEditor.drafts[value - 1];
        if (draft) {
            topEditor.name = draft.name;
            topEditor.price = draft.price;
            topEditor.pockets = draft.pockets;
        } else {
            topEditor.name = `Шмотка ${value}`;
        }
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.db.load': (dbId) => {
        if (!topEditor.active) return;
        dbId = parseInt(dbId);
        if (!Number.isFinite(dbId) || dbId <= 0) return;
        mp.events.callRemote('clothingShop.topEditor.load', dbId);
    },
    'clothingShop.topEditor.load.ans': (raw) => {
        if (!topEditor.active) return;
        let data = null;
        try { data = JSON.parse(raw); } catch (e) { return; }
        if (!data) return;
        topEditor.dbId = data.id || 0;
        topEditor.sex = data.sex;
        topEditor.variation = data.variation;
        topEditor.textureList = Array.isArray(data.textures) && data.textures.length ? data.textures : [0];
        topEditor.texture = topEditor.textureList[0];
        topEditor.torso = data.torso;
        topEditor.undershirt = data.undershirt;
        topEditor.uTextureList = Array.isArray(data.uTextures) && data.uTextures.length ? data.uTextures : [0];
        topEditor.uTexture = topEditor.uTextureList[0];
        topEditor.name = data.name || `Шмотка ${topEditor.variation}`;
        topEditor.price = data.price || 100;
        topEditor.class = data.class || 1;
        topEditor.pockets = Array.isArray(data.pockets) ? data.pockets : [4, 4, 5, 5];
        topEditor.clime = Array.isArray(data.clime) && data.clime.length === 2 ? data.clime : [-10, 20];
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.id.shift': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        mp.events.call('clothingShop.topEditor.id.set', topEditor.variation + delta);
    },
    'clothingShop.topEditor.texture': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.texture = Math.max(0, topEditor.texture + delta);
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.torso': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.torso = Math.max(0, topEditor.torso + delta);
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.undershirt': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.undershirt = Math.max(0, topEditor.undershirt + delta);
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.utex': (delta) => {
        if (!topEditor.active) return;
        delta = parseInt(delta);
        if (!Number.isFinite(delta)) return;
        topEditor.uTexture = Math.max(0, topEditor.uTexture + delta);
        applyTopEditorLook();
        syncTopEditorUi();
    },
    'clothingShop.topEditor.form.save': (name, price, classRaw, pocketsRaw, dbIdRaw) => {
        if (!topEditor.active) return;
        topEditor.name = String(name || `Шмотка ${topEditor.variation}`).trim();
        topEditor.price = Math.max(1, parseInt(price) || 100);
        topEditor.class = Math.max(1, parseInt(classRaw) || 1);
        const dbId = parseInt(dbIdRaw);
        topEditor.dbId = Number.isFinite(dbId) && dbId > 0 ? dbId : 0;
        try {
            const p = JSON.parse(pocketsRaw);
            if (Array.isArray(p) && p.length) topEditor.pockets = p.map(x => parseInt(x)).filter(Number.isFinite);
        } catch (e) {}
        topEditor.textureList = addUniqueValue(topEditor.textureList, topEditor.texture);
        topEditor.uTextureList = addUniqueValue(topEditor.uTextureList, topEditor.uTexture);
        topEditor.drafts[topEditor.variation] = {
            name: topEditor.name,
            price: topEditor.price,
            pockets: topEditor.pockets
        };
        const payload = {
            sex: topEditor.sex,
            variation: topEditor.variation,
            textures: topEditor.textureList,
            torso: topEditor.torso,
            undershirt: topEditor.undershirt,
            uTextures: topEditor.uTextureList,
            price: topEditor.price,
            class: topEditor.class,
            pockets: topEditor.pockets,
            clime: topEditor.clime,
            name: topEditor.name,
            id: topEditor.dbId
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
    'clothingShop.list.getChunk': (key, chunk, partIndex, totalParts) => {
        if (!clothesList.hasOwnProperty(key)) return;
        partIndex = parseInt(partIndex) || 0;
        totalParts = parseInt(totalParts) || 1;

        if (partIndex === 0) clothesLoadState.buffer[key] = [];
        if (!Array.isArray(clothesLoadState.buffer[key])) clothesLoadState.buffer[key] = [];
        if (Array.isArray(chunk) && chunk.length) clothesLoadState.buffer[key].push(...chunk);

        if (partIndex >= totalParts - 1) {
            clothesList[key] = clothesLoadState.buffer[key];
            clothesLoadState.loadedKeys.add(key);
        }

        if (clothesLoadState.loadedKeys.size >= Object.keys(clothesList).length) {
            clothesLoadState.loadedKeys.clear();
            clothesLoadState.buffer = {};
            mp.events.callRemote('clothingShop.enter');
        }
    },
    'clothingShop.player.freeze': () => {
        mp.callCEFV('loader.show = true');
        mp.utils.disablePlayerMoving(true);
        player.freezePosition(true);
        playerIsFrozen = true;
        clothesLoadState.loadedKeys.clear();
        clothesLoadState.buffer = {};
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
    ['Main', 'Tops', 'Bags', 'Bracelets', 'Ears', 'Glasses', 'Watches', 'Ties', 'Hats', 'Pants', 'Shoes', 'Shoe']
    .forEach(name => mp.callCEFV(`selectMenu.menus["clothing${name}"].headerImg = '${img}.png'`));
}

function initMainMenu() {
    let items = [];
    for (let key in clothesList) {
        let sortedList = getSortedList(key);
        if (!clothesInfo[key]) continue;
        // Обувь держим всегда доступной в меню, чтобы можно было открыть раздел
        // даже если сервер вернул пустой/битый список и быстро проверить содержимое.
        if (sortedList.length > 0 || key === 'shoes') {
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
    const normalizedShopClass = parseInt(shopClass);
    const classFiltered = list.filter(x => {
        if (!x) return false;
        const itemClass = parseInt(x.class);
        if (!Number.isFinite(normalizedShopClass) || !Number.isFinite(itemClass)) return true;
        return itemClass === normalizedShopClass;
    });

    // Fallback: если в текущем классе нет записей (или класс магазина/вещи не задан),
    // показываем все доступные вещи группы, чтобы новые записи из БД не "пропадали" из меню.
    if (classFiltered.length) return classFiltered;
    return list.filter(Boolean);
}

function initSubMenu(key, list) {
    let items = [];
    let menuName = clothesInfo[key].menuName;
    list.forEach((current) => {
        const textures = Array.isArray(current.textures) && current.textures.length ? current.textures : [0];
        let values = [];
        for (let i = 0; i < textures.length; i++) {
            values.push(`№${i + 1}`);
        }
        const itemPrice = parseInt((Number(current.price) || 0) * (Number(priceMultiplier) || 1));
        items.push({
            text: `${current.name} [$${itemPrice}]`,
            values: values
        });
    })
    items.push({
        text: 'Назад'
    });
    mp.callCEFV(`selectMenu.setItems('clothing${menuName}', ${JSON.stringify(items)});`)
    mp.callCEFV(`selectMenu.menus["clothing${menuName}"].i = 0`);
    mp.callCEFV(`selectMenu.menus["clothing${menuName}"].j = 0`);
    if (key === 'shoes') {
        mp.callCEFV(`selectMenu.setItems('clothingShoe', ${JSON.stringify(items)});`);
        mp.callCEFV(`selectMenu.menus["clothingShoe"].i = 0`);
        mp.callCEFV(`selectMenu.menus["clothingShoe"].j = 0`);
    }
}

function setClothes(group, item, textureIndex) {
    let info = clothesInfo[group];

    if (group == 'tops') {
        player.setComponentVariation(3, item.torso, 0, 0);
        player.setComponentVariation(8, item.undershirt, 0, 0);
    }

    const textures = Array.isArray(item.textures) && item.textures.length ? item.textures : [0];
    let texture = textures[textureIndex] != null ? textures[textureIndex] : 0;
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
