"use strict";

const MAX_TITLE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 240;
const MIN_PRICE = 1;
const MAX_PRICE = 100000000;

let money;
let inventory;
let houses;
let bizes;

const INVENTORY_ITEM_IMAGE_BASE = "img/inventory/items";
const CLOTHING_BODY_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12];

function getParamsValues(item) {
    const params = {};
    if (!item || !Array.isArray(item.params)) return params;
    item.params.forEach((param) => {
        if (!param || param.key == null) return;
        params[param.key] = param.value;
    });
    return params;
}

function getClothingItemIds() {
    if (!inventory || !inventory.bodyList) return [1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    return CLOTHING_BODY_SLOTS.reduce((acc, slot) => {
        const slotItems = inventory.bodyList[slot];
        if (Array.isArray(slotItems)) acc.push(...slotItems);
        return acc;
    }, []);
}

function isClothingInventoryItem(item) {
    if (!item) return false;
    return getClothingItemIds().includes(Number(item.itemId));
}

function getInventoryItemImage(itemId) {
    const id = Number(itemId);
    if (!id) return null;
    return `/${INVENTORY_ITEM_IMAGE_BASE}/${id}.png`;
}

function getLotPreview(payload, itemId) {
    if (!payload) return null;
    if (payload.preview) return payload.preview;
    if (payload.image) return payload.image;
    return itemId ? getInventoryItemImage(itemId) : null;
}

function mapItemToSellOption(item) {
    if (!item || !item.id) return null;
    const itemName = (item.item && item.item.name)
        || (inventory && typeof inventory.getName === "function" ? inventory.getName(item.itemId) : null)
        || `Предмет #${item.id}`;
    const lotType = isClothingInventoryItem(item) ? "clothes" : "item";
    return { id: item.id, name: itemName, lotType, itemId: item.itemId, image: getInventoryItemImage(item.itemId) };
}

function splitInventorySellOptions(items) {
    const options = { item: [], clothes: [] };
    (items || []).forEach((item) => {
        const option = mapItemToSellOption(item);
        if (!option) return;
        options[option.lotType].push(option);
    });
    options.item = uniqueById(options.item);
    options.clothes = uniqueById(options.clothes);
    return options;
}

function uniqueById(list) {
    const seen = new Set();
    return (list || []).filter((entry) => {
        const id = entry && entry.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function lockEntityLot(player, type, targetId) {
    if (type === "item" || type === "clothes") {
        if (!inventory || typeof inventory.getItem !== "function" || typeof inventory.deleteItem !== "function") return { error: "Система инвентаря недоступна" };
        const selectedItem = inventory.getItem(player, targetId);
        const itemOwnerId = Number(selectedItem && (selectedItem.playerId != null ? selectedItem.playerId : selectedItem.ownerId));
        if (!selectedItem || itemOwnerId !== Number(player.character.id)) return { error: "Выбранный предмет не найден" };
        const isClothes = isClothingInventoryItem(selectedItem);
        if (type === "clothes" && !isClothes) return { error: "Выбранный объект не является одеждой" };
        if (type === "item" && isClothes) return { error: "Одежду нужно выставлять в разделе одежды и аксессуаров" };
        const payload = { itemId: selectedItem.itemId, params: getParamsValues(selectedItem), image: getInventoryItemImage(selectedItem.itemId) };
        inventory.deleteItem(player, selectedItem);
        return { payload };
    }

    if (type === "vehicle") {
        const vehicle = await db.Models.Vehicle.findOne({ where: { id: targetId } });
        if (!vehicle || vehicle.owner !== player.character.id) return { error: "Транспорт не найден или не принадлежит вам" };
        return { payload: { id: vehicle.id, modelName: vehicle.modelName, plate: vehicle.plate } };
    }

    if (type === "house") {
        const house = await db.Models.House.findOne({ where: { id: targetId } });
        if (!house || house.characterId !== player.character.id) return { error: "Недвижимость не найдена или не принадлежит вам" };
        return { payload: { id: house.id, interiorId: house.interiorId } };
    }

    if (type === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: targetId } });
        if (!biz || biz.characterId !== player.character.id) return { error: "Бизнес не найден или не принадлежит вам" };
        return { payload: { id: biz.id, name: biz.name, type: biz.type } };
    }

    return { error: "Неизвестный тип лота" };
}

async function restoreEntityToSeller(player, lot) {
    if ((lot.lotType === "item" || lot.lotType === "clothes") && lot.lotPayload && inventory && typeof inventory.addItem === "function") {
        const payload = JSON.parse(lot.lotPayload);
        if (payload && payload.itemId) inventory.addItem(player, payload.itemId, payload.params || {}, () => {});
        return;
    }
    if (lot.lotType === "vehicle") {
        const vehicle = await db.Models.Vehicle.findOne({ where: { id: lot.lotTargetId } });
        if (vehicle) await vehicle.update({ owner: player.character.id });
        return;
    }
    if (lot.lotType === "house") {
        const house = await db.Models.House.findOne({ where: { id: lot.lotTargetId } });
        if (house) await house.update({ characterId: player.character.id, characterNick: player.character.name });
        if (houses && typeof houses.getHouseById === "function") {
            const liveHouse = houses.getHouseById(lot.lotTargetId);
            if (liveHouse && liveHouse.info) {
                liveHouse.info.characterId = player.character.id;
                liveHouse.info.characterNick = player.character.name;
                if (typeof houses.updateHouse === "function") houses.updateHouse(liveHouse);
            }
        }
        return;
    }
    if (lot.lotType === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: lot.lotTargetId } });
        if (biz) await biz.update({ characterId: player.character.id, characterNick: player.character.name });
        if (bizes && typeof bizes.getBizById === "function") {
            const liveBiz = bizes.getBizById(lot.lotTargetId);
            if (liveBiz && liveBiz.info) {
                liveBiz.info.characterId = player.character.id;
                liveBiz.info.characterNick = player.character.name;
                if (typeof bizes.setTimer === "function") bizes.setTimer(liveBiz);
            }
        }
    }
}

