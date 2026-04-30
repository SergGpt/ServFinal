"use strict";

const MAX_TITLE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 240;
const MIN_PRICE = 1;
const MAX_PRICE = 100000000;

let money;
let inventory;

function mapItemToSellOption(item) {
    if (!item || !item.id) return null;
    const itemName = (item.item && item.item.name)
        || (inventory && typeof inventory.getName === "function" ? inventory.getName(item.itemId) : null)
        || `Предмет #${item.id}`;
    return { id: item.id, name: itemName };
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
    if (type === "item") {
        if (!inventory || typeof inventory.getItem !== "function" || typeof inventory.deleteItem !== "function") return { error: "Система инвентаря недоступна" };
        const selectedItem = inventory.getItem(player, targetId);
        const itemOwnerId = Number(selectedItem && (selectedItem.playerId != null ? selectedItem.playerId : selectedItem.ownerId));
        if (!selectedItem || itemOwnerId !== Number(player.character.id)) return { error: "Выбранный предмет не найден" };
        const payload = { itemId: selectedItem.itemId, params: selectedItem.params };
        inventory.deleteItem(player, selectedItem);
        return { payload };
    }

    if (type === "vehicle") {
        const vehicle = await db.Models.Vehicle.findOne({ where: { id: targetId } });
        if (!vehicle || vehicle.owner !== player.character.id) return { error: "Транспорт не найден или не принадлежит вам" };
        await vehicle.update({ owner: 0 });
        return { payload: { id: vehicle.id, modelName: vehicle.modelName, plate: vehicle.plate } };
    }

    if (type === "house") {
        const house = await db.Models.House.findOne({ where: { id: targetId } });
        if (!house || house.characterId !== player.character.id) return { error: "Недвижимость не найдена или не принадлежит вам" };
        await house.update({ characterId: null, characterNick: null });
        return { payload: { id: house.id, interiorId: house.interiorId } };
    }

    if (type === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: targetId } });
        if (!biz || biz.characterId !== player.character.id) return { error: "Бизнес не найден или не принадлежит вам" };
        await biz.update({ characterId: null, characterNick: null });
        return { payload: { id: biz.id, name: biz.name, type: biz.type } };
    }

    return { error: "Неизвестный тип лота" };
}

async function restoreEntityToSeller(player, lot) {
    if (lot.lotType === "item" && lot.lotPayload && inventory && typeof inventory.addItem === "function") {
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
        return;
    }
    if (lot.lotType === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: lot.lotTargetId } });
        if (biz) await biz.update({ characterId: player.character.id, characterNick: player.character.name });
    }
}

async function transferEntityToBuyer(player, lot) {
    if (lot.lotType === "item" && lot.lotPayload) {
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
        return { ok: true };
    }
    if (lot.lotType === "house") {
        const house = await db.Models.House.findOne({ where: { id: lot.lotTargetId } });
        if (!house) return { ok: false, error: "Недвижимость лота не найдена" };
        await house.update({ characterId: player.character.id, characterNick: player.character.name });
        return { ok: true };
    }
    if (lot.lotType === "biz") {
        const biz = await db.Models.Biz.findOne({ where: { id: lot.lotTargetId } });
        if (!biz) return { ok: false, error: "Бизнес лота не найден" };
        await biz.update({ characterId: player.character.id, characterNick: player.character.name });
        return { ok: true };
    }
    return { ok: false, error: "Неизвестный тип лота" };
}


module.exports = {
    init() {
        money = call("money");
        inventory = call("inventory");
    },

    async getActiveLots() {
        return db.Models.MarketplaceLot.findAll({
            where: { status: "active" },
            order: [["createdAt", "DESC"]],
            limit: 100,
            raw: true
        });
    },

    async getPlayerSellOptions(player) {
        const options = { item: [], vehicle: [], house: [], biz: [] };

        if (player && player.inventory && Array.isArray(player.inventory.items) && player.inventory.items.length) {
            options.item = player.inventory.items
                .map(mapItemToSellOption)
                .filter(Boolean);
        } else if (player && player.character) {
            const dbItems = await db.Models.CharacterInventory.findAll({
                where: { playerId: player.character.id },
                include: [{ model: db.Models.InventoryItem, as: "item" }]
            });
            options.item = dbItems
                .map(mapItemToSellOption)
                .filter(Boolean);
        }

        const charId = Number(player && player.character ? player.character.id : 0) || Number(player && player.characterId ? player.characterId : 0) || 0;

        if (!options.item.length && inventory && typeof inventory.loadCharacterItemsFromDB === "function" && charId) {
            const invItems = await inventory.loadCharacterItemsFromDB(charId);
            options.item = (invItems || [])
                .map(mapItemToSellOption)
                .filter(Boolean);
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

        options.item = uniqueById(options.item);
        return options;
    },

    async sendLots(player) {
        const lots = await this.getActiveLots();
        const sellOptions = await this.getPlayerSellOptions(player);
        player.call("marketplace.phone.data", [lots, sellOptions]);
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

        if (!["item", "vehicle", "house", "biz"].includes(normalizedType)) {
            console.log("[marketplace][createLot][invalid-type]", JSON.stringify({ ...debugPayload, normalizedType }));
            return { ok: false, error: "Неизвестный тип лота" };
        }

        if (isNaN(parsedTargetId) || parsedTargetId < 1) {
            console.log("[marketplace][createLot][invalid-target]", JSON.stringify({ ...debugPayload, parsedTargetId }));
            return { ok: false, error: "Не выбран предмет/объект для лота" };
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
        if (lot.sellerCharacterId === player.character.id) return { ok: false, error: "Нельзя купить свой лот" };

        const removed = await new Promise(resolve => {
            money.removeCash(player, lot.price, resolve, `[marketplace] покупка лота #${lot.id}`);
        });
        if (!removed) return { ok: false, error: "Недостаточно наличных" };

        money.addCashById(lot.sellerCharacterId, lot.price, () => {}, `[marketplace] продажа лота #${lot.id}`);

        const transferResult = await transferEntityToBuyer(player, lot);
        if (!transferResult.ok) return transferResult;

        await lot.update({
            status: "sold",
            buyerCharacterId: player.character.id
        });

        return { ok: true, lot };
    }
};


module.exports.removeLot = async function(player, lotId) {
    if (!player || !player.character) return { ok: false, error: "Игрок не найден" };
    const id = parseInt(lotId);
    if (isNaN(id) || id < 1) return { ok: false, error: "Некорректный lotId" };
    const lot = await db.Models.MarketplaceLot.findOne({ where: { id } });
    if (!lot || lot.status !== "active") return { ok: false, error: "Лот недоступен" };
    if (lot.sellerCharacterId !== player.character.id) return { ok: false, error: "Можно снять только свой лот" };

    await restoreEntityToSeller(player, lot);

    await lot.update({ status: "cancelled" });
    return { ok: true, lot };
};
