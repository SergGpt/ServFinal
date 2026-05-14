"use strict";

let notifs;
let inventory;
let utils;
let animations;

const FOOD_CRAFT_TYPE = 'food';
const DEFAULT_VARIANT = 'survivor_camp';

const CRAFT_TYPES = {
    [FOOD_CRAFT_TYPE]: {
        title: 'Полевая кухня выживших',
        markerColor: [112, 93, 47, 105],
        labelColor: '~y~',
    }
};

const KITCHEN_VARIANTS = {
    survivor_camp: {
        title: 'Лагерь выживших',
        subtitle: 'Самодельная кухня из мусора, старой техники и армейских ящиков',
        label: 'Кухня выживших',
        light: [255, 178, 82],
        propSet: [
            { model: 'prop_rub_table_02', offset: [0.0, 0.0, -0.95], rot: [0, 0, 0] },
            { model: 'prop_cs_board_01', offset: [0.05, 0.02, -0.08], rot: [0, 0, 12] },
            { model: 'prop_w_me_knife_01', offset: [0.34, -0.08, -0.02], rot: [0, 0, 74] },
            { model: 'prop_kitch_pot_fry', offset: [-0.34, 0.1, -0.04], rot: [0, 0, -24] },
            { model: 'prop_ld_can_01', offset: [0.42, 0.18, -0.05], rot: [0, 0, 0] },
            { model: 'prop_gascyl_01a', offset: [-0.65, -0.58, -0.94], rot: [0, 0, -12] },
            { model: 'prop_box_wood05a', offset: [0.82, -0.52, -0.94], rot: [0, 0, 18] },
            { model: 'prop_ld_jerrycan_01', offset: [1.05, 0.22, -0.92], rot: [0, 0, 38] },
            { model: 'prop_rub_binbag_01', offset: [-1.0, 0.64, -0.96], rot: [0, 0, -8] },
            { model: 'prop_barrel_02b', offset: [-1.35, -0.38, -0.92], rot: [0, 0, 0] },
            { model: 'prop_worklight_03b', offset: [0.0, -1.35, -0.96], rot: [0, 0, 180] },
            { model: 'prop_generator_01a', offset: [1.42, 0.56, -0.95], rot: [0, 0, -35] },
            { model: 'prop_fridge_01', offset: [-1.72, 0.82, -0.96], rot: [0, 0, 92] },
            { model: 'prop_mil_crate_01', offset: [1.42, -0.76, -0.95], rot: [0, 0, 20] },
            { model: 'prop_sacktruck_02b', offset: [-1.74, -0.86, -0.96], rot: [0, 0, -66] },
        ],
    },
    military_field: {
        title: 'Военная полевая кухня',
        subtitle: 'Блокпостовая кухня на генераторе, с контейнерами снабжения и пайками',
        label: 'Полевая кухня',
        light: [218, 196, 116],
        propSet: [
            { model: 'prop_tool_bench02', offset: [0.0, 0.0, -0.95], rot: [0, 0, 0] },
            { model: 'prop_cs_board_01', offset: [-0.08, 0.0, -0.04], rot: [0, 0, -10] },
            { model: 'prop_w_me_knife_01', offset: [0.24, 0.16, 0.0], rot: [0, 0, 82] },
            { model: 'prop_pot_05', offset: [-0.36, -0.02, 0.02], rot: [0, 0, 18] },
            { model: 'prop_food_bs_bag_01', offset: [0.48, -0.12, 0.0], rot: [0, 0, 0] },
            { model: 'prop_mil_crate_02', offset: [0.78, -0.72, -0.95], rot: [0, 0, 14] },
            { model: 'prop_mil_crate_01', offset: [1.18, -0.7, -0.64], rot: [0, 0, 24] },
            { model: 'prop_ld_jerrycan_01', offset: [-1.02, -0.72, -0.94], rot: [0, 0, -38] },
            { model: 'prop_generator_01a', offset: [1.5, 0.5, -0.95], rot: [0, 0, -28] },
            { model: 'prop_worklight_02a', offset: [-1.26, 0.54, -0.96], rot: [0, 0, 125] },
            { model: 'prop_barrel_02b', offset: [-1.58, -0.5, -0.94], rot: [0, 0, 0] },
            { model: 'prop_gascyl_02a', offset: [-0.64, 0.7, -0.92], rot: [0, 0, 12] },
            { model: 'prop_fridge_03', offset: [1.72, -0.18, -0.96], rot: [0, 0, -86] },
            { model: 'prop_ld_health_pack', offset: [-0.56, 0.22, -0.02], rot: [0, 0, 0] },
        ],
    },
    raider_kitchen: {
        title: 'Кухня рейдеров',
        subtitle: 'Грязное место у бочки с огнём: ящики, мешки, мусор и опасные припасы',
        label: 'Рейдерская кухня',
        light: [255, 118, 47],
        propSet: [
            { model: 'prop_rub_table_01', offset: [0.0, 0.0, -0.95], rot: [0, 0, -4] },
            { model: 'prop_cs_board_01', offset: [0.05, -0.02, -0.08], rot: [0, 0, 20] },
            { model: 'prop_w_me_knife_01', offset: [0.38, 0.06, -0.02], rot: [0, 0, -40] },
            { model: 'prop_pan_01', offset: [-0.32, 0.12, -0.04], rot: [0, 0, -35] },
            { model: 'prop_cs_tin_01', offset: [0.5, -0.14, -0.04], rot: [0, 0, 0] },
            { model: 'prop_barrel_02b', offset: [-1.22, -0.2, -0.94], rot: [0, 0, 0] },
            { model: 'prop_rub_binbag_03', offset: [-1.42, 0.52, -0.96], rot: [0, 0, -22] },
            { model: 'prop_rub_trolley01a', offset: [1.35, 0.5, -0.95], rot: [0, 0, -42] },
            { model: 'prop_boxpile_07d', offset: [1.14, -0.62, -0.95], rot: [0, 0, 19] },
            { model: 'prop_gascyl_01a', offset: [-0.74, -0.74, -0.94], rot: [0, 0, -18] },
            { model: 'prop_worklight_03b', offset: [0.28, -1.24, -0.96], rot: [0, 0, 200] },
            { model: 'prop_generator_01a', offset: [1.72, -0.08, -0.95], rot: [0, 0, -82] },
            { model: 'prop_fridge_01', offset: [-1.78, 0.86, -0.96], rot: [0, 0, 96] },
            { model: 'prop_ld_binbag_01', offset: [0.88, 0.86, -0.96], rot: [0, 0, 12] },
        ],
    },
    basement: {
        title: 'Подпольная кухня в подвале',
        subtitle: 'Старый холодильник, тусклая лампа, генератор и припасы для карантинной зоны',
        label: 'Подпольная кухня',
        light: [184, 161, 92],
        propSet: [
            { model: 'prop_table_03', offset: [0.0, 0.0, -0.95], rot: [0, 0, 0] },
            { model: 'prop_cs_board_01', offset: [0.02, -0.02, -0.04], rot: [0, 0, -15] },
            { model: 'prop_w_me_knife_01', offset: [0.34, 0.04, 0.0], rot: [0, 0, 66] },
            { model: 'prop_kitch_pot_lrg', offset: [-0.34, 0.1, 0.02], rot: [0, 0, 5] },
            { model: 'prop_cs_kettle_01', offset: [0.42, -0.14, 0.0], rot: [0, 0, -18] },
            { model: 'prop_cs_tin_01', offset: [0.54, 0.16, 0.0], rot: [0, 0, 0] },
            { model: 'prop_fridge_03', offset: [-1.36, 0.78, -0.96], rot: [0, 0, 92] },
            { model: 'prop_generator_01a', offset: [1.34, 0.6, -0.95], rot: [0, 0, -42] },
            { model: 'prop_worklight_02a', offset: [-1.06, -0.86, -0.96], rot: [0, 0, 28] },
            { model: 'prop_box_wood05a', offset: [1.08, -0.7, -0.95], rot: [0, 0, 18] },
            { model: 'prop_ld_jerrycan_01', offset: [0.78, 0.86, -0.94], rot: [0, 0, -18] },
            { model: 'prop_rub_binbag_01', offset: [-1.46, -0.42, -0.96], rot: [0, 0, 36] },
            { model: 'prop_med_bag_01', offset: [-0.56, -0.16, 0.0], rot: [0, 0, 0] },
        ],
    },
};

