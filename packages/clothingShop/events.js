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
