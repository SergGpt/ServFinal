"use strict";

const HUD_EDITOR_LAYOUT_DEFAULT = {
    rightTop: { x: 0, y: 0 },
    rightBottom: { x: 0, y: 0 },
    leftBottom: { x: 0, y: 0 },
    arrest: { x: 0, y: 0 },
};

// Vue HUD
var hud = new Vue({
    el: "#hud",
    data: {
        players: 123,
        maxPlayers: 1500,
        build: 0,
        branch: "",
        wanted: 3,
        cash: 200000,
        bank: 200000,
        time: convertToMoscowDate(new Date()).toTimeString().replace(/(\d{2}:\d{2}).*/, '$1'),
        region: "Маленький Сеул",
        street: "Бульвар Веспуччи",
        temperature: 28,
        city: "San Andreas",
        weather: "clear-day",
        mute: false,
        voice: false,
        show: false,
        showOnline: true,
        leftWeather: 320,
        keysShow: true,
        date: "",
        star: "M7.90313 0.66903C8.38475 -0.223008 9.61525 -0.223011 10.0969 0.669028L12.114 4.4051C12.2937 4.73789 12.6032 4.97261 12.9619 5.04817L16.9888 5.8964C17.9503 6.09892 18.3306 7.32062 17.6667 8.07446L14.8864 11.2317C14.6388 11.5129 14.5206 11.8927 14.5626 12.2722L15.0342 16.5325C15.1469 17.5497 14.1514 18.3048 13.2595 17.8786L9.52399 16.0939C9.19126 15.9349 8.80874 15.9349 8.47601 16.0939L4.74053 17.8786C3.84864 18.3048 2.85315 17.5497 2.96576 16.5325L3.43741 12.2722C3.47942 11.8927 3.36121 11.5129 3.11356 11.2317L0.333262 8.07446C-0.330572 7.32063 0.0496698 6.09892 1.01116 5.8964L5.03813 5.04817C5.39683 4.97261 5.7063 4.73789 5.88597 4.4051L7.90313 0.66903Z",
        satiety: 75,
        thirst: 30,
        playerId: 15,
        cold: false,
        heat: false,
        seatbelt: false,
        arrestTime: 0,
        arrestTimeMax: 0,
        arrestTimer: null,
        voice_key: 'N',
        menu_key: 'M',
        keys: [
            { key: "T", name: "Чат" },
            { key: "<i class='fas fa-arrow-up'></i>", name: "Телефон" },
            { key: "N", name: "Войс-чат" },
            { key: "L", name: "Действия" },
            { key: "J", name: "Двери т/с" },
            { key: "X", name: "Ремень безопасности" },
        ],
        localPos: { x: 0, y: 0 },
        coldTimer: -1,
        heatTimer: -1,
        layout: JSON.parse(JSON.stringify(HUD_EDITOR_LAYOUT_DEFAULT)),
        editor: {
            enabled: false,
            dragKey: null,
            selectedKey: "rightTop",
            startMouseX: 0,
            startMouseY: 0,
            startLayoutX: 0,
            startLayoutY: 0,
            blocks: [
                { key: "rightTop", title: "Верхний правый блок" },
                { key: "rightBottom", title: "Деньги" },
                { key: "leftBottom", title: "Навигация и иконки" },
                { key: "arrest", title: "Таймер заключения" },
            ],
        },
    },
    computed: {
        arrestProgressStyle() {
            return {
                strokeDasharray: `${this.arrestProgress * 1.57}% 157%`,
            };
        },
        arrestProgress() {
            return this.arrestTime / this.arrestTimeMax * 100 + "%";
        },
        arrestDescription() {
            let min = ((parseInt(this.arrestTime / 60) < 10) ? '0' : '') + parseInt(this.arrestTime / 60);
            let sec = ((parseInt(this.arrestTime % 60) < 10) ? '0' : '') + parseInt(this.arrestTime % 60);
            return `${min}:${sec}`;
        },
        leftBottomStyle() {
            const pos = this.layout.leftBottom || { x: 0, y: 0 };
            return {
                left: `${this.leftWeather}px`,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
            };
        },
    },
    watch: {
        cold(val) {
            if (!val) return;
            clearTimeout(this.coldTimer);
            this.coldTimer = setTimeout(() => { this.cold = false; }, 10000);
        },
        heat(val) {
            if (!val) return;
            clearTimeout(this.heatTimer);
            this.heatTimer = setTimeout(() => { this.heat = false; }, 10000);
        },
        arrestTimeMax(val) {
            this.arrestTime = val;
            clearInterval(this.arrestTimer);
            this.arrestTimer = setInterval(() => {
                this.arrestTime--;
                if (this.arrestTime <= 0) clearInterval(this.arrestTimer);
            }, 1000);
        },
    },
    methods: {
        getDefaultLayout() {
            return JSON.parse(JSON.stringify(HUD_EDITOR_LAYOUT_DEFAULT));
        },
        normalizeLayout(layout) {
            const defaults = this.getDefaultLayout();
            if (!layout || typeof layout !== "object") return defaults;

            for (const key in defaults) {
                const raw = layout[key] || {};
                const x = Number(raw.x);
                const y = Number(raw.y);
                defaults[key] = {
                    x: Number.isFinite(x) ? Math.round(x) : 0,
                    y: Number.isFinite(y) ? Math.round(y) : 0,
                };
            }
            return defaults;
        },
        applyLayout(layout) {
            this.layout = this.normalizeLayout(layout);
        },
        editorBlockStyle(key) {
            const pos = this.layout[key] || { x: 0, y: 0 };
            return {
                transform: `translate(${pos.x}px, ${pos.y}px)`,
            };
        },
        editorBlockClass(key) {
            return {
                "editor-draggable": this.editor.enabled,
                "dragging": this.editor.dragKey === key,
                "editor-selected": this.editor.selectedKey === key,
            };
        },
        selectEditorBlock(key) {
            if (!this.editor.enabled) return;
            this.editor.selectedKey = key;
        },
        editorBlockTitle(key) {
            const block = this.editor.blocks.find((x) => x.key === key);
            return block ? block.title : key;
        },
        setEditorMode(state) {
            this.editor.enabled = !!state;
            if (!this.editor.enabled) {
                this.stopDrag();
            }
        },
        startDrag(key, event) {
            if (!this.editor.enabled || event.button !== 0) return;
            event.preventDefault();

            const current = this.layout[key] || { x: 0, y: 0 };
            this.editor.selectedKey = key;
            this.editor.dragKey = key;
            this.editor.startMouseX = event.clientX;
            this.editor.startMouseY = event.clientY;
            this.editor.startLayoutX = current.x;
            this.editor.startLayoutY = current.y;

            window.addEventListener("mousemove", this._onEditorMouseMove);
            window.addEventListener("mouseup", this._onEditorMouseUp);
        },
        onEditorMouseMove(event) {
            if (!this.editor.dragKey) return;

            const key = this.editor.dragKey;
            const deltaX = event.clientX - this.editor.startMouseX;
            const deltaY = event.clientY - this.editor.startMouseY;
            this.layout[key] = {
                x: Math.round(this.editor.startLayoutX + deltaX),
                y: Math.round(this.editor.startLayoutY + deltaY),
            };
        },
        stopDrag() {
            this.editor.dragKey = null;
            window.removeEventListener("mousemove", this._onEditorMouseMove);
            window.removeEventListener("mouseup", this._onEditorMouseUp);
        },
        saveLayout() {
            if (typeof mp !== "undefined" && typeof mp.trigger === "function") {
                mp.trigger("hud.editor.save", JSON.stringify(this.layout));
            }
        },
        resetLayout() {
            this.applyLayout(this.getDefaultLayout());
            this.editor.selectedKey = "rightTop";
            this.saveLayout();
        },
        closeEditor() {
            if (typeof mp !== "undefined" && typeof mp.trigger === "function") {
                mp.trigger("hud.editor.toggle", false);
                return;
            }
            this.setEditorMode(false);
        },
        updateTime() {
            this.time = convertToMoscowDate(new Date()).toTimeString().replace(/(\d{2}:\d{2}).*/, '$1');
            if (this.time == "00:00") this.setDate();
        },
        setDate() {
            let date = convertToMoscowDate(new Date());
            let day = date.getDate();
            let month = date.getMonth() + 1;
            let year = date.getUTCFullYear();
            if (day < 10) day = "0" + day;
            if (month < 10) month = "0" + month;
            this.date = `${day}.${month}.${year}`;
        },
        pretty(val) { return prettyMoney(val); },
        isKeyShow(name) { return true; },
    },
    mounted() {
        this._onEditorMouseMove = this.onEditorMouseMove.bind(this);
        this._onEditorMouseUp = this.stopDrag.bind(this);
        setInterval(this.updateTime, 1000);
        this.setDate();
    },
});

