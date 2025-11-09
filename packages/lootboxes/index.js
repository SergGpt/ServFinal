"use strict";

const inventory = call('inventory');
const notifications = call('notifications');
const timer = call('timer');

module.exports = {
    /**
     * Тип объекта в таблице world_objects, который обрабатывает система ящиков.
     * Администратор добавляет ящики через /worldadd с типом 67.
     */
    crateWorldType: 67,

    /**
     * Количество очков прочности ящика.
     */
    crateMaxHealth: 100,

    /**
     * Сколько урона наносится ящику за один удар монтировкой.
     */
    crowbarDamage: 20,

    /**
     * На сколько уменьшается прочность монтировки при каждом ударе.
     */
    crowbarWear: 0.5,

    /**
     * Как долго ящик восстанавливается после полного уничтожения (мс).
     */
    respawnTime: 30 * 60 * 1000,

    /**
     * ID предмета монтировки в БД инвентаря. В БД должен появиться предмет с таким ID.
     */
    crowbarItemId: 67,

    /**
     * Сколько предметов выпадет (рандомно в диапазоне) при вскрытии ящика.
     */
    lootRollsMin: 1,
    lootRollsMax: 2,

    /**
     * Пул лута (вместо старого lootTable). weight — относительная вероятность дропа.
     * min/max — количество предметов за один ролл.
     */
    lootPool: [
        // БАЗОВЫЕ РАСХОДНИКИ
        { itemId: 34,  weight: 20, min: 1, max: 2, params: { count: 1 } }, // вода
        { itemId: 126, weight: 14, min: 0, max: 1, params: { count: 1 } }, // бургер
        { itemId: 129, weight: 18, min: 0, max: 3, params: { count: 1 } }, // чипсы

        // СКУПЩИЦКИЕ ПРЕДМЕТЫ (205–214)
        { itemId: 205, weight: 8,  min: 1, max: 1 }, // Золотая цепь
        { itemId: 206, weight: 6,  min: 1, max: 1 }, // Золотые часы
        { itemId: 207, weight: 9,  min: 1, max: 1 }, // Золотое кольцо
        { itemId: 208, weight: 5,  min: 1, max: 1 }, // Картина
        { itemId: 209, weight: 11, min: 1, max: 2 }, // Инструмент
        { itemId: 210, weight: 7,  min: 1, max: 1 }, // Старый паспорт
        { itemId: 211, weight: 10, min: 1, max: 2 }, // Старое фото
        { itemId: 212, weight: 12, min: 1, max: 1 }, // Разбитый телефон
        { itemId: 213, weight: 7,  min: 1, max: 1 }, // Сломанный фотоаппарат
        { itemId: 214, weight: 7,  min: 1, max: 1 }, // Сломанный планшет

        // ДОПОЛНИТЕЛЬНЫЕ ПРЕДМЕТЫ (215–250)
        { itemId: 215, weight: 9,  min: 1, max: 1 }, // Серебряная цепочка
        { itemId: 216, weight: 9,  min: 1, max: 1 }, // Серебряное кольцо
        { itemId: 217, weight: 5,  min: 1, max: 1 }, // Золотая зажигалка
        { itemId: 218, weight: 10, min: 1, max: 1 }, // Браслет
        { itemId: 219, weight: 6,  min: 1, max: 2 }, // Старинная монета
        { itemId: 220, weight: 10, min: 1, max: 1 }, // Пепельница
        { itemId: 221, weight: 8,  min: 1, max: 1 }, // Старый будильник
        { itemId: 222, weight: 10, min: 1, max: 1 }, // Фонарик
        { itemId: 223, weight: 4,  min: 1, max: 1 }, // Старый радиоприёмник
        { itemId: 224, weight: 5,  min: 1, max: 1 }, // Видеокамера
        { itemId: 225, weight: 9,  min: 1, max: 2 }, // Музыкальная пластинка
        { itemId: 226, weight: 12, min: 1, max: 2 }, // Старая книга
        { itemId: 227, weight: 11, min: 1, max: 3 }, // Дискета
        { itemId: 228, weight: 4,  min: 1, max: 1 }, // Игровая приставка
        { itemId: 229, weight: 3,  min: 1, max: 1 }, // Камера наблюдения
        { itemId: 230, weight: 2,  min: 1, max: 1 }, // Старый телевизор
        { itemId: 231, weight: 5,  min: 1, max: 1 }, // Старый ноутбук
        { itemId: 232, weight: 10, min: 1, max: 1 }, // Кастрюля
        { itemId: 233, weight: 6,  min: 1, max: 1 }, // Кофеварка
        { itemId: 234, weight: 8,  min: 1, max: 2 }, // Металлический лом
        { itemId: 235, weight: 14, min: 1, max: 3 }, // Жестяная банка
        { itemId: 236, weight: 6,  min: 1, max: 1 }, // Бита
        { itemId: 237, weight: 12, min: 1, max: 1 }, // Пустой кошелёк
        { itemId: 238, weight: 6,  min: 1, max: 1 }, // Старый чемодан
        { itemId: 239, weight: 6,  min: 1, max: 1 }, // Старый фотоаппарат
        { itemId: 240, weight: 12, min: 1, max: 1 }, // Старые очки
        { itemId: 241, weight: 13, min: 1, max: 2 }, // Брелок
        { itemId: 242, weight: 10, min: 1, max: 1 }, // Кулон
        { itemId: 243, weight: 15, min: 1, max: 1 }, // Пачка сигарет
        { itemId: 244, weight: 9,  min: 1, max: 1 }, // Ключи от старой машины
        { itemId: 245, weight: 12, min: 1, max: 2 }, // Пластмассовая игрушка
        { itemId: 246, weight: 10, min: 1, max: 1 }, // Бутылка вина (пустая)
        { itemId: 247, weight: 14, min: 1, max: 2 }, // Кусок ткани
        { itemId: 248, weight: 10, min: 1, max: 1 }, // Пустая коробка
        { itemId: 249, weight: 8,  min: 1, max: 1 }, // Банка краски
        { itemId: 250, weight: 7,  min: 1, max: 1 }, // Старый мобильник
    ],

    init() {
        console.log('[Lootboxes] Система ящиков инициализирована');
    },

    onPlayerEnter(player, colshape) {
        if (!player || !player.character) return;

        if (typeof colshape.health !== 'number') colshape.health = this.crateMaxHealth;
        else colshape.health = Math.min(colshape.health, this.crateMaxHealth);

        player.lootCrate = colshape;
        player.call('lootboxes.crate.inside', [colshape.db.pos, colshape.health]);
    },

    onPlayerExit(player, colshape) {
        if (!player || player.lootCrate !== colshape) return;

        delete player.lootCrate;
        player.call('lootboxes.crate.inside');
    },

    async hitCrate(player) {
        const header = 'Лутбоксы';
        const outError = (text) => notifications.error(player, text, header);

        if (!player || !player.character) return outError('Ошибка игрока');

        const colshape = player.lootCrate;
        if (!colshape || !colshape.db || colshape.db.type !== this.crateWorldType) {
            return outError('Вы не у ящика');
        }

        if (colshape.health <= 0) {
            return outError('Ящик уже вскрыт');
        }

        const crowbar = inventory.getHandsItem(player);
        if (!this.isCrowbar(player, crowbar)) {
            return outError('Возьмите в руки монтировку');
        }

        const ensureParam = (key, value) => inventory.updateParam(player, crowbar, key, value);
        let rearmed = false;

        const weaponParam = inventory.getParam(crowbar, 'weaponHash');
        if (!weaponParam) {
            ensureParam('weaponHash', mp.joaat('weapon_crowbar'));
            rearmed = true;
        }

        const modelParam = inventory.getParam(crowbar, 'model');
        if (!modelParam) ensureParam('model', 'weapon_crowbar');

        let crowbarHealth = inventory.getParam(crowbar, 'health');
        if (!crowbarHealth) crowbarHealth = ensureParam('health', 100);

        if (rearmed) inventory.syncHandsItem(player, crowbar);

        if (crowbarHealth && crowbarHealth.value <= 0) {
            return outError('Монтировка сломана');
        }

        if (crowbarHealth) {
            const nextHealth = Math.max(0, Math.min(100, crowbarHealth.value - this.crowbarWear));
            inventory.updateParam(player, crowbar, 'health', nextHealth);
        }

        const damageBoost = this.getDamageBoost(player.inventory?.items || []);
        const damage = Math.max(1, Math.floor(this.crowbarDamage * damageBoost));
        colshape.health = Math.max(0, colshape.health - damage);

        this.syncHealth(colshape);

        if (colshape.health <= 0) {
            await this.rewardPlayer(player, colshape);
            colshape.destroyTime = Date.now();
            if (colshape.respawnTimer) timer.remove(colshape.respawnTimer);
            colshape.respawnTimer = timer.add(() => this.respawn(colshape), this.respawnTime);
            notifications.success(player, 'Вы вскрыли ящик', header);
        }
    },

    respawn(colshape) {
        if (!colshape) return;

        colshape.health = this.crateMaxHealth;
        delete colshape.destroyTime;
        delete colshape.respawnTimer;
        this.syncHealth(colshape);
    },

    syncHealth(colshape) {
        if (!colshape || !colshape.db) return;

        const pos = colshape.db.pos;
        mp.players.forEachInRange(pos, colshape.db.radius || 5, (rec) => {
            if (!rec.character) return;
            rec.call('lootboxes.crate.health', [colshape.health]);
        });
    },

    /**
     * Выдача наград: делаем 1–2 ролла из пула по весам.
     */
    async rewardPlayer(player, colshape) {
        const rolls = this.randomInt(this.lootRollsMin, this.lootRollsMax);

        for (let i = 0; i < rolls; i++) {
            const loot = this.pickWeighted(this.lootPool);
            if (!loot) continue;

            const count = this.randomInt(loot.min || 1, loot.max || 1);
            if (count <= 0) continue;

            const params = Object.assign({}, loot.params || {});
            if (count > 1) params.count = count;

            const error = await this.tryGiveItem(player, loot.itemId, params);
            if (error) {
                notifications.error(player, `${error}. Предмет оставлен на земле`, 'Инвентарь');
                const dropPos = Object.assign({}, colshape.db.pos);
                dropPos.z -= 0.7;
                await inventory.addGroundItem(loot.itemId, params, dropPos);
            } else {
                notifications.success(player, `Получен ${this.getItemName(loot.itemId, params)}`, 'Инвентарь');
            }
        }
    },

    async tryGiveItem(player, itemId, params) {
        let errorMessage = null;
        await inventory.addItem(player, itemId, params, (error) => {
            if (error) errorMessage = error;
        });
        return errorMessage;
    },

    getItemName(itemId, params) {
        const info = inventory.getInventoryItem(itemId);
        if (!info) return `предмет #${itemId}`;
        const count = params?.count || 1;
        return count > 1 ? `${info.name} x${count}` : info.name;
    },

    isCrowbar(player, item) {
        if (!item) return false;
        if (item.itemId === this.crowbarItemId) return true;

        const weaponHash = inventory.getParam(item, 'weaponHash');
        if (weaponHash && weaponHash.value === mp.joaat('weapon_crowbar')) return true;

        const handsVar = player.getVariable('hands');
        if (handsVar === this.crowbarItemId) return true;

        const currentWeapon = typeof player.weapon === 'number' ? player.weapon : parseInt(player.weapon || 0);
        if (currentWeapon === mp.joaat('weapon_crowbar')) return true;

        return false;
    },

    getDamageBoost(items) {
        if (!inventory?.getItemsByParams) return 1;
        const boosters = inventory.getItemsByParams(items, null, 'crateDamage', null).filter(x => !x.parentId);
        if (!boosters.length) return 1;
        const boost = boosters.reduce((acc, item) => {
            const value = inventory.getParam(item, 'crateDamage');
            return acc + (value?.value || 0);
        }, 0);
        return 1 + boost / 100;
    },

    /**
     * Выбор одного элемента из массива по весам.
     */
    pickWeighted(list) {
        if (!Array.isArray(list) || !list.length) return null;
        const total = list.reduce((acc, x) => acc + (x.weight > 0 ? x.weight : 0), 0);
        if (total <= 0) return null;
        let r = Math.random() * total;
        for (const el of list) {
            const w = el.weight > 0 ? el.weight : 0;
            if (r < w) return el;
            r -= w;
        }
        return list[list.length - 1];
    },

    randomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (max < min) return min;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
};
