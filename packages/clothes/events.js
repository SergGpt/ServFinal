let clothes = call('clothes');
let inventory = call('inventory');
let notifs = call('notifications');
let weather = call('weather');

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
    "clothes.editor.load": (player, type, sex, id) => {
        if (!player.account || player.account.admin < 3) return;
        type = String(type || "").toLowerCase();
        sex = parseInt(sex);
        id = parseInt(id);

        if (!clothes.getTypes().includes(type) || ![0, 1].includes(sex) || !Number.isFinite(id)) {
            return;
        }

        const ids = clothes.getIdsBySexType(sex, type);
        const el = clothes.getBySexTypeAndId(sex, type, id);
        if (!el) {
            player.utils.error(`Предмет не найден: type=${type}, sex=${sex}, id=${id}`);
            return;
        }

        player.call("clothes.editor.open", [JSON.stringify({
            type,
            sex,
            ids,
            item: {
                id: el.id,
                name: el.name,
                variation: el.variation,
                price: el.price,
                class: el.class,
                textures: el.textures,
                clime: el.clime,
                pockets: el.pockets,
                capacity: el.capacity,
                torso: el.torso,
                undershirt: el.undershirt,
                uTextures: el.uTextures,
            }
        })]);
    },
    "clothes.editor.save": async (player, payload) => {
        if (!player.account || player.account.admin < 3) return;
        if (typeof payload == "string") {
            try {
                payload = JSON.parse(payload);
            } catch (e) {
                return player.utils.error("Некорректный JSON редактора");
            }
        }
        if (!payload) return;

        const type = String(payload.type || "").toLowerCase();
        const sex = parseInt(payload.sex);
        const id = parseInt(payload.id);
        if (!clothes.getTypes().includes(type) || ![0, 1].includes(sex) || !Number.isFinite(id)) {
            return player.utils.error("Некорректные данные редактора");
        }

        const el = clothes.getBySexTypeAndId(sex, type, id);
        if (!el) return player.utils.error(`Предмет не найден: type=${type}, sex=${sex}, id=${id}`);

        const toInt = (value, fallback = 0) => {
            const num = parseInt(value);
            return Number.isFinite(num) ? num : fallback;
        };
        const normArray = (list) => {
            if (!Array.isArray(list)) return [0];
            const result = list
                .map(x => parseInt(x))
                .filter(x => Number.isFinite(x) && x >= 0)
                .sort((a, b) => a - b);
            return result.length ? [...new Set(result)] : [0];
        };
        const normJson = (value, fallback) => {
            if (value == null || value === "") return fallback;
            if (typeof value === "string") {
                try {
                    return JSON.parse(value);
                } catch (e) {
                    return fallback;
                }
            }
            return value;
        };
        const hasField = (field) => {
            return Object.prototype.hasOwnProperty.call(el.dataValues, field);
        };

        el.name = String(payload.name || "").trim().slice(0, 30) || el.name;
        el.variation = Math.max(0, toInt(payload.variation, el.variation));
        if (hasField("price")) el.price = Math.max(0, toInt(payload.price, el.price));
        if (hasField("class")) el.class = Math.max(0, toInt(payload.class, el.class));
        if (hasField("textures")) el.textures = normArray(payload.textures);
        if (hasField("capacity")) el.capacity = Math.max(0, toInt(payload.capacity, el.capacity));
        if (hasField("clime")) el.clime = normJson(payload.clime, el.clime);
        if (hasField("pockets")) el.pockets = normJson(payload.pockets, el.pockets);

        if (type === "tops") {
            el.torso = Math.max(0, toInt(payload.torso, el.torso));
            el.undershirt = Math.max(0, toInt(payload.undershirt, el.undershirt));
            el.uTextures = normArray(payload.uTextures);
        }

        await el.save();
        clothes.updateClientList();

        player.utils.success(`Сохранено: ${type} #${el.id} (sex=${sex})`);
    },
};
