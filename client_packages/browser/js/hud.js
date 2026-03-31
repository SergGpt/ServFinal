"use strict";

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

(function () {
    const fields = [
        { key: 'panelRightTopTop', label: 'Top panel top', selector: '#hud .panel-right-top', style: 'top' },
        { key: 'panelRightTopRight', label: 'Top panel right', selector: '#hud .panel-right-top', style: 'right' },
        { key: 'panelRightBottomBottom', label: 'Bottom panel bottom', selector: '#hud .panel-right-bottom', style: 'bottom' },
        { key: 'panelRightBottomRight', label: 'Bottom panel right', selector: '#hud .panel-right-bottom', style: 'right' },
        { key: 'leftBottomBottom', label: 'Left panel bottom', selector: '#hud .left-bottom', style: 'bottom' },
        { key: 'leftBottomLeft', label: 'Left panel left', selector: '#hud .left-bottom', style: 'left' },
        { key: 'hudScale', label: 'HUD scale', selector: '#hud', style: 'transform' },
        { key: 'logoHeight', label: 'Logo height', selector: '#hud .logo', style: 'height' },
    ];

    const editor = {
        panel: null,
        values: {},
        highlighted: [],
        storageKey: 'hud.layout.editor.config',
        open() {
            if (this.panel) {
                this.panel.style.display = 'block';
                this.loadLocal(true);
                return;
            }
            this.readCurrentValues();
            this.createPanel();
            this.loadLocal(true);
        },
        close() {
            if (!this.panel) return;
            this.panel.style.display = 'none';
            this.clearHighlight();
        },
        readCurrentValues() {
            this.values = {};
            fields.forEach((field) => {
                const el = document.querySelector(field.selector);
                if (!el) return;
                const val = window.getComputedStyle(el)[field.style] || '';
                this.values[field.key] = val;
            });
        },
        apply() {
            fields.forEach((field) => {
                const input = this.panel.querySelector(`[data-key="${field.key}"]`);
                const el = document.querySelector(field.selector);
                if (!input || !el) return;
                el.style[field.style] = input.value.trim();
                this.values[field.key] = input.value.trim();
            });
            this.setJsonOutput(this.exportConfig());
        },
        exportConfig() {
            const cfg = {};
            fields.forEach((field) => {
                const input = this.panel.querySelector(`[data-key="${field.key}"]`);
                cfg[field.key] = (input ? input.value : this.values[field.key]) || '';
            });
            return JSON.stringify(cfg, null, 2);
        },
        setJsonOutput(text) {
            if (!this.panel) return;
            const out = this.panel.querySelector('.editor-json');
            if (out) out.value = text;
        },
        copyConfig() {
            const text = this.exportConfig();
            this.setJsonOutput(text);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    if (window.notifications) notifications.success(`HUD Editor`, `Конфиг скопирован`);
                }).catch(() => {
                    window.prompt('Скопируй конфиг вручную:', text);
                });
            } else {
                window.prompt('Скопируй конфиг вручную:', text);
            }
            return text;
        },
        saveLocal() {
            localStorage.setItem(this.storageKey, this.exportConfig());
            this.setJsonOutput(this.exportConfig());
            if (window.notifications) notifications.success(`HUD Editor`, `Сохранено локально`);
        },
        loadLocal(silent) {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) {
                if (!silent && window.notifications) notifications.error(`HUD Editor`, `Нет сохраненного конфига`);
                return;
            }
            try {
                const cfg = JSON.parse(raw);
                fields.forEach((field) => {
                    if (!Object.prototype.hasOwnProperty.call(cfg, field.key)) return;
                    const input = this.panel.querySelector(`[data-key="${field.key}"]`);
                    if (input) input.value = cfg[field.key];
                });
                this.apply();
                if (!silent && window.notifications) notifications.success(`HUD Editor`, `Загружено из localStorage`);
            } catch (e) {
                if (!silent && window.notifications) notifications.error(`HUD Editor`, `Ошибка чтения конфига`);
            }
        },
        clearHighlight() {
            if (!this.highlighted.length) return;
            this.highlighted.forEach((el) => el.classList.remove('hud-editor-highlight'));
            this.highlighted = [];
        },
        highlightField(field) {
            this.clearHighlight();
            if (!field || !field.selector) return;
            const list = document.querySelectorAll(field.selector);
            if (!list || !list.length) return;
            list.forEach((el) => {
                el.classList.add('hud-editor-highlight');
                this.highlighted.push(el);
            });
        },
        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'hud-layout-editor';
            panel.innerHTML = `
                <div class="editor-title">HUD UI Editor</div>
                <div class="editor-help">Выбери поле → блок подсветится. Меняй значение → Apply.</div>
                <div class="editor-list"></div>
                <div class="editor-actions">
                    <button data-action="apply">Apply</button>
                    <button data-action="save">Save Local</button>
                    <button data-action="load">Load Local</button>
                    <button data-action="copy">Copy JSON</button>
                    <button data-action="close">Close</button>
                </div>
                <textarea class="editor-json" readonly></textarea>
            `;
            const list = panel.querySelector('.editor-list');
            fields.forEach((field) => {
                const row = document.createElement('label');
                row.className = 'editor-row';
                row.title = field.selector;
                row.innerHTML = `<span>${field.label}</span><input data-key="${field.key}" value="${this.values[field.key] || ''}" />`;
                row.addEventListener('mouseenter', () => this.highlightField(field));
                row.addEventListener('mouseleave', () => this.clearHighlight());
                list.appendChild(row);
            });
            panel.addEventListener('focusin', (e) => {
                const key = e.target && e.target.dataset ? e.target.dataset.key : null;
                if (!key) return;
                const field = fields.find((x) => x.key === key);
                if (field) this.highlightField(field);
            });
            panel.addEventListener('click', (e) => {
                const action = e.target && e.target.dataset ? e.target.dataset.action : null;
                if (!action) return;
                if (action === 'apply') return this.apply();
                if (action === 'save') return this.saveLocal();
                if (action === 'load') return this.loadLocal();
                if (action === 'copy') return this.copyConfig();
                if (action === 'close') return this.close();
            });
            document.body.appendChild(panel);
            this.panel = panel;
            this.setJsonOutput(this.exportConfig());
        },
    };

    window.hudLayoutEditor = editor;
})();
