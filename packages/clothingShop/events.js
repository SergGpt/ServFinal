let clothingShop = require('./index.js');
let money = call('money');
let inventory = call('inventory');
let clothes = call('clothes');


function capacityToPockets(capacity) {
    capacity = parseInt(capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) return null;

    // Ограничиваем до разумного размера кармана для UI.
    const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(capacity))));
    const rows = Math.max(1, Math.ceil(capacity / cols));
    return [cols, rows];
}

function isValidVector3(data) {
    return data
        && Number.isFinite(data.x)
        && Number.isFinite(data.y)
        && Number.isFinite(data.z);
}

function parseIntArray(raw, fallback = [0]) {
    if (Array.isArray(raw)) {
        const list = raw.map((x) => parseInt(x)).filter((x) => Number.isFinite(x) && x >= 0);
        return list.length ? list : fallback;
    }
    if (typeof raw !== 'string' || !raw.length) return fallback;

    const list = raw
        .split(',')
        .map((x) => parseInt(x.trim()))
        .filter((x) => Number.isFinite(x) && x >= 0);

    return list.length ? list : fallback;
}

module.exports = {
    "init": async () => {
        await clothingShop.init();
        inited(__dirname);
    },
    "playerEnterColshape": (player, shape) => {
        if (!player.character) return;
        if (shape.isClothingShop) {

            let isCuffed = player.getVariable('cuffs') || false;
            if (isCuffed) return;

            player.currentClothingShopId = shape.clothingShopId;
            player.dimension = player.id + 1;
            if (player.hasValidClothesData) {
                mp.events.call('clothingShop.enter', player);
            } else {
                player.call('clothingShop.player.freeze');
                let gender = player.character.gender ? '0' : '1';
                let list = clothes.getClientList()[gender];
                for (let key in list) {
                    player.call('clothingShop.list.get', [key, list[key]]);
                }
                player.hasValidClothesData = true;
            }
        }
    },
    "clothingShop.enter": (player) => {
        let id = player.currentClothingShopId;
        let data = clothingShop.getRawShopData(id);
        data.appearance = {
            hairColor: player.character.hairColor,
            hairHighlightColor: player.character.hairHighlightColor,
            hairstyle: player.character.hair
        }
        player.call('clothingShop.enter', [data]);
    },
    "clothingShop.exit": (player) => {
        player.dimension = 0;
        inventory.updateAllView(player);
    },
    "clothingShop.edit.save": async (player, shopId, rawData) => {
        if (!player.account || player.account.admin < 6) return;

        shopId = parseInt(shopId);
        if (isNaN(shopId)) return player.call('notifications.push.error', ['Некорректный ID магазина', 'Ошибка']);

        let data = null;
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            return player.call('notifications.push.error', ['Не удалось прочитать данные меню', 'Ошибка']);
        }

        if (!data || !isValidVector3(data.enter) || !isValidVector3(data.place) || !isValidVector3(data.camera) || !Number.isFinite(data.place.h)) {
            return player.call('notifications.push.error', ['Заполните вход, место примерки и камеру', 'Ошибка']);
        }

        const shop = await clothingShop.updateShopLayout(shopId, data);
        if (!shop) return player.call('notifications.push.error', ['Магазин не найден', 'Ошибка']);

        player.call('notifications.push.success', [`Настройки магазина одежды #${shopId} сохранены`, 'Успешно']);
        player.call('clothingShop.edit.close');
    },
    "clothingShop.topCreator.save": async (player, rawData) => {
        if (!player.account || player.account.admin < 6) return;

        let data = null;
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            return player.call('notifications.push.error', ['Не удалось прочитать данные конструктора', 'Ошибка']);
        }

        if (!data || typeof data !== 'object') {
            return player.call('notifications.push.error', ['Некорректные данные конструктора', 'Ошибка']);
        }

        const payload = {
            name: String(data.name || '').trim().slice(0, 30),
            variation: parseInt(data.variation),
            pockets: data.pockets || [2, 2],
            clime: data.clime || [-10, 25],
            price: parseInt(data.price),
            textures: parseIntArray(data.textures, [0]),
            sex: parseInt(data.sex),
            torso: parseInt(data.torso),
            undershirt: parseInt(data.undershirt),
            uTextures: parseIntArray(data.uTextures, [0]),
            class: parseInt(data.class)
        };

        if (Array.isArray(payload.clime) && payload.clime.length >= 2 && payload.clime[0] > payload.clime[1]) {
            const temp = payload.clime[0];
            payload.clime[0] = payload.clime[1];
            payload.clime[1] = temp;
        }

        if (!payload.name.length) payload.name = `Top #${payload.variation}`;
        if (!Number.isFinite(payload.variation) || payload.variation < 0) {
            return player.call('notifications.push.error', ['variation должен быть >= 0', 'Ошибка']);
        }
        if (!Number.isFinite(payload.price) || payload.price < 0) {
            return player.call('notifications.push.error', ['price должен быть >= 0', 'Ошибка']);
        }
        if (![0, 1].includes(payload.sex)) {
            return player.call('notifications.push.error', ['sex должен быть 0 или 1', 'Ошибка']);
        }
        if (!Number.isFinite(payload.torso) || payload.torso < 0 || !Number.isFinite(payload.undershirt) || payload.undershirt < 0) {
            return player.call('notifications.push.error', ['torso/undershirt должны быть >= 0', 'Ошибка']);
        }
        if (!Number.isFinite(payload.class) || payload.class < 1) payload.class = 1;

        const created = await db.Models.ClothesTop.create(payload);
        clothes.list[payload.sex].tops.push(created);
        clothes.updateClientList();

        player.call('notifications.push.success', [`Top #${created.id} сохранен в clothestops`, 'Успешно']);
        player.call('clothingShop.topCreator.saved', [created.id]);
    },
    "clothingShop.item.buy": (player, group, itemId, textureIndex) => {
        let shopId = player.currentClothingShopId;
        let gender = player.character.gender ? '0' : '1';
        let list = clothes.getClientList()[gender][group];
        let item = list.find(x => x.id == itemId);

        if (!item) return player.call('clothingShop.item.buy.ans', [1]);

        let defaultPrice = item.price;
        let products = clothingShop.calculateProductsNeeded(item.price);
        let price = parseInt(defaultPrice * clothingShop.getPriceMultiplier(shopId));
        //let income = parseInt(products * clothingShop.productPrice * clothingShop.getPriceMultiplier(shopId));


        if (player.character.cash < price) return player.call('clothingShop.item.buy.ans', [4]);
        let productsAvailable = clothingShop.getProductsAmount(shopId);
        if (products > productsAvailable) return player.call('clothingShop.item.buy.ans', [6]);
        let params = {
            sex: parseInt(gender),
            variation: item.variation,
            texture: (Array.isArray(item.textures) ? item.textures[textureIndex] : null),
            name: item.name
        }

        if (params.texture == null) params.texture = 0;
        if (group === 'bags' && item.capacity != null) {
            const bagPockets = capacityToPockets(item.capacity);
            if (bagPockets) params.pockets = JSON.stringify(bagPockets);
        }

        if (item.torso != null) params.torso = item.torso;
        if (item.undershirt != null) {
            params.undershirt = item.undershirt;
            params.uTexture = 0;
        }
        if (item.clime != null) params.clime = JSON.stringify(item.clime);
        if (item.pockets != null) params.pockets = JSON.stringify(item.pockets);

        inventory.addItem(player, clothingShop.itemIds[group], params, (e) => {
                if (e) return player.call('clothingShop.item.buy.ans', [2, e]);
                money.removeCash(player, price, function (result) {
                    if (result) {
                        clothingShop.removeProducts(shopId, products);
                        clothingShop.updateCashbox(shopId, price);
                        player.call('clothingShop.item.buy.ans', [0]);
                    } else {
                        player.call('clothingShop.item.buy.ans', [5]);
                    }
                }, `Покупка одежды ${group}. Variation #${itemId}. Texture #${textureIndex}`);
            });
        }
};
