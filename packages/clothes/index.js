"use strict";

function createSexBucket() {
    return {
        "bracelets": [],
        "bags": [],
        "ears": [],
        "glasses": [],
        "hats": [],
        "pants": [],
        "shoes": [],
        "ties": [],
        "tops": [],
        "watches": [],
    };
}

function ensureSex(sex, list) {
    if (!list[sex]) {
        list[sex] = createSexBucket();
        console.log(`[CLOTHES] Добавлена новая категория sex=${sex}`);
    }
}

function getShoesUniqueKey(item) {
    const sex = item.sex != null ? item.sex : '';
    const variation = item.variation != null ? item.variation : '';
    const itemClass = item.class != null ? item.class : '';
    const textures = Array.isArray(item.textures) ? JSON.stringify(item.textures) : String(item.textures || '');
    return `${sex}|${variation}|${itemClass}|${textures}`;
}

async function loadShoesFromAllKnownTables() {
    const shoes = await db.Models.ClothesShoe.findAll();
    const uniqueKeys = new Set(shoes.map(getShoesUniqueKey));

    // Поддержка старой/альтернативной таблицы с множественным именем.
    if (db.sequelize && db.sequelize.models && !db.sequelize.models.ClothesShoePlural) {
        db.sequelize.define("ClothesShoePlural", db.Models.ClothesShoe.rawAttributes, {
            timestamps: false,
            tableName: "clothesshoes"
        });
    }

    try {
        if (db.sequelize?.models?.ClothesShoePlural) {
            const extraShoes = await db.sequelize.models.ClothesShoePlural.findAll();
            extraShoes.forEach(item => {
                const key = getShoesUniqueKey(item);
                if (uniqueKeys.has(key)) return;
                uniqueKeys.add(key);
                shoes.push(item);
            });
        }
    } catch (e) {
        // Если альтернативной таблицы нет — это нормальный сценарий.
    }

    return shoes;
}

module.exports = {
    // Список одежды
    list: {
        // жен.
        "0": createSexBucket(),
        // муж.
        "1": createSexBucket()
    },

    resetList() {
        this.list = {
            "0": createSexBucket(),
            "1": createSexBucket(),
        };
    },

    async init() {
        this.resetList();
        var bracelets = await db.Models.ClothesBracelet.findAll();
        bracelets.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["bracelets"].push(el);
        });

        var bags = await db.Models.ClothesBag.findAll();
        bags.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["bags"].push(el);
        });

        var ears = await db.Models.ClothesEar.findAll();
        ears.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["ears"].push(el);
        });

        var glasses = await db.Models.ClothesGlasses.findAll();
        glasses.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["glasses"].push(el);
        });

        var hats = await db.Models.ClothesHat.findAll();
        hats.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["hats"].push(el);
        });

        var pants = await db.Models.ClothesPants.findAll();
        pants.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["pants"].push(el);
        });

        var shoes = await loadShoesFromAllKnownTables();
        shoes.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["shoes"].push(el);
        });

        var ties = await db.Models.ClothesTie.findAll();
        ties.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["ties"].push(el);
        });

        var tops = await db.Models.ClothesTop.findAll();
        tops.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["tops"].push(el);
        });

        var watches = await db.Models.ClothesWatch.findAll();
        watches.forEach(el => {
            ensureSex(el.sex, this.list);
            this.list[el.sex]["watches"].push(el);
        });

        var count = bracelets.length + bags.length + ears.length + glasses.length + hats.length +
                    pants.length + shoes.length + ties.length + tops.length + watches.length;
        console.log(`[CLOTHES] Одежда загружена (${count} шт.)`);
    },

    getTypes() {
        return Object.keys(this.list[0]);
    },

    getClothes(type, id) {
        // Ищем сперва у мужчин, потом у женщин, потом у всех дополнительных категорий
        var el = this.list[1]?.[type]?.find(x => x.id == id);
        if (!el) el = this.list[0]?.[type]?.find(x => x.id == id);

        if (!el) {
            for (var sex in this.list) {
                if (sex == "0" || sex == "1") continue;
                el = this.list[sex][type].find(x => x.id == id);
                if (el) break;
            }
        }
        return el;
    },

    getClientList() {
        var clientList = {};
        for (var sex in this.list) {
            clientList[sex] = {};
            for (var type in this.list[sex]) {
                clientList[sex][type] = [];
                var list = this.list[sex][type];
                if (!list.length) continue;
                var keys = Object.keys(list[0].dataValues);
                list.forEach(el => {
                    var obj = {};
                    keys.forEach(key => {
                        obj[key] = el[key];
                    });
                    clientList[sex][type].push(obj);
                });
            }
        }
        return clientList;
    },

    updateClientList() {
        mp.players.forEach((current) => {
            current.hasValidClothesData = false;
        });
    }
};
