"use strict";


mp.clothes = {
    // Интервал проверки, тепло/холодно ли одет игрок (ms)
    checkTime: 2 * 60 * 1000,

    initTimer() {
        mp.timer.addInterval(() => {
            mp.events.callRemote("clothes.clime.check");
        }, this.checkTime);
    },
};

const clothesEditor = {
    state: null,

    componentByType: {
        tops: 11,
        pants: 4,
        shoes: 6,
        bags: 5,
        ties: 7,
    },
    propByType: {
        hats: 0,
        glasses: 1,
        ears: 2,
        watches: 6,
        bracelets: 7,
    },

    ensureMenu() {
        mp.callCEFV(`(function() {
            selectMenu.menus["clothesEditor"] = {
                name: "clothesEditor",
                header: "Редактор одежды",
                items: [],
                i: 0,
                j: 0,
                handler(eventName) {
                    var item = this.items[this.i] || {};
                    var e = {
                        menuName: this.name,
                        itemName: item.text,
                        itemIndex: this.i,
                        itemValue: (item.i != null && item.values) ? item.values[item.i] : null,
                        valueIndex: item.i
                    };
                    mp.trigger("selectMenu.handler", this.name, eventName, JSON.stringify(e));
                }
            };
        })()`);
    },

    numValues(max) {
        const values = [];
        for (let i = 0; i <= max; i++) values.push(i);
        return values;
    },

    applyPreview() {
        if (!this.state) return;
        const s = this.state;
        if (this.componentByType[s.type] != null) {
            mp.players.local.setClothes(this.componentByType[s.type], s.variation, s.texture, 0);
        } else if (this.propByType[s.type] != null) {
            mp.players.local.setProp(this.propByType[s.type], s.variation, s.texture);
        }

        if (s.type === "tops") {
            mp.players.local.setClothes(11, s.variation, s.texture, 0);
            mp.players.local.setClothes(3, s.torso, 0, 0);
            mp.players.local.setClothes(8, s.undershirt, s.uTexture, 0);
        }
    },

    fieldEditable(name, value) {
        return { text: name, values: [value == null ? "" : String(value)], type: "editable" };
    },

    fieldSlider(name, value, max) {
        return { text: name, values: this.numValues(max), i: Math.max(0, Math.min(max, Number(value) || 0)) };
    },

    buildItems() {
        const s = this.state;
        const items = [
            { text: "Пол", values: ["Женский (0)", "Мужской (1)"], i: s.sex === 1 ? 1 : 0 },
            { text: "ID", values: s.ids, i: Math.max(0, s.ids.indexOf(s.id)) },
            this.fieldEditable("Название", s.name),
            this.fieldSlider("Variation", s.variation, 400),
            { text: "Texture", values: s.textures, i: Math.max(0, s.textures.indexOf(s.texture)) },
            this.fieldEditable("Цена", s.price),
            this.fieldSlider("Класс магазина", s.class, 10),
        ];

        if (s.hasCapacity) items.push(this.fieldEditable("Capacity", s.capacity));
        if (s.hasClime) items.push(this.fieldEditable("Clime JSON", JSON.stringify(s.clime)));
        if (s.hasPockets) items.push(this.fieldEditable("Pockets JSON", JSON.stringify(s.pockets)));

        if (s.type === "tops") {
            items.push(this.fieldSlider("Torso", s.torso, 400));
            items.push(this.fieldSlider("Undershirt", s.undershirt, 400));
            items.push({ text: "uTexture", values: s.uTextures, i: Math.max(0, s.uTextures.indexOf(s.uTexture)) });
        }

        items.push({ text: "Сохранить" });
        items.push({ text: "Закрыть" });
        return items;
    },

    syncMenu() {
        this.ensureMenu();
        const safeHeader = `Редактор ${this.state.type}: #${this.state.id} (sex=${this.state.sex})`.replace(/`/g, "");
        mp.callCEFV(`selectMenu.menus["clothesEditor"].header = \`${safeHeader}\`;`);
        mp.callCEFV(`selectMenu.setItems("clothesEditor", ${JSON.stringify(this.buildItems())})`);
    },

    open(payload) {
        if (typeof payload === "string") payload = JSON.parse(payload);
        this.state = {
            type: payload.type,
            sex: payload.sex,
            ids: Array.isArray(payload.ids) ? payload.ids : [],
            id: payload.item.id,
            name: payload.item.name || "",
            variation: Number(payload.item.variation) || 0,
            price: Number(payload.item.price) || 0,
            class: Number(payload.item.class) || 1,
            textures: Array.isArray(payload.item.textures) && payload.item.textures.length ? payload.item.textures : [0],
            texture: Array.isArray(payload.item.textures) ? payload.item.textures[0] : 0,
            hasClime: payload.item.clime !== undefined,
            hasPockets: payload.item.pockets !== undefined,
            hasCapacity: payload.item.capacity !== undefined,
            clime: payload.item.clime !== undefined ? payload.item.clime : null,
            pockets: payload.item.pockets !== undefined ? payload.item.pockets : null,
            capacity: payload.item.capacity !== undefined ? Number(payload.item.capacity) || 0 : 0,
            torso: Number(payload.item.torso) || 0,
            undershirt: Number(payload.item.undershirt) || 0,
            uTextures: Array.isArray(payload.item.uTextures) && payload.item.uTextures.length ? payload.item.uTextures : [0],
            uTexture: Array.isArray(payload.item.uTextures) ? payload.item.uTextures[0] : 0,
        };

        this.syncMenu();
        this.applyPreview();
        mp.events.call("selectMenu.show", "clothesEditor");
    },

    save() {
        if (!this.state) return;
        mp.events.callRemote("clothes.editor.save", JSON.stringify(this.state));
    },
};

mp.events.add({
    "clothes.editor.open": (payload) => clothesEditor.open(payload),
    "clothes.editor.valueChanged": (itemName, value) => {
        if (!clothesEditor.state) return;
        const s = clothesEditor.state;

        if (itemName === "Variation") s.variation = Number(value) || 0;
        else if (itemName === "Texture") s.texture = Number(value) || 0;
        else if (itemName === "Класс магазина") s.class = Number(value) || 1;
        else if (itemName === "Цена") s.price = parseInt(value) || 0;
        else if (itemName === "Название") s.name = String(value || "");
        else if (itemName === "Capacity") s.capacity = parseInt(value) || 0;
        else if (itemName === "Clime JSON") s.clime = String(value || "");
        else if (itemName === "Pockets JSON") s.pockets = String(value || "");
        else if (itemName === "Torso") s.torso = Number(value) || 0;
        else if (itemName === "Undershirt") s.undershirt = Number(value) || 0;
        else if (itemName === "uTexture") s.uTexture = Number(value) || 0;
        else if (itemName === "Пол") {
            s.sex = String(value).includes("(1)") ? 1 : 0;
            const id = s.id;
            mp.events.callRemote("clothes.editor.load", s.type, s.sex, id);
            return;
        } else if (itemName === "ID") {
            s.id = Number(value) || 0;
            mp.events.callRemote("clothes.editor.load", s.type, s.sex, s.id);
            return;
        }

        clothesEditor.applyPreview();
    },
    "clothes.editor.action": (action) => {
        if (action === "save") clothesEditor.save();
        if (action === "close") mp.events.call("selectMenu.hide");
    }
});

// mp.events.add({
//     "characterInit.done": () => {
//         mp.clothes.initTimer();
//     },
// });
