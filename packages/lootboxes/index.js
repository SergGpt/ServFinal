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
     * Таблица наград. Количество берётся случайным образом в диапазоне [min, max].
     * params будут записаны в предмет.
     */
    lootTable: [
        { itemId: 34, min: 1, max: 2, params: { count: 1 } }, // вода
        { itemId: 126, min: 0, max: 1, params: { count: 1 } }, // бургер
        { itemId: 129, min: 0, max: 3, params: { count: 1 } }, // чипсы
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
        if (crowbar) inventory.ensureHandCombatParams(crowbar, player);
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

    async rewardPlayer(player, colshape) {
        for (const loot of this.lootTable) {
            const count = this.randomInt(loot.min, loot.max);
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

    randomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (max < min) return min;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
};
