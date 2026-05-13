"use strict";

let notifs;
let inventory;
let utils;
let animations;

const CRAFT_TYPES = {
    food: {
        title: 'Кулинарный стол',
        markerColor: [255, 153, 59, 125],
        labelColor: '~o~',
    }
};

const RECIPES = {
    food_skewer: {
        id: 'food_skewer',
        type: 'food',
        title: 'Шашлык',
        subtitle: 'Тестовый крафт еды',
        description: 'Соберите горячий шашлык из двух ингредиентов прямо на кулинарном столе.',
        durationMs: 4500,
        result: { itemId: 700, count: 1, name: 'Шашлык' },
        ingredients: [
            { itemId: 126, count: 1, name: 'Гамбургер' },
            { itemId: 127, count: 1, name: 'Хотдог' },
        ],
    },
};

module.exports = {
    points: [],

    async init() {
        notifs = call('notifications');
        inventory = call('inventory');
        utils = call('utils');
        animations = call('animations');

        await this.ensureTestFoodItem();
        await this.loadFromDB();
        inited(__dirname);
    },

    async ensureTestFoodItem() {
        if (!db.Models.InventoryItem) return;

        const [item] = await db.Models.InventoryItem.findOrCreate({
            where: { id: 700 },
            defaults: {
                id: 700,
                name: 'Шашлык',
                description: 'Сочный тестовый шашлык, приготовленный на крафтовом столе.',
                height: 1,
                width: 1,
                weight: 0.6,
                chance: 50,
                model: 'prop_cs_steak',
                deltaZ: 0,
                rX: 0,
                rY: 0,
                attachInfo: {
                    bone: 28422,
                    pos: [0.08, 0.02, -0.02],
                    rot: [80, 20, 10],
                    anim: 0
                }
            }
        });

        const plain = item.get({ plain: true });
        if (typeof plain.attachInfo === 'string') plain.attachInfo = JSON.parse(plain.attachInfo);
        if (inventory && inventory.inventoryItems) {
            inventory.inventoryItems[700] = plain;
            inventory.clientInventoryItems[700] = plain;

            try {
                mp.players.forEach((player) => {
                    if (player.character) player.call('inventory.setItemInfo', [700, plain]);
                });
            } catch (e) {
                console.error('[CRAFTING] Не удалось обновить info предмета #700 у игроков:', e);
            }
        }
    },

    async loadFromDB() {
        const rows = await db.Models.CraftPoint.findAll({ order: ['id'] });
        rows.forEach((row) => this.createPointRuntime(row));
        console.log(`[CRAFTING] Загружено ${rows.length} точек крафта`);
    },

    createPointRuntime(dbPoint) {
        const typeConfig = CRAFT_TYPES[dbPoint.type] || CRAFT_TYPES.food;
        const pos = new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z - 1);
        const marker = mp.markers.new(1, pos, 0.9, {
            color: typeConfig.markerColor,
            dimension: dbPoint.d
        });

        const colshape = mp.colshapes.newSphere(dbPoint.x, dbPoint.y, dbPoint.z, dbPoint.radius, dbPoint.d);
        colshape.onEnter = (player) => {
            if (!player || !player.character) return;
            player.craftPointId = dbPoint.id;
            player.call('crafting.enter', [true, dbPoint.type]);
            notifs.info(player, `${typeConfig.title}. Нажмите E, чтобы открыть крафт`, 'Крафт');
        };
        colshape.onExit = (player) => {
            if (player.craftPointId === dbPoint.id) delete player.craftPointId;
            player.call('crafting.enter', [false, dbPoint.type]);
            player.call('crafting.close');
        };

        const label = mp.labels.new(`${typeConfig.labelColor}${typeConfig.title}\n~w~E - открыть крафт`, new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z + 0.45), {
            los: false,
            font: 0,
            drawDistance: 10,
            dimension: dbPoint.d
        });

        this.points.push({ dbPoint, marker, colshape, label });
    },

    destroyPointRuntime(id) {
        const index = this.points.findIndex((point) => point.dbPoint.id === id);
        if (index === -1) return;
        const point = this.points[index];
        point.marker.destroy();
        point.colshape.destroy();
        point.label.destroy();
        this.points.splice(index, 1);
    },

    getPointById(id) {
        return this.points.find((point) => point.dbPoint.id === id);
    },

    getPlayerPoint(player) {
        if (!player.craftPointId) return null;
        return this.getPointById(player.craftPointId);
    },

    getRecipesByType(type) {
        return Object.values(RECIPES).filter((recipe) => recipe.type === type);
    },

    getClientPayload(type) {
        return {
            type,
            title: (CRAFT_TYPES[type] || CRAFT_TYPES.food).title,
            recipes: this.getRecipesByType(type),
        };
    },

    open(player) {
        const point = this.getPlayerPoint(player);
        if (!point) return notifs.error(player, 'Вы не у точки крафта', 'Крафт');
        player.call('crafting.open', [this.getClientPayload(point.dbPoint.type)]);
    },

    hasIngredients(player, recipe) {
        return recipe.ingredients.every((ingredient) => {
            const total = inventory.getArrayByItemId(player, ingredient.itemId).reduce((sum, item) => {
                const params = inventory.getParamsValues(item);
                return sum + (parseInt(params.count) || 1);
            }, 0);
            return total >= ingredient.count;
        });
    },

    consumeItem(player, item, amount) {
        const params = inventory.getParamsValues(item);
        const currentCount = parseInt(params.count) || 1;
        if (currentCount > amount) {
            inventory.updateParam(player, item, 'count', currentCount - amount);
            return 0;
        }

        inventory.deleteItem(player, item);
        return amount - currentCount;
    },

    consumeIngredients(player, recipe) {
        for (const ingredient of recipe.ingredients) {
            let left = ingredient.count;
            const items = inventory.getArrayByItemId(player, ingredient.itemId).slice();
            for (const item of items) {
                if (left <= 0) break;
                left = this.consumeItem(player, item, left);
            }
            if (left > 0) return false;
        }
        return true;
    },

    async craft(player, recipeId) {
        const point = this.getPlayerPoint(player);
        if (!point) return notifs.error(player, 'Вы отошли от точки крафта', 'Крафт');

        const recipe = RECIPES[recipeId];
        if (!recipe || recipe.type !== point.dbPoint.type) return notifs.error(player, 'Рецепт недоступен на этой точке', 'Крафт');
        if (player.craftingNow) return notifs.error(player, 'Вы уже готовите блюдо', 'Крафт');
        if (!this.hasIngredients(player, recipe)) return notifs.error(player, 'Не хватает ингредиентов', 'Крафт');

        player.craftingNow = true;
        player.call('crafting.progress', [recipe.durationMs]);
        animations.playAnimation(player, 'amb@prop_human_bbq@male@base', 'base', 8, 49);
        notifs.info(player, `Готовим ${recipe.title}...`, 'Крафт');

        setTimeout(async () => {
            if (!player || !mp.players.exists(player)) return;
            delete player.craftingNow;
            animations.stopAnimation(player);

            const activePoint = this.getPlayerPoint(player);
            if (!activePoint || activePoint.dbPoint.id !== point.dbPoint.id) return notifs.error(player, 'Крафт отменён: вы отошли от стола', 'Крафт');
            const dist = utils.vdist(player.position, new mp.Vector3(point.dbPoint.x, point.dbPoint.y, point.dbPoint.z));
            if (dist > point.dbPoint.radius + 2.5) return notifs.error(player, 'Крафт отменён: вы слишком далеко', 'Крафт');
            if (!this.hasIngredients(player, recipe)) return notifs.error(player, 'Не хватает ингредиентов', 'Крафт');
            if (!this.consumeIngredients(player, recipe)) return notifs.error(player, 'Не удалось списать ингредиенты', 'Крафт');

            await this.ensureTestFoodItem();
            inventory.addItem(player, recipe.result.itemId, { count: recipe.result.count, satiety: 85, thirst: -5 }, (err) => {
                if (err) return notifs.error(player, err, 'Крафт');
                notifs.success(player, `Вы приготовили ${recipe.result.name}`, 'Крафт');
                player.call('crafting.done', [recipe.id]);
            });
        }, recipe.durationMs);
    },

    async createPoint(player, type = 'food', radius = 2.0) {
        if (!CRAFT_TYPES[type]) type = 'food';
        const dbPoint = await db.Models.CraftPoint.create({
            type,
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            d: player.dimension,
            radius: Math.clamp(radius, 1, 6),
        });

        this.createPointRuntime(dbPoint);
        return dbPoint;
    },

    async deletePoint(id) {
        const point = this.getPointById(id);
        if (!point) return false;
        await point.dbPoint.destroy();
        this.destroyPointRuntime(id);
        return true;
    },
};
