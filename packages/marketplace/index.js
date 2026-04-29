"use strict";

const MAX_TITLE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 240;
const MIN_PRICE = 1;
const MAX_PRICE = 100000000;

let money;

module.exports = {
    init() {
        money = call("money");
    },

    async getActiveLots() {
        return db.Models.MarketplaceLot.findAll({
            where: { status: "active" },
            order: [["createdAt", "DESC"]],
            limit: 100,
            raw: true
        });
    },

    async sendLots(player) {
        const lots = await this.getActiveLots();
        player.call("marketplace.phone.data", [lots]);
    },

    async createLot(player, title, description, price) {
        if (!player || !player.character || !player.phone) return { ok: false, error: "Телефон не активен" };

        const normalizedTitle = (title || "").trim();
        const normalizedDescription = (description || "").trim();
        const normalizedPriceRaw = String(price == null ? "" : price).replace(/[^\d]/g, "");
        const normalizedPrice = parseInt(normalizedPriceRaw);
        const sellerName = String(player.character.name || `ID ${player.character.id}`).trim().slice(0, 64);

        if (!normalizedTitle || normalizedTitle.length > MAX_TITLE_LENGTH) {
            return { ok: false, error: `Название должно быть от 1 до ${MAX_TITLE_LENGTH} символов` };
        }

        if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
            return { ok: false, error: `Описание должно быть не длиннее ${MAX_DESCRIPTION_LENGTH} символов` };
        }

        if (isNaN(normalizedPrice) || normalizedPrice < MIN_PRICE || normalizedPrice > MAX_PRICE) {
            return { ok: false, error: `Цена должна быть от ${MIN_PRICE} до ${MAX_PRICE}` };
        }

        try {
            await db.Models.MarketplaceLot.create({
                sellerCharacterId: player.character.id,
                sellerName,
                title: normalizedTitle,
                description: normalizedDescription,
                price: normalizedPrice,
                status: "active"
            });
        } catch (e) {
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

        await lot.update({
            status: "sold",
            buyerCharacterId: player.character.id
        });

        return { ok: true, lot };
    }
};
