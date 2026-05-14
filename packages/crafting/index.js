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

const foodCraftRecipes = [
    {
        id: 'fried_chicken',
        name: 'Жареная курица',
        ingredients: [{ itemId: 707, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 750, count: 1 },
        craftTime: 8000,
        effect: '+40 голод',
        params: { satiety: 40, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'spicy_soup',
        name: 'Острый суп',
        ingredients: [{ itemId: 34, count: 1 }, { itemId: 710, count: 1 }, { itemId: 709, count: 1 }],
        result: { itemId: 751, count: 1 },
        craftTime: 10000,
        effect: '+35 голод, +10 жажда',
        params: { satiety: 35, thirst: 10 },
        consumableType: 'food'
    },
    {
        id: 'camp_stew',
        name: 'Лагерная похлёбка',
        ingredients: [{ itemId: 34, count: 1 }, { itemId: 701, count: 1 }, { itemId: 709, count: 1 }],
        result: { itemId: 752, count: 1 },
        craftTime: 12000,
        effect: '+55 голод',
        params: { satiety: 55, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'survivor_burger',
        name: 'Бургер выжившего',
        ingredients: [{ itemId: 705, count: 1 }, { itemId: 701, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 753, count: 1 },
        craftTime: 9000,
        effect: '+45 голод',
        params: { satiety: 45, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'double_kebab',
        name: 'Двойной шашлык',
        ingredients: [{ itemId: 701, count: 2 }, { itemId: 702, count: 1 }],
        result: { itemId: 754, count: 1 },
        craftTime: 10000,
        effect: '+65 голод',
        params: { satiety: 65, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'fish_canned',
        name: 'Рыбные консервы',
        ingredients: [{ itemId: 706, count: 1 }, { itemId: 702, count: 1 }, { itemId: 725, count: 1 }],
        result: { itemId: 755, count: 1 },
        craftTime: 12000,
        effect: '+35 голод, долго хранится',
        params: { satiety: 35, thirst: 0, longStorage: 1 },
        consumableType: 'food'
    },
    {
        id: 'army_ration',
        name: 'Армейский паёк',
        ingredients: [{ itemId: 724, count: 1 }, { itemId: 708, count: 1 }, { itemId: 725, count: 1 }],
        result: { itemId: 756, count: 1 },
        craftTime: 15000,
        effect: '+70 голод, +20 жажда',
        params: { satiety: 70, thirst: 20 },
        consumableType: 'food'
    },
    {
        id: 'dirty_burger',
        name: 'Грязный бургер',
        ingredients: [{ itemId: 705, count: 1 }, { itemId: 714, count: 1 }],
        result: { itemId: 757, count: 1 },
        craftTime: 8000,
        effect: '+45 голод, риск заражения',
        params: { satiety: 45, thirst: 0, infectionStub: 1 },
        consumableType: 'food',
        infectionStub: true
    },
    {
        id: 'trash_pizza',
        name: 'Пицца из отходов',
        ingredients: [{ itemId: 723, count: 1 }, { itemId: 708, count: 1 }, { itemId: 709, count: 1 }],
        result: { itemId: 758, count: 1 },
        craftTime: 13000,
        effect: '+50 голод',
        params: { satiety: 50, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'boiled_corn',
        name: 'Варёная кукуруза',
        ingredients: [{ itemId: 405, count: 1 }, { itemId: 34, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 759, count: 1 },
        craftTime: 7000,
        effect: '+25 голод',
        params: { satiety: 25, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'fried_potato',
        name: 'Жареная картошка',
        ingredients: [{ itemId: 401, count: 1 }, { itemId: 722, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 760, count: 1 },
        craftTime: 9000,
        effect: '+35 голод',
        params: { satiety: 35, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'mashed_potato',
        name: 'Картофельное пюре',
        ingredients: [{ itemId: 401, count: 2 }, { itemId: 34, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 761, count: 1 },
        craftTime: 10000,
        effect: '+40 голод',
        params: { satiety: 40, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'mushroom_soup',
        name: 'Грибной суп',
        ingredients: [{ itemId: 712, count: 1 }, { itemId: 34, count: 1 }, { itemId: 702, count: 1 }],
        result: { itemId: 762, count: 1 },
        craftTime: 10000,
        effect: '+35 голод, +10 жажда',
        params: { satiety: 35, thirst: 10 },
        consumableType: 'food'
    },
    {
        id: 'fried_mushrooms',
        name: 'Жареные грибы',
        ingredients: [{ itemId: 712, count: 2 }, { itemId: 702, count: 1 }],
        result: { itemId: 763, count: 1 },
        craftTime: 8000,
        effect: '+25 голод',
        params: { satiety: 25, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'black_zone_energy',
        name: 'Энергетик Black Zone',
        ingredients: [{ itemId: 717, count: 1 }, { itemId: 720, count: 1 }, { itemId: 34, count: 1 }],
        result: { itemId: 764, count: 1 },
        craftTime: 7000,
        effect: '+20 жажда, +стамина',
        params: { satiety: 0, thirst: 20, stamina: 1 },
        consumableType: 'drink'
    },
    {
        id: 'survivor_tea',
        name: 'Чай выжившего',
        ingredients: [{ itemId: 716, count: 1 }, { itemId: 34, count: 1 }, { itemId: 720, count: 1 }],
        result: { itemId: 765, count: 1 },
        craftTime: 6000,
        effect: '+20 жажда, лёгкое восстановление',
        params: { satiety: 0, thirst: 20, lightRegenStub: 1 },
        consumableType: 'drink'
    },
    {
        id: 'coffee_sugar',
        name: 'Кофе с сахаром',
        ingredients: [{ itemId: 721, count: 1 }, { itemId: 720, count: 1 }, { itemId: 34, count: 1 }],
        result: { itemId: 766, count: 1 },
        craftTime: 6000,
        effect: '+15 жажда, +стамина',
        params: { satiety: 0, thirst: 15, stamina: 1 },
        consumableType: 'drink'
    },
    {
        id: 'vegetable_ragout',
        name: 'Овощное рагу',
        ingredients: [{ itemId: 401, count: 1 }, { itemId: 403, count: 1 }, { itemId: 405, count: 1 }],
        result: { itemId: 767, count: 1 },
        craftTime: 11000,
        effect: '+45 голод',
        params: { satiety: 45, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'meat_ragout',
        name: 'Мясное рагу',
        ingredients: [{ itemId: 701, count: 1 }, { itemId: 401, count: 1 }, { itemId: 709, count: 1 }],
        result: { itemId: 768, count: 1 },
        craftTime: 13000,
        effect: '+60 голод',
        params: { satiety: 60, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'dried_meat',
        name: 'Сушёное мясо',
        ingredients: [{ itemId: 701, count: 1 }, { itemId: 718, count: 1 }],
        result: { itemId: 769, count: 1 },
        craftTime: 16000,
        effect: '+35 голод, долго хранится',
        params: { satiety: 35, thirst: 0, longStorage: 1 },
        consumableType: 'food'
    },
    {
        id: 'smoked_fish',
        name: 'Копчёная рыба',
        ingredients: [{ itemId: 706, count: 1 }, { itemId: 718, count: 1 }],
        result: { itemId: 770, count: 1 },
        craftTime: 16000,
        effect: '+35 голод, долго хранится',
        params: { satiety: 35, thirst: 0, longStorage: 1 },
        consumableType: 'food'
    },
    {
        id: 'camp_pilaf',
        name: 'Плов лагеря',
        ingredients: [{ itemId: 715, count: 1 }, { itemId: 701, count: 1 }, { itemId: 710, count: 1 }],
        result: { itemId: 771, count: 1 },
        craftTime: 14000,
        effect: '+60 голод',
        params: { satiety: 60, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'hot_noodles',
        name: 'Горячая лапша',
        ingredients: [{ itemId: 711, count: 1 }, { itemId: 34, count: 1 }, { itemId: 710, count: 1 }],
        result: { itemId: 772, count: 1 },
        craftTime: 7000,
        effect: '+30 голод, +5 жажда',
        params: { satiety: 30, thirst: 5 },
        consumableType: 'food'
    },
    {
        id: 'stewed_cabbage',
        name: 'Тушёная капуста',
        ingredients: [{ itemId: 403, count: 2 }, { itemId: 702, count: 1 }, { itemId: 722, count: 1 }],
        result: { itemId: 773, count: 1 },
        craftTime: 9000,
        effect: '+35 голод',
        params: { satiety: 35, thirst: 0 },
        consumableType: 'food'
    },
    {
        id: 'infected_zone_soup',
        name: 'Суп заражённой зоны',
        ingredients: [{ itemId: 713, count: 1 }, { itemId: 714, count: 1 }, { itemId: 703, count: 1 }],
        result: { itemId: 774, count: 1 },
        craftTime: 15000,
        effect: '+70 голод, риск заражения/мутации',
        params: { satiety: 70, thirst: 0, infectionStub: 1, mutationStub: 1 },
        consumableType: 'food',
        infectionStub: true
    }
];

const LEGACY_TEST_RECIPE = {
    id: 'food_skewer',
    name: 'Шашлык',
    ingredients: [{ itemId: 126, count: 1 }, { itemId: 127, count: 1 }],
    result: { itemId: 700, count: 1 },
    craftTime: 4500,
    effect: '+85 голод, -5 жажда',
    params: { satiety: 85, thirst: -5 },
    consumableType: 'food'
};

const RECIPES = [LEGACY_TEST_RECIPE, ...foodCraftRecipes].map((recipe) => ({
    ...recipe,
    type: 'food',
    title: recipe.name,
    durationMs: recipe.craftTime,
    description: recipe.effect,
    result: {
        ...recipe.result,
        name: recipe.name,
    },
}));

module.exports = {
    points: [],

    async init() {
        notifs = call('notifications');
        inventory = call('inventory');
        utils = call('utils');
        animations = call('animations');

        await this.ensureCraftItems();
        await this.loadFromDB();
        inited(__dirname);
    },

    getRecipeById(recipeId) {
        return RECIPES.find((recipe) => recipe.id === recipeId);
    },

    getItemName(itemId, fallback = null) {
        if (!inventory || !inventory.inventoryItems || !inventory.inventoryItems[itemId]) return fallback || `Предмет #${itemId}`;
        return inventory.getName(itemId);
    },

    buildResultItemDefaults(recipe) {
        const isDrink = recipe.consumableType === 'drink';
        return {
            id: recipe.result.itemId,
            name: recipe.name,
            description: `${recipe.effect}. Приготовлено на полевой кухне Black Zone.`,
            height: 1,
            width: 1,
            weight: isDrink ? 0.45 : 0.6,
            chance: 50,
            model: isDrink ? 'prop_ld_flow_bottle' : 'prop_cs_steak',
            deltaZ: 0,
            rX: 0,
            rY: 0,
            attachInfo: {
                bone: 28422,
                pos: [0.08, 0.02, -0.02],
                rot: [80, 20, 10],
                anim: 0
            }
        };
    },

    async ensureCraftItems() {
        if (!db.Models.InventoryItem) return;

        for (const recipe of RECIPES) {
            const [item] = await db.Models.InventoryItem.findOrCreate({
                where: { id: recipe.result.itemId },
                defaults: this.buildResultItemDefaults(recipe)
            });

            const plain = item.get({ plain: true });
            if (typeof plain.attachInfo === 'string') plain.attachInfo = JSON.parse(plain.attachInfo);
            if (inventory && inventory.inventoryItems) {
                inventory.inventoryItems[recipe.result.itemId] = plain;
                inventory.clientInventoryItems[recipe.result.itemId] = plain;

                mp.players.forEach((player) => {
                    if (player.character) player.call('inventory.setItemInfo', [recipe.result.itemId, plain]);
                });
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
        return RECIPES.filter((recipe) => recipe.type === type);
    },

    getClientRecipe(recipe) {
        return {
            id: recipe.id,
            type: recipe.type,
            title: recipe.title,
            name: recipe.name,
            description: recipe.description,
            effect: recipe.effect,
            craftTime: recipe.craftTime,
            durationMs: recipe.durationMs,
            consumableType: recipe.consumableType,
            infectionStub: !!recipe.infectionStub,
            ingredients: recipe.ingredients.map((ingredient) => ({
                ...ingredient,
                name: this.getItemName(ingredient.itemId)
            })),
            result: {
                ...recipe.result,
                name: this.getItemName(recipe.result.itemId, recipe.name)
            }
        };
    },

    getResultParams(recipe) {
        return {
            count: recipe.result.count,
            satiety: recipe.params.satiety || 0,
            thirst: recipe.params.thirst || 0,
            stamina: recipe.params.stamina || 0,
            longStorage: recipe.params.longStorage || 0,
            infectionStub: recipe.params.infectionStub || 0,
            mutationStub: recipe.params.mutationStub || 0,
            lightRegenStub: recipe.params.lightRegenStub || 0,
            consumableType: recipe.consumableType,
            craftEffect: recipe.effect,
        };
    },

    getClientPayload(type) {
        const typeConfig = CRAFT_TYPES[type] || CRAFT_TYPES.food;
        return {
            type,
            title: typeConfig.title,
            subtitle: 'Грязный полевой интерфейс кухни Black Zone RP: минимум энергии, минимум припасов, максимум пользы.',
            recipes: this.getRecipesByType(type).map((recipe) => this.getClientRecipe(recipe)),
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

        const recipe = this.getRecipeById(recipeId);
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

            await this.ensureCraftItems();
            inventory.addItem(player, recipe.result.itemId, this.getResultParams(recipe), (err) => {
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