// =================== Seatbelt (клавиша X) ===================
let seatbeltOn = false;

mp.keys.bind(0x58, true, () => { // X
    const player = mp.players.local;
    if (!player.vehicle) {
        mp.gui.chat.push("~r~Вы должны быть в машине!");
        return;
    }
    seatbeltOn = !seatbeltOn;
    mp.events.callRemote("server:seatbelt:toggle", seatbeltOn);
    mp.gui.chat.push(seatbeltOn ? "~g~Вы пристегнули ремень." : "~r~Вы отстегнули ремень.");
});

// Обновление HUD
mp.events.add("client:seatbelt:update", (state) => {
    seatbeltOn = state;
    mp.events.call("hud.setData", { seatbelt: state });
});

// Сообщение при выбросе
mp.events.add("client:seatbelt:eject", () => {
    mp.gui.chat.push("~r~Вы вылетели из машины из-за отсутствия ремня!");
});

// Аварийная проверка
let lastSpeed = 0;
mp.events.add("render", () => {
    const player = mp.players.local;
    if (player.vehicle && player.vehicle.getPedInSeat(-1) === player.handle) {
        let speed = player.vehicle.getSpeed() * 3.6;
        let delta = lastSpeed - speed;
        if (delta > 45) mp.events.callRemote("server:vehicle:crash", lastSpeed);
        lastSpeed = speed;
    } else lastSpeed = 0;
});