async function transferEntityToBuyer(player, lot) {
    if ((lot.lotType === "item" || lot.lotType === "clothes") && lot.lotPayload) {
        if (!inventory || typeof inventory.addItem !== "function") return { ok: false, error: "Система инвентаря недоступна" };
        let payload = null;
        try { payload = JSON.parse(lot.lotPayload); } catch (_) {}
        if (!payload || !payload.itemId) return { ok: false, error: "Данные лота повреждены" };
        inventory.addItem(player, payload.itemId, payload.params || {}, () => {});
        return { ok: true };
    }
    if (lot.lotType === "vehicle") {
        const vehicle = await db.Models.Vehicle.findOne({ where: { id: lot.lotTargetId } });
        if (!vehicle) return { ok: false, error: "Транспорт лота не найден" };
        await vehicle.update({ owner: player.character.id });
        const liveVehicle = mp.vehicles.toArray().find((x) => x && x.db && x.db.id == lot.lotTargetId);
        if (liveVehicle) {
            liveVehicle.db.owner = player.character.id;
            liveVehicle.owner = player.character.id;
        }
        return { ok: true };
    }
    if (lot.lotType === "house") {
        const house = await db.Models.House.findOne({ where: { id: lot.lotTargetId } });
        if (!house) return { ok: false, error: "Недвижимость лота не найдена" };
        await house.update({ characterId: player.character.id, characterNick: player.character.name });
        if (houses && typeof houses.getHouseById === "function") {
            const liveHouse = houses.getHouseById(lot.lotTargetId);
            if (liveHouse && liveHouse.info) {
                liveHouse.info.characterId = player.character.id;
                liveHouse.info.characterNick = player.character.name;
                if (typeof houses.updateHouse === "function") houses.updateHouse(liveHouse);
                if (typeof houses.getHouseInfoForApp === "function") {
                    player.call("phone.app.add", ["house", houses.getHouseInfoForApp(liveHouse)]);
                }
            }
        }
        mp.events.call('player.house.changed', player);
        const sellerPlayer = mp.players.toArray().find((x) => x && x.character && Number(x.character.id) === Number(lot.sellerCharacterId));
        if (sellerPlayer) {
            mp.events.call('player.house.changed', sellerPlayer);
            sellerPlayer.call('phone.app.remove', ["house", lot.lotTargetId]);
        }
        return { ok: true };
    }
    if (lot.lotType === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: lot.lotTargetId } });
        if (!biz) return { ok: false, error: "Бизнес лота не найден" };
        await biz.update({ characterId: player.character.id, characterNick: player.character.name });
        if (bizes && typeof bizes.getBizById === "function") {
            const liveBiz = bizes.getBizById(lot.lotTargetId);
            if (liveBiz && liveBiz.info) {
                liveBiz.info.characterId = player.character.id;
                liveBiz.info.characterNick = player.character.name;
                if (typeof bizes.setTimer === "function") bizes.setTimer(liveBiz);
                if (typeof bizes.getBizInfoForApp === "function") {
                    const bizInfo = bizes.getBizInfoForApp(liveBiz);
                    if (bizInfo) player.call("phone.app.add", ["biz", bizInfo]);
                }
            }
        }
        mp.events.call('player.biz.changed', player);
        const sellerPlayer = mp.players.toArray().find((x) => x && x.character && Number(x.character.id) === Number(lot.sellerCharacterId));
        if (sellerPlayer) {
            mp.events.call('player.biz.changed', sellerPlayer);
            sellerPlayer.call('phone.app.remove', ["biz", lot.lotTargetId]);
        }
        return { ok: true };
    }
    return { ok: false, error: "Неизвестный тип лота" };
}