const RECIPES = {
    food_skewer: {
        id: 'food_skewer',
        type: FOOD_CRAFT_TYPE,
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

function rotateOffset(origin, offset, heading) {
    const rad = (heading || 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return new mp.Vector3(
        origin.x + offset[0] * cos - offset[1] * sin,
        origin.y + offset[0] * sin + offset[1] * cos,
        origin.z + offset[2]
    );
}

function normalizeVariant(variant) {
    return KITCHEN_VARIANTS[variant] ? variant : DEFAULT_VARIANT;
}

module.exports = {
    points: [],

    async init() {
        notifs = call('notifications');
        inventory = call('inventory');
        utils = call('utils');
        animations = call('animations');

        await this.ensureTestFoodItem();
        await this.ensureCraftPointSchema();
        await this.loadFromDB();
        inited(__dirname);
    },

    getAvailableVariants() {
        return Object.keys(KITCHEN_VARIANTS);
    },

    getVariantConfig(variant) {
        return KITCHEN_VARIANTS[normalizeVariant(variant)];
    },


    async ensureCraftPointSchema() {
        if (!db.sequelize || !db.Models.CraftPoint) return;

        const tableName = db.Models.CraftPoint.getTableName();
        const queryInterface = db.sequelize.getQueryInterface();
        try {
            const table = await queryInterface.describeTable(tableName);
            if (!table.variant) {
                await queryInterface.addColumn(tableName, 'variant', {
                    type: db.Sequelize ? db.Sequelize.STRING(32) : require('sequelize').STRING(32),
                    allowNull: false,
                    defaultValue: DEFAULT_VARIANT
                });
            }
            if (!table.h) {
                await queryInterface.addColumn(tableName, 'h', {
                    type: db.Sequelize ? db.Sequelize.FLOAT : require('sequelize').FLOAT,
                    allowNull: false,
                    defaultValue: 0
                });
            }
        } catch (e) {
            console.error('[CRAFTING] Не удалось проверить схему CraftPoint:', e);
        }
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

    createKitchenObjects(dbPoint, variantConfig) {
        const heading = parseFloat(dbPoint.h) || 0;
        const origin = new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z);

        return variantConfig.propSet.map((prop) => {
            try {
                const position = rotateOffset(origin, prop.offset, heading);
                const rotation = new mp.Vector3(prop.rot[0], prop.rot[1], heading + prop.rot[2]);
                return mp.objects.new(mp.joaat(prop.model), position, {
                    rotation,
                    dimension: dbPoint.d
                });
            } catch (e) {
                console.error(`[CRAFTING] Не удалось создать prop ${prop.model}:`, e);
                return null;
            }
        }).filter(Boolean);
    },

    createPointRuntime(dbPoint) {
        dbPoint.variant = normalizeVariant(dbPoint.variant);
        const typeConfig = CRAFT_TYPES[dbPoint.type] || CRAFT_TYPES[FOOD_CRAFT_TYPE];
        const variantConfig = this.getVariantConfig(dbPoint.variant);
        const pos = new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z - 1);
        const marker = mp.markers.new(1, pos, 0.9, {
            color: typeConfig.markerColor,
            dimension: dbPoint.d
        });

        const objects = this.createKitchenObjects(dbPoint, variantConfig);
        const colshape = mp.colshapes.newSphere(dbPoint.x, dbPoint.y, dbPoint.z, dbPoint.radius, dbPoint.d);
        colshape.onEnter = (player) => {
            if (!player || !player.character) return;
            player.craftPointId = dbPoint.id;
            player.call('crafting.enter', [true, this.getClientPointPayload(dbPoint)]);
            player.call('crafting.atmosphere.start', [this.getAtmospherePayload(dbPoint)]);
            notifs.info(player, `${variantConfig.label}. Нажмите E, чтобы открыть крафт`, 'Black Zone Craft');
        };
        colshape.onExit = (player) => {
            if (player.craftPointId === dbPoint.id) delete player.craftPointId;
            player.call('crafting.enter', [false, this.getClientPointPayload(dbPoint)]);
            player.call('crafting.atmosphere.stop');
            player.call('crafting.close');
        };

        const label = mp.labels.new(`${typeConfig.labelColor}${variantConfig.label}\n~c~BLACK ZONE RP\n~w~E - открыть меню`, new mp.Vector3(dbPoint.x, dbPoint.y, dbPoint.z + 0.45), {
            los: false,
            font: 0,
            drawDistance: 12,
            dimension: dbPoint.d
        });

        this.points.push({ dbPoint, marker, colshape, label, objects });
    },

    destroyPointRuntime(id) {
        const index = this.points.findIndex((point) => point.dbPoint.id === id);
        if (index === -1) return;
        const point = this.points[index];
        point.marker.destroy();
        point.colshape.destroy();
        point.label.destroy();
        if (point.objects) point.objects.forEach((object) => object && object.destroy());
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

    getClientPointPayload(dbPoint) {
        const variant = this.getVariantConfig(dbPoint.variant);
        return {
            id: dbPoint.id,
            type: dbPoint.type,
            variant: dbPoint.variant,
            title: variant.title,
            subtitle: variant.subtitle,
            recipes: this.getRecipesByType(dbPoint.type),
        };
    },

    getClientPayload(type, variant = DEFAULT_VARIANT) {
        const variantConfig = this.getVariantConfig(variant);
        return {
            type,
            variant,
            title: variantConfig.title,
            subtitle: variantConfig.subtitle,
            recipes: this.getRecipesByType(type),
        };
    },

    getAtmospherePayload(dbPoint) {
        const variant = this.getVariantConfig(dbPoint.variant);
        return {
            id: dbPoint.id,
            x: dbPoint.x,
            y: dbPoint.y,
            z: dbPoint.z,
            color: variant.light,
            variant: dbPoint.variant,
        };
    },

    open(player) {
        const point = this.getPlayerPoint(player);
        if (!point) return notifs.error(player, 'Вы не у точки крафта', 'Black Zone Craft');
        player.call('crafting.open', [this.getClientPointPayload(point.dbPoint)]);
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
        player.call('crafting.progress', [recipe.durationMs, this.getAtmospherePayload(point.dbPoint)]);
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

    async createPoint(player, type = FOOD_CRAFT_TYPE, variant = DEFAULT_VARIANT, radius = 2.0) {
        if (!CRAFT_TYPES[type]) type = FOOD_CRAFT_TYPE;
        variant = normalizeVariant(variant);
        const dbPoint = await db.Models.CraftPoint.create({
            type,
            variant,
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            h: player.heading || 0,
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
