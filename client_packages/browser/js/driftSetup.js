var driftSetup = new Vue({
    el: '#driftSetup',
    data: {
        show: false,
        conversionInstalled: false,
        conversionPrice: 0,
        activePreset: 'Street Drift',
        vehicleName: '',
        limits: {},
        settings: {},
        defaultSettings: {},
        builtinPresets: {},
        customPresets: [],
        maxSavedPresets: 8,
        tab: 'Presets',
        tabs: ['Presets', 'Suspension', 'Steering', 'Grip', 'Transmission', 'Brakes', 'Balance', 'Assist'],
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
            return {
                initiation: clamp(((1 - (s.rearGrip || 0.8)) * 42) + ((s.handbrakePower || 1) * 22) + ((s.slipFactor || 1) * 25)),
                stability: clamp(((s.frontGrip || 0.9) * 36) + ((1 - (s.slipFactor || 1)) * 20) + ((s.stabilityBias || 0.5) * 44)),
                angle: clamp((((s.steeringAngle || 40) - 28) * 2.2) + ((s.bodyRotationHelp || 0.5) * 28)),
                control: clamp(((s.steeringResponse || 1) * 30) + ((s.counterSteerAssist || 0.3) * 25) + ((s.driftAssist || 0.8) * 25)),
                aggressiveness: clamp(((s.torqueResponse || 1) * 35) + ((s.differentialLock || 0.5) * 25) + ((1 - (s.rearGrip || 0.8)) * 40)),
            };
        },
        inRange(key, value) {
            const lim = this.limits[key] || [0, 1];
            return Math.max(lim[0], Math.min(lim[1], Number(value)));
        },
        slider(key, title, desc) {
            if (!this.conversionInstalled) return '';
            const lim = this.limits[key] || [0, 1];
            const value = this.settings[key] == null ? lim[0] : this.settings[key];
            return `<label class="drift-row"><div><strong>${title}</strong><small>${desc}</small></div><div class="drift-value">${Number(value).toFixed(2)}</div><input type="range" min="${lim[0]}" max="${lim[1]}" step="0.01" value="${value}" oninput="driftSetup.changeValue('${key}', event)"></label>`;
        },
        presetOptions() {
            const base = Object.keys(this.builtinPresets || {});
            const custom = (this.customPresets || []).map(x => x.name);
            return base.concat(custom);
        }
    },
});
