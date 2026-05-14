"use strict";

let notifs;
let inventory;
let utils;
let animations;

const CRAFT_TYPES = {
    food: {
        title: 'Полевая кухня выживших',
        markerColor: [112, 93, 47, 105],
        labelColor: '~y~',
    }
};

const RECIPES = {
    food_skewer: {
        id: 'food_skewer',
        type: 'food',
        title: 'Шашлык',
        subtitle: 'Горячая еда вместо сухпайка',
        description: 'Редкий горячий ужин для тех, кто вернулся в разрушенный Los Santos и держится рядом с лагерями.',
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
                description: 'Сочный тестовый шашлык, приготовленный на полевой кухне.',
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

            mp.players.forEach((player) => {
                if (player.character) player.call('inventory.setItemInfo', [700, plain]);
            });
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
            player.call('crafting.enter', [true, this.getClientPayload(dbPoint.type)]);
            notifs.info(player, `${typeConfig.title}. Нажмите E, чтобы открыть крафт`, 'Black Zone Craft');
        };
        colshape.onExit = (player) => {
            if (player.craftPointId === dbPoint.id) delete player.craftPointId;
            player.call('crafting.enter', [false, this.getClientPayload(dbPoint.type)]);
            player.call('crafting.close');
        };

        const label = mp.labels.new(`${typeConfig.labelColor}${typeConfig.title}\n~c~BLACK ZONE RP\n~w~E - открыть меню`, new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z + 0.45), {
            los: false,
            font: 0,
            drawDistance: 12,
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
        const typeConfig = CRAFT_TYPES[type] || CRAFT_TYPES.food;
        return {
            type,
            title: typeConfig.title,
            subtitle: 'Грязный полевой интерфейс кухни Black Zone RP: минимум энергии, минимум припасов, максимум пользы.',
            recipes: this.getRecipesByType(type),
        };
    },

    open(player) {
        const point = this.getPlayerPoint(player);
        if (!point) return notifs.error(player, 'Вы не у точки крафта', 'Black Zone Craft');
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
        if (!point) return notifs.error(player, 'Вы отошли от точки крафта', 'Black Zone Craft');

        const recipe = RECIPES[recipeId];
        if (!recipe || recipe.type !== point.dbPoint.type) return notifs.error(player, 'Рецепт недоступен на этой точке', 'Black Zone Craft');
        if (player.craftingNow) return notifs.error(player, 'Вы уже готовите блюдо', 'Black Zone Craft');
        if (!this.hasIngredients(player, recipe)) return notifs.error(player, 'Не хватает ингредиентов', 'Black Zone Craft');

        player.craftingNow = true;
        player.call('crafting.progress', [recipe.durationMs]);
        animations.playAnimation(player, 'amb@prop_human_bbq@male@base', 'base', 8, 49);
        notifs.info(player, `Готовим ${recipe.title}: берегите припасы...`, 'Black Zone Craft');

        setTimeout(async () => {
            if (!player || !mp.players.exists(player)) return;
            delete player.craftingNow;
            animations.stopAnimation(player);

            const activePoint = this.getPlayerPoint(player);
            if (!activePoint || activePoint.dbPoint.id !== point.dbPoint.id) return notifs.error(player, 'Крафт отменён: вы отошли от кухни', 'Black Zone Craft');
            const dist = utils.vdist(player.position, new mp.Vector3(point.dbPoint.x, point.dbPoint.y, point.dbPoint.z));
            if (dist > point.dbPoint.radius + 2.5) return notifs.error(player, 'Крафт отменён: вы слишком далеко', 'Black Zone Craft');
            if (!this.hasIngredients(player, recipe)) return notifs.error(player, 'Не хватает ингредиентов', 'Black Zone Craft');
            if (!this.consumeIngredients(player, recipe)) return notifs.error(player, 'Не удалось списать ингредиенты', 'Black Zone Craft');

            await this.ensureTestFoodItem();
            inventory.addItem(player, recipe.result.itemId, { count: recipe.result.count, satiety: 85, thirst: -5 }, (err) => {
                if (err) return notifs.error(player, err, 'Black Zone Craft');
                notifs.success(player, `Вы приготовили ${recipe.result.name}`, 'Black Zone Craft');
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
