let clothes = call('clothes');
let inventory = call('inventory');
let notifs = call('notifications');
let weather = call('weather');

const TYPE_MODEL_MAP = {
    bracelets: 'ClothesBracelet',
    bags: 'ClothesBag',
    ears: 'ClothesEar',
    glasses: 'ClothesGlasses',
    hats: 'ClothesHat',
    pants: 'ClothesPants',
    shoes: 'ClothesShoe',
    ties: 'ClothesTie',
    tops: 'ClothesTop',
    watches: 'ClothesWatch',
};

function hasClothesEditorAccess(player) {
    return !!(player && player.character && player.character.admin >= 1);
}

function parseInteger(value, fallback = 0) {
    const parsed = parseInt(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArrayValue(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
            return value
                .split(',')
                .map(v => parseInt(v.trim()))
                .filter(Number.isFinite);
        }
    }
    return fallback;
}

function normalizeValueByKey(key, value) {
    if (['id', 'sex', 'variation', 'price', 'class', 'torso', 'undershirt', 'capacity'].includes(key)) {
        return parseInteger(value, key === 'price' ? 1 : 0);
    }
    if (['textures', 'uTextures', 'pockets', 'clime'].includes(key)) {
        return parseArrayValue(value, []);
    }
    if (key === 'name') {
        return `${value || ''}`.trim();
    }
    return value;
}

function sanitizeData(type, payload, isCreate) {
    const modelName = TYPE_MODEL_MAP[type];
    const attributes = db.Models[modelName]?.rawAttributes || {};
    const allowedKeys = Object.keys(attributes).filter(k => k !== 'createdAt' && k !== 'updatedAt');
    const result = {};

    allowedKeys.forEach((key) => {
        if (key === 'id' && isCreate) return;
        if (payload[key] == null && key !== 'id') return;
        result[key] = normalizeValueByKey(key, payload[key]);
    });

    if (!result.name) result.name = `new_${type}`;
    if (result.price == null) result.price = 1;
    if (result.sex == null) result.sex = 1;
    if (result.variation == null) result.variation = 0;
    if (result.class == null) result.class = 1;
    if (result.textures == null) result.textures = [0];

    if (type === 'tops') {
        if (result.torso == null) result.torso = 0;
        if (result.undershirt == null) result.undershirt = 0;
        if (result.uTextures == null) result.uTextures = [0];
        if (result.pockets == null) result.pockets = [2, 2];
        if (result.clime == null) result.clime = [-10, 45];
    }

    if (['pants', 'shoes'].includes(type)) {
        if (result.pockets == null) result.pockets = [2, 2];
        if (result.clime == null) result.clime = [-10, 45];
    }

    if (type === 'hats') {
        if (result.clime == null) result.clime = [-10, 45];
    }

    if (type === 'bags' && result.capacity == null) result.capacity = 0;

    return result;
}

function toClientRow(model) {
    const data = model?.dataValues || model;
    const row = {};
    Object.keys(data || {}).forEach((key) => {
        row[key] = model[key];
    });
    return row;
}

function sendEditorRows(player, options = {}) {
    const type = options.type || 'tops';
    const sex = parseInteger(options.sex, 1);
    const search = `${options.search || ''}`.trim().toLowerCase();
    const page = Math.max(parseInteger(options.page, 1), 1);
    const perPage = 200;

    const source = clothes.list?.[sex]?.[type] || [];
    const filtered = source.filter((entry) => {
        if (!search) return true;
        const idMatch = `${entry.id}`.includes(search);
        const nameMatch = `${entry.name || ''}`.toLowerCase().includes(search);
        return idMatch || nameMatch;
    });

    const total = filtered.length;
    const pages = Math.max(Math.ceil(total / perPage), 1);
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * perPage;
    const items = filtered.slice(offset, offset + perPage).map(toClientRow);

    player.call('clothes.editor.rows', [JSON.stringify({
        sex,
        type,
        page: safePage,
        pages,
        total,
        items,
    })]);
}

