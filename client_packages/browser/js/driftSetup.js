var driftSetup = new Vue({
    el: '#driftSetup',
    data: {
        show: false,
        conversionInstalled: false,
        conversionPrice: 0,
        activePreset: 'Street Drift',
        vehicleName: '',
        limits: {},
        steps: {},
        settings: {},
        defaultSettings: {},
        builtinPresets: {},
        customPresets: [],
        maxSavedPresets: 8,
        tab: 'Basic',
        tabs: ['Basic'],
        stats: { initiation: 0, stability: 0, angle: 0, control: 0, aggressiveness: 0 },
        newPresetName: '',
        selectedPreset: 'Street Drift',
    },
    methods: {
        open(payload) {
            this.show = true;
            this.conversionInstalled = !!payload.conversionInstalled;
            this.conversionPrice = payload.conversionPrice || 0;
            this.activePreset = payload.activePreset || 'Street Drift';
            this.vehicleName = payload.vehicleName || '';
            this.limits = payload.limits || {};
            this.steps = payload.steps || {};
            this.settings = Object.assign({}, payload.settings || {});
            this.defaultSettings = Object.assign({}, payload.defaultSettings || {});
            this.builtinPresets = Object.assign({}, payload.builtinPresets || {});
            this.customPresets = payload.customPresets || [];
            this.maxSavedPresets = payload.maxSavedPresets || 8;
            this.stats = payload.stats || this.calcStats(this.settings);
            this.selectedPreset = this.activePreset;
            this.newPresetName = '';
        },
        close() { this.show = false; },
        onConversionPurchased(payload) {
            this.conversionInstalled = true;
            this.settings = Object.assign({}, payload.settings || this.settings);
            this.activePreset = payload.activePreset || this.activePreset;
            this.selectedPreset = this.activePreset;
            this.stats = payload.stats || this.calcStats(this.settings);
        },
        onServerSync(payload) {
            if (payload.settings) this.settings = Object.assign({}, payload.settings);
            if (payload.activePreset) {
                this.activePreset = payload.activePreset;
                this.selectedPreset = payload.activePreset;
            }
            if (payload.customPresets) this.customPresets = payload.customPresets;
            this.stats = payload.stats || this.calcStats(this.settings);
        },
        notify(action, payload = null) {
            mp.trigger('drift.setup.action', action, payload ? JSON.stringify(payload) : '');
        },
        closeUi() { this.notify('close'); },
        purchase() { this.notify('purchase'); },
        preview() {
            this.stats = this.calcStats(this.settings);
            this.notify('preview', this.settings);
        },
        apply() { this.notify('apply', this.settings); },
        reset() { this.notify('reset'); },
        savePreset() {
            if (!this.newPresetName.trim()) return;
            this.notify('savePreset', { name: this.newPresetName.trim(), settings: this.settings });
            this.newPresetName = '';
        },
        loadPreset() {
            if (!this.selectedPreset) return;
            this.notify('loadPreset', { name: this.selectedPreset });
        },
        deletePreset(name) { this.notify('deletePreset', { name }); },
        renamePreset(name) {
            const next = prompt('Новое имя пресета:', name);
            if (!next) return;
            this.notify('renamePreset', { oldName: name, newName: next });
        },
        changeValue(key, event) {
            const value = Number(event.target.value);
            this.$set(this.settings, key, value);
            this.preview();
        },
        calcStats(s) {
            const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
            const powerBias = Math.max(0, Math.min(1, Number(s.wheelOverpower || 0) / 100));
            const gripDelta = Math.max(0, Math.min(1, Number(s.rearGripLoss || 0) / 100));
            const angleBias = Math.max(0, Math.min(1, Number(s.steeringAngle || 0) / 100));
            const frontGripBias = Math.max(0, Math.min(1, Number(s.frontGripHighSpeed == null ? 60 : s.frontGripHighSpeed) / 100));
            const powerCoeffBias = Math.max(0, Math.min(1, (Number(s.powerCoeff == null ? 100 : s.powerCoeff) - 100) / 100));
            return {
                initiation: clamp(20 + (powerBias * 50) + (gripDelta * 20) + (powerCoeffBias * 15)),
                stability: clamp(70 - (gripDelta * 40) + (frontGripBias * 30)),
                angle: clamp(15 + (powerBias * 20) + (gripDelta * 20) + (angleBias * 45)),
                control: clamp(70 - (powerBias * 20) - (gripDelta * 18) + (angleBias * 10) + (frontGripBias * 30)),
                aggressiveness: clamp(20 + (powerBias * 35) + (gripDelta * 40) + (powerCoeffBias * 25)),
            };
        },
        inRange(key, value) {
            const lim = this.limits[key] || [0, 1];
            return Math.max(lim[0], Math.min(lim[1], Number(value)));
        },
        getStepPrecision(key) {
            const step = this.steps[key];
            if (step == null) return 2;
            const raw = String(step);
            const dot = raw.indexOf('.');
            return dot === -1 ? 0 : Math.min(raw.length - dot - 1, 6);
        },
        slider(key, title, desc) {
            if (!this.conversionInstalled) return '';
            const lim = this.limits[key] || [0, 1];
            const value = this.settings[key] == null ? lim[0] : this.settings[key];
            const step = this.steps[key] || 0.01;
            const precision = this.getStepPrecision(key);
            return `<label class="drift-row"><div><strong>${title}</strong><small>${desc}</small></div><div class="drift-value">${Number(value).toFixed(precision)}</div><input type="range" min="${lim[0]}" max="${lim[1]}" step="${step}" value="${value}" oninput="driftSetup.changeValue('${key}', event)"></label>`;
        },
        presetOptions() {
            const base = Object.keys(this.builtinPresets || {});
            const custom = (this.customPresets || []).map(x => x.name);
            return base.concat(custom);
        }
    },
});
