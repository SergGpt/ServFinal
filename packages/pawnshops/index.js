"use strict";

const inventory = call('inventory');
const money = call('money');
const notifs = call('notifications');

/**
 * Конфигурация скупщиков награбленного.
 * Добавьте новый объект в массив `brokers`, чтобы создать дополнительную точку скупки.
 * Чтобы добавить новый предмет конкретному скупщику, внесите объект в его массив `items`.
 * Используйте поле `itemId` (или `id`) с числовым идентификатором предмета из таблицы InventoryItem,
 * чтобы избежать путаницы в названиях. Поле `name` используется только для отображения в меню,
 * а `price` определяет выплату за одну единицу при продаже.
 */
module.exports = {
    brokers: [
        {
            id: 'jewelry',
            title: 'Скупщик ювелирных изделий',
            ped: {
                model: 's_m_m_highsec_01',
                position: { x: -622.246, y: -230.728, z: 38.057 },
                heading: 215.0,
            },
            marker: {
                position: { x: -622.143, y: -230.855, z: 37.057 },
                color: [255, 215, 0, 120],
            },
            blip: {
                sprite: 617,
                color: 5,
                name: 'Скупщик ювелирки',
            },
            interactionRadius: 1.5,
            items: [
                { itemId: 205, name: 'Золотая цепь', price: 450 },
                { itemId: 215, name: 'Серебряная цепочка', price: 220 },
                { itemId: 206, name: 'Золотые часы', price: 520 },
                { itemId: 207, name: 'Золотое кольцо', price: 380 },
                { itemId: 216, name: 'Серебряное кольцо', price: 200 },
                { itemId: 217, name: 'Золотая зажигалка', price: 260 },
                { itemId: 218, name: 'Браслет', price: 240 },
                { itemId: 219, name: 'Старинная монета', price: 310 },
                { itemId: 242, name: 'Кулон', price: 210 },
                { itemId: 241, name: 'Брелок', price: 120 },
            ],
        },
        {
            id: 'collectibles',
            title: 'Скупщик редких вещей',
            ped: {
                model: 'u_m_m_partytarget',
                position: { x: -426.438, y: 23.251, z: 46.229 },
                heading: 176.5,
            },
            marker: {
                position: { x: -426.431, y: 23.344, z: 45.229 },
                color: [205, 133, 63, 120],
            },
            blip: {
                sprite: 617,
                color: 47,
                name: 'Скупщик антиквариата',
            },
            interactionRadius: 1.5,
            items: [
                { itemId: 208, name: 'Картина', price: 420 },
                { itemId: 209, name: 'Инструмент', price: 210 },
                { itemId: 210, name: 'Старый паспорт', price: 260 },
                { itemId: 211, name: 'Старое фото', price: 310 },
                { itemId: 220, name: 'Пепельница', price: 140 },
                { itemId: 221, name: 'Старый будильник', price: 180 },
                { itemId: 222, name: 'Фонарик', price: 160 },
                { itemId: 225, name: 'Музыкальная пластинка', price: 190 },
                { itemId: 226, name: 'Старая книга', price: 200 },
                { itemId: 227, name: 'Дискета', price: 90 },
                { itemId: 232, name: 'Кастрюля', price: 150 },
                { itemId: 233, name: 'Кофеварка', price: 240 },
                { itemId: 234, name: 'Металлический лом', price: 170 },
                { itemId: 235, name: 'Жестяная банка', price: 60 },
                { itemId: 236, name: 'Бита', price: 150 },
                { itemId: 237, name: 'Пустой кошелёк', price: 130 },
                { itemId: 238, name: 'Старый чемодан', price: 260 },
                { itemId: 240, name: 'Старые очки', price: 120 },
                { itemId: 243, name: 'Пачка сигарет', price: 80 },
                { itemId: 244, name: 'Ключи от старой машины', price: 160 },
                { itemId: 245, name: 'Пластмассовая игрушка', price: 110 },
                { itemId: 246, name: 'Бутылка вина', price: 140 },
                { itemId: 247, name: 'Кусок ткани', price: 70 },
                { itemId: 248, name: 'Пустая коробка', price: 90 },
                { itemId: 249, name: 'Банка краски', price: 150 },
            ],
        },
        {
            id: 'electronics',
            title: 'Скупщик электроники',
            ped: {
                model: 's_m_m_lathandy_01',
                position: { x: -656.284, y: -857.401, z: 24.490 },
                heading: 177.8,
            },
            marker: {
                position: { x: -656.236, y: -857.402, z: 23.490 },
                color: [100, 149, 237, 120],
            },
            blip: {
                sprite: 459,
                color: 38,
                name: 'Скупщик электроники',
            },
            interactionRadius: 1.5,
            items: [
                { itemId: 212, name: 'Разбитый телефон', price: 280 },
                { itemId: 213, name: 'Сломанный фотоаппарат', price: 320 },
                { itemId: 214, name: 'Сломанный планшет', price: 360 },
                { itemId: 223, name: 'Старый радиоприёмник', price: 260 },
                { itemId: 224, name: 'Видеокамера', price: 310 },
                { itemId: 228, name: 'Игровая приставка', price: 340 },
                { itemId: 229, name: 'Камера наблюдения', price: 300 },
                { itemId: 230, name: 'Старый телевизор', price: 420 },
                { itemId: 231, name: 'Старый ноутбук', price: 330 },
                { itemId: 239, name: 'Старый фотоаппарат', price: 280 },
                { itemId: 250, name: 'Старый мобильник', price: 220 },
            ],
        },
    ],

    brokerById: {},

    init() {
        this.brokerById = {};
        this.brokers.forEach((broker, index) => {
            if (!broker.id) broker.id = `pawnshop_${index}`;
            this.brokerById[broker.id] = broker;
            this.setupBrokerColshape(broker);
        });
    },

    setupBrokerColshape(broker) {
        const { position } = broker.marker || broker.ped;
        const radius = broker.interactionRadius || 1.5;
        const colshape = mp.colshapes.newSphere(position.x, position.y, position.z, radius);

        colshape.onEnter = (player) => {
            if (!player.character) return;
            player.pawnshopBrokerId = broker.id;
            player.call('pawnshops.prompt', [broker.id, broker.title]);
        };

        colshape.onExit = (player) => {
            if (!player.character) return;
            if (player.pawnshopBrokerId === broker.id) delete player.pawnshopBrokerId;
            player.call('pawnshops.prompt');
            player.call('pawnshops.menu.hide');
        };

        broker.colshape = colshape;
    },

    getBroker(id) {
        return this.brokerById[id];
    },

    getClientConfig() {
        return this.brokers.map((broker) => ({
            id: broker.id,
            ped: {
                model: broker.ped.model,
                position: broker.ped.position,
                heading: broker.ped.heading,
                marker: broker.marker ? {
                    x: broker.marker.position.x,
                    y: broker.marker.position.y,
                    z: broker.marker.position.z,
                    color: broker.marker.color,
                } : null,
                blip: broker.blip ? {
                    sprite: broker.blip.sprite,
                    position: {
                        x: broker.marker ? broker.marker.position.x : broker.ped.position.x,
                        y: broker.marker ? broker.marker.position.y : broker.ped.position.y,
                        z: broker.marker ? broker.marker.position.z : broker.ped.position.z,
                    },
                    color: broker.blip.color,
                    name: broker.blip.name,
                } : null,
            },
        }));
    },

    resolveBrokerItems(broker) {
        const signature = JSON.stringify(broker.items);
        if (!broker.resolvedItems || broker.resolvedItemsSignature !== signature) {
            const inventoryItems = inventory.inventoryItems || {};
            const entries = inventoryItems && Object.keys(inventoryItems).length ? inventoryItems : null;
            const list = entries ? Object.values(entries) : null;

            broker.resolvedItems = broker.items.map((item) => {
                const explicitId = item.itemId != null ? item.itemId : (item.id != null ? item.id : null);
                let resolved = null;
                if (explicitId != null && entries) resolved = entries[explicitId] || null;
                if (!resolved && list && item.name) resolved = list.find((invItem) => invItem.name === item.name) || null;

                const itemId = resolved ? resolved.id : explicitId;
                const displayName = item.name || (resolved ? resolved.name : (itemId != null ? `#${itemId}` : 'Неизвестный предмет'));

                if (itemId == null) {
                    console.warn(`[PAWNSHOPS] Для предмета '${displayName}' не задан itemId. Укажите itemId в конфигурации скупщиков.`);
                } else if (entries && !resolved) {
                    console.warn(`[PAWNSHOPS] Предмет '${displayName}' (ID ${itemId}) не найден в inventoryItems. Проверьте, что он добавлен в базу.`);
                }

                return {
                    name: displayName,
                    price: item.price,
                    itemId: itemId != null ? itemId : null,
                    exists: Boolean(resolved),
                };
            });
            broker.resolvedItemsSignature = signature;
        }
        return broker.resolvedItems;
    },

    getCounts(player, broker) {
        const resolvedItems = this.resolveBrokerItems(broker);
        const itemsInfo = [];
        let totalCount = 0;
        let totalValue = 0;
        let nextPrice = 0;

        resolvedItems.forEach((item) => {
            let count = 0;
            if (item.itemId != null) {
                const items = inventory.getArrayByItemId(player, item.itemId);
                for (const invItem of items) {
                    const params = inventory.getParamsValues(invItem);
                    count += params.count ? parseInt(params.count) : 1;
                }
            }
            if (count > 0 && item.price > nextPrice) nextPrice = item.price;
            totalCount += count;
            totalValue += count * item.price;
            itemsInfo.push({
                name: item.name,
                price: item.price,
                count,
                resolved: item.itemId != null,
            });
        });

        return {
            id: broker.id,
            title: broker.title,
            items: itemsInfo,
            totalCount,
            totalValue,
            nextPrice,
        };
    },

    collectSaleOperations(player, broker, unitsToSell, preferExpensive) {
        const resolvedItems = this.resolveBrokerItems(broker).filter(item => item.itemId != null);
        if (!resolvedItems.length) return { operations: [], totalPrice: 0, soldCount: 0 };

        const itemsOrdered = preferExpensive
            ? [...resolvedItems].sort((a, b) => b.price - a.price)
            : resolvedItems;

        const operations = [];
        let remaining = unitsToSell === Infinity ? Infinity : unitsToSell;
        let totalPrice = 0;
        let soldCount = 0;

        for (const item of itemsOrdered) {
            if (remaining <= 0) break;
            const inventoryItems = inventory.getArrayByItemId(player, item.itemId);
            if (!inventoryItems.length) continue;

            for (const invItem of inventoryItems) {
                if (remaining <= 0) break;
                const params = inventory.getParamsValues(invItem);
                const stackCount = params.count ? parseInt(params.count) : 1;
                const toTake = remaining === Infinity ? stackCount : Math.min(stackCount, remaining);
                if (!toTake) continue;

                const leftover = stackCount - toTake;
                if (leftover > 0) {
                    operations.push({ type: 'update', item: invItem, count: leftover });
                } else {
                    operations.push({ type: 'delete', item: invItem });
                }

                totalPrice += item.price * toTake;
                soldCount += toTake;
                if (remaining !== Infinity) remaining -= toTake;
            }
        }

        return { operations, totalPrice, soldCount };
    },

    applyOperations(player, operations) {
        for (const operation of operations) {
            if (operation.type === 'delete') inventory.deleteItem(player, operation.item);
            else if (operation.type === 'update') inventory.updateParam(player, operation.item, 'count', operation.count);
        }
    },

    sellItems(player, broker, unitsToSell, preferExpensive) {
        const { operations, totalPrice, soldCount } = this.collectSaleOperations(player, broker, unitsToSell, preferExpensive);
        if (!soldCount || !operations.length || !totalPrice) return notifs.error(player, 'Нечего продавать', broker.title);

        money.addCash(player, totalPrice, (res) => {
            if (!res) return notifs.error(player, 'Ошибка начисления наличных', broker.title);
            this.applyOperations(player, operations);
            notifs.success(player, `Продано ${soldCount} шт. на $${totalPrice}`, broker.title);
            this.refreshMenu(player, broker);
        }, `Продажа у ${broker.title}`);
    },

    refreshMenu(player, broker) {
        const data = this.getCounts(player, broker);
        player.call('pawnshops.menu.show', [JSON.stringify(data)]);
    },
};
