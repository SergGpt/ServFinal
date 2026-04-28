let clothingShop = require('./index.js');
let money = call('money');
let inventory = call('inventory');
let clothes = call('clothes');
let lastClothesCacheReload = 0;

const CLOTHES_CACHE_RELOAD_INTERVAL = 60 * 1000;


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

async function ensureFreshClothesCache() {
    const now = Date.now();
    if (now - lastClothesCacheReload < CLOTHES_CACHE_RELOAD_INTERVAL) return;

    await clothes.init();
    clothes.updateClientList();
    lastClothesCacheReload = now;
}

function getGenderBuckets(player) {
    const primarySex = player.character.gender ? '0' : '1';
    const secondarySex = primarySex === '0' ? '1' : '0';
    return { primarySex, secondarySex };
}

function getClientClothesListForPlayer(player) {
    const all = clothes.getClientList();
    const { primarySex, secondarySex } = getGenderBuckets(player);
    const primary = all[primarySex] || {};
    const secondary = all[secondarySex] || {};
    const result = {};

    const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
    keys.forEach((key) => {
        const primaryList = Array.isArray(primary[key]) ? primary[key] : [];
        const secondaryList = Array.isArray(secondary[key]) ? secondary[key] : [];
        result[key] = primaryList.length ? primaryList : secondaryList;
    });

    return result;
}

function toClientRows(list) {
    if (!Array.isArray(list)) return [];
    return list.map((model) => {
        const data = model?.dataValues || model || {};
        const row = {};
        Object.keys(data).forEach((key) => {
            row[key] = model[key];
        });
        return row;
    });
}