module.exports = {
    "init": async () => {
        await clothes.init();
        inited(__dirname);
    },
    "clothes.clime.check": (player) => {
        var temperature = weather.getCurrentWeather().temperature;
        inventory.checkClimeDamage(player, temperature, (text) => {
            notifs.warning(player, text, `Климат`);
        });
    },
    'clothes.editor.open': (player) => {
        if (!hasClothesEditorAccess(player)) return notifs.error(player, 'Недостаточно прав', 'Одежда');

        player.call('clothes.editor.open');
        sendEditorRows(player, { sex: 1, type: 'tops', page: 1, search: '' });
    },
    'clothes.editor.fetch': (player, rawQuery) => {
        if (!hasClothesEditorAccess(player)) return;
        let query = {};
        try {
            if (rawQuery) query = JSON.parse(rawQuery);
        } catch (e) {}
        sendEditorRows(player, query);
    },
    'clothes.editor.reload': async (player, rawQuery) => {
        if (!hasClothesEditorAccess(player)) return;
        let query = {};
        try {
            if (rawQuery) query = JSON.parse(rawQuery);
        } catch (e) {}

        try {
            await clothes.init();
            clothes.updateClientList();
            sendEditorRows(player, query);
            notifs.success(player, 'Список одежды обновлён из БД', 'Одежда');
        } catch (err) {
            console.log(`[CLOTHES_EDITOR] reload error: ${err.message}`);
            notifs.error(player, 'Не удалось обновить данные из БД', 'Одежда');
        }
    },
    'clothes.editor.delete': async (player, rawPayload) => {
        if (!hasClothesEditorAccess(player)) return notifs.error(player, 'Недостаточно прав', 'Одежда');

        let payload;
        try {
            payload = JSON.parse(rawPayload);
        } catch (e) {
            return notifs.error(player, 'Некорректные данные удаления', 'Одежда');
        }

        const type = payload.type;
        const id = parseInteger(payload.id, -1);
        const modelName = TYPE_MODEL_MAP[type];
        if (id < 0 || !modelName || !db.Models[modelName]) return notifs.error(player, 'Некорректный тип/id', 'Одежда');

        try {
            const model = await db.Models[modelName].findByPk(id);
            if (!model) return notifs.error(player, `Запись #${id} не найдена`, 'Одежда');
            const sex = model.sex;

            await model.destroy();
            if (clothes.list[sex] && clothes.list[sex][type]) {
                clothes.list[sex][type] = clothes.list[sex][type].filter(x => x.id !== id);
            }

            clothes.updateClientList();
            sendEditorRows(player, {
                type,
                sex,
                page: 1,
                search: '',
            });
            notifs.success(player, `Запись #${id} удалена`, 'Одежда');
        } catch (err) {
            console.log(`[CLOTHES_EDITOR] delete error: ${err.message}`);
            notifs.error(player, 'Ошибка удаления записи', 'Одежда');
        }
    },
    'clothes.editor.save': async (player, rawPayload) => {
        if (!hasClothesEditorAccess(player)) return notifs.error(player, 'Недостаточно прав', 'Одежда');

        let payload;
        try {
            payload = JSON.parse(rawPayload);
        } catch (e) {
            return notifs.error(player, 'Некорректные данные редактора', 'Одежда');
        }

        const type = payload.type;
        const modelName = TYPE_MODEL_MAP[type];
        if (!modelName || !db.Models[modelName]) return notifs.error(player, 'Неизвестный тип одежды', 'Одежда');

        try {
            if (payload.mode === 'create') {
                const data = sanitizeData(type, payload.data || {}, true);
                const created = await db.Models[modelName].create(data);

                if (!clothes.list[created.sex]) clothes.list[created.sex] = {};
                if (!clothes.list[created.sex][type]) clothes.list[created.sex][type] = [];
                clothes.list[created.sex][type].push(created);
            } else {
                const id = parseInteger(payload.id, -1);
                if (id < 0) return notifs.error(player, 'Некорректный id записи', 'Одежда');

                const model = await db.Models[modelName].findByPk(id);
                if (!model) return notifs.error(player, `Запись #${id} не найдена`, 'Одежда');

                const oldSex = model.sex;
                const data = sanitizeData(type, payload.data || {}, false);
                Object.keys(data).forEach((key) => {
                    if (key === 'id') return;
                    model[key] = data[key];
                });
                await model.save();

                if (oldSex !== model.sex) {
                    if (clothes.list[oldSex] && clothes.list[oldSex][type]) {
                        clothes.list[oldSex][type] = clothes.list[oldSex][type].filter(x => x.id !== model.id);
                    }
                    if (!clothes.list[model.sex]) clothes.list[model.sex] = {};
                    if (!clothes.list[model.sex][type]) clothes.list[model.sex][type] = [];
                    clothes.list[model.sex][type].push(model);
                }
            }

            clothes.updateClientList();
            sendEditorRows(player, {
                type,
                sex: payload?.data?.sex != null ? payload.data.sex : 1,
                page: 1,
                search: '',
            });
            notifs.success(player, 'Изменения сохранены', 'Одежда');
        } catch (err) {
            console.log(`[CLOTHES_EDITOR] save error: ${err.message}`);
            notifs.error(player, 'Ошибка сохранения. Проверьте поля.', 'Одежда');
        }
    },
};