module.exports = {
    async isEntityListed(type, targetId) {
        const id = parseInt(targetId);
        if (isNaN(id) || id < 1) return false;
        const types = ["item", "clothes"].includes(String(type)) ? ["item", "clothes"] : [String(type)];
        const lots = await db.Models.MarketplaceLot.findAll({ where: { status: "active", lotTargetId: id }, raw: true });
        return lots.some((lot) => types.includes(String(lot.lotType)));
    },
    init() {
        money = call("money");
        inventory = call("inventory");
        houses = call("houses");
        bizes = call("bizes");
    },

    async getActiveLots() {
        const lots = await db.Models.MarketplaceLot.findAll({
            where: { status: "active" },
            order: [["createdAt", "DESC"]],
            limit: 100,
            raw: true
        });
        return lots.map((lot) => {
            let payload = null;
            try { payload = lot.lotPayload ? JSON.parse(lot.lotPayload) : null; } catch (_) {}
            const itemId = payload && payload.itemId;
            const lotType = lot.lotType === "item" && itemId && getClothingItemIds().includes(Number(itemId))
                ? "clothes"
                : lot.lotType;
            return {
                ...lot,
                lotType,
                itemId,
                itemParams: payload && payload.params ? payload.params : null,
                preview: getLotPreview(payload, itemId),
                image: getLotPreview(payload, itemId)
            };
        });
    },

    async getPlayerSellOptions(player) {
        const options = { item: [], clothes: [], vehicle: [], house: [], biz: [] };

        if (player && player.inventory && Array.isArray(player.inventory.items) && player.inventory.items.length) {
            const splitOptions = splitInventorySellOptions(player.inventory.items);
            options.item = splitOptions.item;
            options.clothes = splitOptions.clothes;
        } else if (player && player.character) {
            const dbItems = await db.Models.CharacterInventory.findAll({
                where: { playerId: player.character.id },
                include: [{ model: db.Models.InventoryItem, as: "item" }]
            });
            const splitOptions = splitInventorySellOptions(dbItems);
            options.item = splitOptions.item;
            options.clothes = splitOptions.clothes;
        }

        const charId = Number(player && player.character ? player.character.id : 0) || Number(player && player.characterId ? player.characterId : 0) || 0;

        if (!options.item.length && !options.clothes.length && inventory && typeof inventory.loadCharacterItemsFromDB === "function" && charId) {
            const invItems = await inventory.loadCharacterItemsFromDB(charId);
            const splitOptions = splitInventorySellOptions(invItems);
            options.item = splitOptions.item;
            options.clothes = splitOptions.clothes;
        }
        if (charId) {
            const [vehiclesFromDb, housesFromDb, bizesFromDb] = await Promise.all([
                db.Models.Vehicle.findAll({ where: { owner: charId }, attributes: ["id", "modelName", "plate"], raw: true }),
                db.Models.House.findAll({ where: { characterId: charId }, attributes: ["id", "interiorId"], raw: true }),
                db.Models.Biz.findAll({ where: { characterId: charId }, attributes: ["id", "name"], raw: true })
            ]);

            const vehiclesLive = mp.vehicles
                .toArray()
                .filter((v) => v && v.db && Number(v.db.owner) === charId && (v.db.key === "private" || v.db.key === "market"))
                .map((v) => ({ id: v.db.id, name: `${v.db.modelName || "Vehicle"} [${v.db.plate || "NO-PLATE"}]` }));

            options.vehicle = uniqueById([
                ...vehiclesFromDb.map((v) => ({ id: v.id, name: `${v.modelName || "Vehicle"} [${v.plate || "NO-PLATE"}]` })),
                ...vehiclesLive
            ]);
            options.house = uniqueById(housesFromDb.map((h) => ({ id: h.id, name: `Дом #${h.id}` })));
            options.biz = uniqueById(bizesFromDb.map((b) => ({ id: b.id, name: b.name || `Бизнес #${b.id}` })));
        }

        return options;
    },

    async sendLots(player) {
        const lots = await this.getActiveLots();
        const sellOptions = await this.getPlayerSellOptions(player);
        const viewerCharacterId = player && player.character ? player.character.id : 0;
        const lotsForPlayer = lots.map((lot) => ({
            ...lot,
            isOwn: Number(lot.sellerCharacterId) === Number(viewerCharacterId),
            sellerCharacterId: Number(lot.sellerCharacterId) === Number(viewerCharacterId)
                ? viewerCharacterId
                : lot.sellerCharacterId
        }));
        player.call("marketplace.phone.data", [lotsForPlayer, sellOptions, viewerCharacterId]);
    },

    async createLot(player, title, description, price, lotType = "item", lotTargetId = null) {
        if (!player || !player.character || !player.phone) return { ok: false, error: "Телефон не активен" };

        const normalizedTitle = (title || "").trim();
        const normalizedDescription = (description || "").trim();
        const normalizedPriceRaw = String(price == null ? "" : price)
            .replace(/\s+/g, "")
            .replace(/[^\d]/g, "");
        const normalizedPrice = Number(normalizedPriceRaw);
        const sellerName = String(player.character.name || `ID ${player.character.id}`).trim().slice(0, 64);
        const debugPayload = {
            charId: player.character.id,
            raw: { title, description, price, lotType, lotTargetId },
            normalized: { normalizedTitle, normalizedDescription, normalizedPriceRaw, normalizedPrice }
        };

        if (!normalizedTitle || normalizedTitle.length > MAX_TITLE_LENGTH) {
            console.log("[marketplace][createLot][invalid-title]", JSON.stringify(debugPayload));
            return { ok: false, error: `Название должно быть от 1 до ${MAX_TITLE_LENGTH} символов` };
        }

        if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
            console.log("[marketplace][createLot][invalid-description]", JSON.stringify(debugPayload));
            return { ok: false, error: `Описание должно быть не длиннее ${MAX_DESCRIPTION_LENGTH} символов` };
        }

        if (isNaN(normalizedPrice) || normalizedPrice < MIN_PRICE || normalizedPrice > MAX_PRICE) {
            console.log("[marketplace][createLot][invalid-price]", JSON.stringify(debugPayload));
            return { ok: false, error: `Цена должна быть от ${MIN_PRICE} до ${MAX_PRICE}` };
        }

        const normalizedType = String(lotType || "item").trim().toLowerCase();
        const parsedTargetId = parseInt(lotTargetId);

        if (!["item", "clothes", "vehicle", "house", "biz"].includes(normalizedType)) {
            console.log("[marketplace][createLot][invalid-type]", JSON.stringify({ ...debugPayload, normalizedType }));
            return { ok: false, error: "Неизвестный тип лота" };
        }

        if (isNaN(parsedTargetId) || parsedTargetId < 1) {
            console.log("[marketplace][createLot][invalid-target]", JSON.stringify({ ...debugPayload, parsedTargetId }));
            return { ok: false, error: "Не выбран предмет/объект для лота" };
        }

        if (await this.isEntityListed(normalizedType, parsedTargetId)) {
            return { ok: false, error: "Этот объект уже выставлен на маркетплейсе" };
        }

        const lockResult = await lockEntityLot(player, normalizedType, parsedTargetId);
        if (lockResult.error) {
            console.log("[marketplace][createLot][lock-failed]", JSON.stringify({ ...debugPayload, parsedTargetId, normalizedType, lockError: lockResult.error }));
            return { ok: false, error: lockResult.error };
        }

        const lockedPayload = lockResult.payload || null;

        try {
            await db.Models.MarketplaceLot.create({
                sellerCharacterId: player.character.id,
                sellerName,
                title: normalizedTitle,
                description: normalizedDescription,
                price: normalizedPrice,
                status: "active",
                lotType: normalizedType,
                lotTargetId: parsedTargetId,
                lotPayload: lockedPayload ? JSON.stringify(lockedPayload) : null
            });
        } catch (e) {
            try {
                await restoreEntityToSeller(player, { lotType: normalizedType, lotTargetId: parsedTargetId, lotPayload: lockedPayload ? JSON.stringify(lockedPayload) : null });
            } catch (_) {}
            console.log("[marketplace] createLot error:", e && e.message ? e.message : e);
            return { ok: false, error: "Не удалось создать лот. Проверьте данные и таблицу БД." };
        }

        return { ok: true };
    },

    async buyLot(player, lotId) {
        if (!player || !player.character || !player.phone) return { ok: false, error: "Телефон не активен" };

        const id = parseInt(lotId);
        if (isNaN(id) || id < 1) return { ok: false, error: "Некорректный lotId" };

        const lot = await db.Models.MarketplaceLot.findOne({ where: { id } });
        if (!lot || lot.status !== "active") return { ok: false, error: "Лот недоступен" };
        if (Number(lot.sellerCharacterId) === Number(player.character.id)) return { ok: false, error: "Нельзя купить свой лот" };

        const removed = await new Promise(resolve => {
            money.removeCash(player, lot.price, resolve, `[marketplace] покупка лота #${lot.id}`);
        });
        if (!removed) return { ok: false, error: "Недостаточно наличных" };

        money.addCashById(lot.sellerCharacterId, lot.price, () => {}, `[marketplace] продажа лота #${lot.id}`);

        const transferResult = await transferEntityToBuyer(player, lot);
        if (!transferResult.ok) {
            money.addCashById(player.character.id, lot.price, () => {}, `[marketplace] возврат за неудачную покупку лота #${lot.id}`);
            return transferResult;
        }

        await lot.update({
            status: "sold",
            buyerCharacterId: player.character.id
        });

        mp.events.call('vehicles.private.load', player);
        const sellerPlayer = mp.players.toArray().find((x) => x.character && x.character.id === lot.sellerCharacterId);
        if (sellerPlayer) mp.events.call('vehicles.private.load', sellerPlayer);

        return { ok: true, lot };
    }
};


module.exports.removeLot = async function(player, lotId) {
    if (!player || !player.character) return { ok: false, error: "Игрок не найден" };
    const id = parseInt(lotId);
    if (isNaN(id) || id < 1) return { ok: false, error: "Некорректный lotId" };
    const lot = await db.Models.MarketplaceLot.findOne({ where: { id } });
    if (!lot || lot.status !== "active") return { ok: false, error: "Лот недоступен" };
    if (Number(lot.sellerCharacterId) !== Number(player.character.id)) return { ok: false, error: "Можно снять только свой лот" };

    const cancelFee = Math.max(1, Math.floor(Number(lot.price || 0) * 0.01));
    const feeRemoved = await new Promise((resolve) => {
        money.removeCash(player, cancelFee, resolve, `[marketplace] комиссия за отмену лота #${lot.id}`);
    });
    if (!feeRemoved) return { ok: false, error: `Для отмены лота нужно оплатить комиссию $${cancelFee}` };

    await restoreEntityToSeller(player, lot);

    await lot.update({ status: "cancelled" });
    return { ok: true, lot };
};