module.exports = {
    "init": async () => {
        await clothingShop.init();
        inited(__dirname);
    },
    "playerEnterColshape": async (player, shape) => {
        if (!player.character) return;
        if (shape.isClothingShop) {
            try {
                await ensureFreshClothesCache();
            } catch (e) {
                console.log(`[CLOTHINGSHOP] Не удалось обновить кэш одежды: ${e.message}`);
            }

            let isCuffed = player.getVariable('cuffs') || false;
            if (isCuffed) return;

            player.currentClothingShopId = shape.clothingShopId;
            player.dimension = player.id + 1;
            player.call('clothingShop.player.freeze');
            let list = getClientClothesListForPlayer(player);
            const cacheShoesCount = Array.isArray(list.shoes) ? list.shoes.length : 0;
            let directShoesCount = 0;
            if (!Array.isArray(list.shoes) || !list.shoes.length) {
                try {
                    const shoesDirect = await db.Models.ClothesShoe.findAll();
                    directShoesCount = shoesDirect.length;
                    if (directShoesCount) list.shoes = toClientRows(shoesDirect);
                } catch (e) {
                    console.log(`[CLOTHINGSHOP] direct shoes load error: ${e.message}`);
                }
            }
            if (!Array.isArray(list.shoes) || !list.shoes.length) {
                player.call('notifications.push.warning', [`Обувь не найдена (cache: ${cacheShoesCount}, direct: ${directShoesCount})`, 'ClothingShop']);
            }
            const chunkSize = 120;
            for (let key in list) {
                const source = Array.isArray(list[key]) ? list[key] : [];
                const totalParts = Math.max(1, Math.ceil(source.length / chunkSize));
                for (let partIndex = 0; partIndex < totalParts; partIndex++) {
                    const start = partIndex * chunkSize;
                    const end = start + chunkSize;
                    const chunk = source.slice(start, end);
                    player.call('clothingShop.list.getChunk', [key, chunk, partIndex, totalParts]);
                }
            }
            player.hasValidClothesData = true;
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
        const all = clothes.getClientList();
        const { primarySex, secondarySex } = getGenderBuckets(player);
        const primaryList = all[primarySex]?.[group] || [];
        const secondaryList = all[secondarySex]?.[group] || [];
        const list = primaryList.length ? primaryList : secondaryList;
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
            sex: parseInt(item.sex),
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
        },
    "clothingShop.topEditor.save": async (player, rawData) => {
        if (!player.account || player.account.admin < 6) return;

        let data = null;
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            return player.call('notifications.push.error', ['Не удалось прочитать данные топа', 'Ошибка']);
        }

        const sex = parseInt(data.sex);
        const id = parseInt(data.id);
        const variation = parseInt(data.variation);
        const name = String(data.name || `Шмотка ${variation}`).trim().slice(0, 30);
        const torso = parseInt(data.torso);
        const undershirt = parseInt(data.undershirt);
        const price = parseInt(data.price);
        const itemClass = parseInt(data.class);
        const textures = Array.isArray(data.textures) ? data.textures.map(x => parseInt(x)).filter(x => Number.isFinite(x) && x >= 0) : [];
        const uTextures = Array.isArray(data.uTextures) ? data.uTextures.map(x => parseInt(x)).filter(x => Number.isFinite(x) && x >= 0) : [];
        const pockets = Array.isArray(data.pockets) ? data.pockets.map(x => parseInt(x)).filter(Number.isFinite) : [4, 4, 5, 5];
        const clime = Array.isArray(data.clime) ? data.clime.map(x => parseInt(x)).filter(Number.isFinite) : [-10, 20];

        if (![sex, variation, torso, undershirt, price, itemClass].every(Number.isFinite)) {
            return player.call('notifications.push.error', ['Некорректные параметры топа', 'Ошибка']);
        }
        if (![0, 1].includes(sex)) return player.call('notifications.push.error', ['Пол должен быть 0 или 1', 'Ошибка']);
        if (!textures.length) return player.call('notifications.push.error', ['Добавьте хотя бы одну texture', 'Ошибка']);
        if (!uTextures.length) return player.call('notifications.push.error', ['Добавьте хотя бы одну uTexture', 'Ошибка']);
        if (!pockets.length) return player.call('notifications.push.error', ['Некорректные карманы', 'Ошибка']);
        if (clime.length !== 2) return player.call('notifications.push.error', ['Климат должен содержать 2 значения', 'Ошибка']);

        const payload = {
            name,
            variation,
            pockets,
            clime,
            price,
            textures,
            sex,
            torso,
            undershirt,
            uTextures,
            class: itemClass
        };
        let model = null;
        if (Number.isFinite(id) && id > 0) {
            model = await db.Models.ClothesTop.findByPk(id);
            if (model) await model.update(payload);
        }
        if (!model) model = await db.Models.ClothesTop.create(payload);

        if (!clothes.list[sex]) clothes.list[sex] = { tops: [] };
        if (!clothes.list[sex].tops) clothes.list[sex].tops = [];
        const idx = clothes.list[sex].tops.findIndex(x => x.id == model.id);
        if (idx >= 0) clothes.list[sex].tops[idx] = model;
        else clothes.list[sex].tops.push(model);
        clothes.updateClientList();

        player.call('notifications.push.success', [`Топ сохранён в БД (ID: ${model.id})`, 'Успешно']);
    },
    "clothingShop.topEditor.load": async (player, id) => {
        if (!player.account || player.account.admin < 6) return;
        id = parseInt(id);
        if (!Number.isFinite(id) || id <= 0) return;
        const item = await db.Models.ClothesTop.findByPk(id);
        if (!item) return player.call('notifications.push.error', ['Одежда с таким ID не найдена', 'Ошибка']);
        player.call('clothingShop.topEditor.load.ans', [JSON.stringify({
            id: item.id,
            name: item.name,
            variation: item.variation,
            pockets: item.pockets,
            clime: item.clime,
            price: item.price,
            textures: item.textures,
            sex: item.sex,
            torso: item.torso,
            undershirt: item.undershirt,
            uTextures: item.uTextures,
            class: item.class
        })]);
    }
};
