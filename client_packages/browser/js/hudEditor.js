(function () {
    const fields = [
        { key: 'panelRightTopTop', label: 'Top panel: top', selector: '#hud .panel-right-top', style: 'top', type: 'length', nudge: true },
        { key: 'panelRightTopRight', label: 'Top panel: right', selector: '#hud .panel-right-top', style: 'right', type: 'length', nudge: true },
        { key: 'panelRightBottomBottom', label: 'Bottom panel: bottom', selector: '#hud .panel-right-bottom', style: 'bottom', type: 'length', nudge: true },
        { key: 'panelRightBottomRight', label: 'Bottom panel: right', selector: '#hud .panel-right-bottom', style: 'right', type: 'length', nudge: true },
        { key: 'leftBottomBottom', label: 'Left panel: bottom', selector: '#hud .left-bottom', style: 'bottom', type: 'length', nudge: true },
        { key: 'leftBottomLeft', label: 'Left panel: left', selector: '#hud .left-bottom', style: 'left', type: 'length', nudge: true },
        { key: 'starvationBottom', label: 'Needs: bottom', selector: '#hud .starvation', style: 'bottom', type: 'length', nudge: true },
        { key: 'starvationLeft', label: 'Needs: left', selector: '#hud .starvation', style: 'left', type: 'length', nudge: true },
        { key: 'starvationIconSize', label: 'Needs icon size', selector: '#hud .starvation > div', style: 'width', type: 'length', nudge: true, mirrorStyles: ['height'] },
        { key: 'starvationGap', label: 'Needs gap', selector: '#hud .starvation > div:not(:first-child)', style: 'margin-left', type: 'length', nudge: true },
        { key: 'hudScale', label: 'HUD scale', selector: '#hud', style: 'transform', type: 'scale' },
        { key: 'topPanelScale', label: 'Top panel scale', selector: '#hud .panel-right-top', style: 'transform', type: 'scale' },
        { key: 'bottomPanelScale', label: 'Bottom panel scale', selector: '#hud .panel-right-bottom', style: 'transform', type: 'scale' },
        { key: 'leftPanelScale', label: 'Left panel scale', selector: '#hud .left-bottom', style: 'transform', type: 'scale' },
        { key: 'speedometerBottom', label: 'Speedometer: bottom', selector: '#speedometer', style: 'bottom', type: 'length', nudge: true },
        { key: 'speedometerRight', label: 'Speedometer: right', selector: '#speedometer', style: 'right', type: 'length', nudge: true },
        { key: 'speedometerHeight', label: 'Speedometer: height', selector: '#speedometer', style: 'height', type: 'length', nudge: true },
        { key: 'speedometerPadding', label: 'Speedometer: padding', selector: '#speedometer', style: 'padding', type: 'length', nudge: true },
        { key: 'speedometerScale', label: 'Speedometer scale', selector: '#speedometer', style: 'transform', type: 'scale' },
        { key: 'notificationsBottom', label: 'Push: bottom', selector: '#notifications', style: 'bottom', type: 'length', nudge: true },
        { key: 'notificationsLeft', label: 'Push: left', selector: '#notifications', style: 'left', type: 'length', nudge: true },
        { key: 'logoHeight', label: 'Logo height', selector: '#hud .logo', style: 'height', type: 'length', nudge: true },
    ];

    function parseScale(raw) {
        if (!raw) return '';
        const m = String(raw).trim().match(/scale\(([-\d.]+)\)/i);
        return m ? m[1] : '';
    }

    function formatScale(raw) {
        const val = parseFloat(String(raw).trim());
        if (!Number.isFinite(val)) return '';
        return `scale(${val})`;
    }

    function parseLength(raw) {
        const text = String(raw || '').trim();
        if (!text) return null;
        const m = text.match(/^(-?\d+(?:\.\d+)?)([a-z%]*)$/i);
        if (!m) return null;
        return { num: parseFloat(m[1]), unit: m[2] || 'px' };
    }

    function nudgeLength(raw, dir) {
        const parsed = parseLength(raw);
        if (!parsed) return null;

        let step = 2;
        if (parsed.unit === 'vh' || parsed.unit === 'vw' || parsed.unit === 'rem' || parsed.unit === 'em') step = 0.2;

        const next = Math.round((parsed.num + (step * dir)) * 1000) / 1000;
        return `${next}${parsed.unit}`;
    }

    const editor = {
        panel: null,
        values: {},
        highlighted: [],
        storageKey: 'hud.layout.editor.config',
        bordersEnabled: true,
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
        notify(message, type) {
            if (!window.notifications || !notifications[type]) return;
            notifications[type]('HUD Editor', message);
        },
        updateBordersButton() {
            if (!this.panel) return;
            const btn = this.panel.querySelector('[data-action="toggle-borders"]');
            if (!btn) return;
            btn.textContent = this.bordersEnabled ? 'Рамки: ON' : 'Рамки: OFF';
        },
        applyBordersState() {
            const hud = document.querySelector('#hud');
            if (!hud) return;
            hud.classList.toggle('hud-editor-no-borders', !this.bordersEnabled);
            const speedometer = document.querySelector('#speedometer');
            if (speedometer) speedometer.classList.toggle('hud-editor-no-borders', !this.bordersEnabled);
            this.updateBordersButton();
        },
        toggleBorders() {
            this.bordersEnabled = !this.bordersEnabled;
            this.applyBordersState();
            this.notify(this.bordersEnabled ? 'Рамки включены' : 'Рамки выключены', 'success');
        },
        readCurrentValues() {
            this.values = {};
            fields.forEach((field) => {
                const el = document.querySelector(field.selector);
                if (!el) return;
                const val = window.getComputedStyle(el)[field.style] || '';
                this.values[field.key] = field.type === 'scale' ? parseScale(val) : val;
            });
        },
        getInputValue(field) {
            const input = this.panel ? this.panel.querySelector(`[data-key="${field.key}"]`) : null;
            return input ? input.value.trim() : (this.values[field.key] || '');
        },
        applyField(field) {
            const value = this.getInputValue(field);
            const list = document.querySelectorAll(field.selector);
            if (!list || !list.length) return;

            const cssValue = field.type === 'scale' ? formatScale(value) : value;
            list.forEach((el) => {
                el.style[field.style] = cssValue;
                if (field.mirrorStyles && Array.isArray(field.mirrorStyles)) {
                    field.mirrorStyles.forEach((extraStyle) => {
                        el.style[extraStyle] = value;
                    });
                }
            });

            this.values[field.key] = value;
        },
        apply() {
            fields.forEach((field) => this.applyField(field));
            this.applyBordersState();
            this.setJsonOutput(this.exportConfig());
            this.notify('Изменения применены', 'success');
        },
        exportConfig() {
            const cfg = {};
            fields.forEach((field) => {
                cfg[field.key] = this.getInputValue(field);
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
                    if (window.notifications) notifications.success('HUD Editor', 'Конфиг скопирован');
                }).catch(() => {
                    window.prompt('Скопируй конфиг вручную:', text);
                });
            } else {
                window.prompt('Скопируй конфиг вручную:', text);
            }
            return text;
        },
        saveLocal() {
            const payload = this.exportConfig();
            localStorage.setItem(this.storageKey, payload);
            this.setJsonOutput(payload);
            this.notify('Сохранено локально', 'success');
        },
        loadLocal(silent) {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) {
                if (!silent) this.notify('Нет сохраненного конфига', 'error');
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
                if (!silent) this.notify('Загружено из localStorage', 'success');
            } catch (e) {
                if (!silent) this.notify('Ошибка чтения конфига', 'error');
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
        nudgeField(key, dir) {
            const field = fields.find((x) => x.key === key);
            if (!field || field.type !== 'length') return;
            const input = this.panel.querySelector(`[data-key="${field.key}"]`);
            if (!input) return;

            const nudged = nudgeLength(input.value, dir);
            if (!nudged) return;
            input.value = nudged;
            this.applyField(field);
            this.setJsonOutput(this.exportConfig());
        },
        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'hud-layout-editor';
            panel.innerHTML = `
                <div class="editor-title">HUD CSS Editor</div>
                <div class="editor-help">Позиция HUD, спидометра, push-уведомлений и потребностей. Кнопки ±2 двигают без ручного ввода.</div>
                <div class="editor-list"></div>
                <div class="editor-actions">
                    <button data-action="apply">Apply</button>
                    <button data-action="save">Save Local</button>
                    <button data-action="load">Load Local</button>
                    <button data-action="copy">Copy JSON</button>
                    <button data-action="toggle-borders">Рамки: ON</button>
                    <button data-action="close">Close</button>
                </div>
                <textarea class="editor-json" readonly></textarea>
            `;

            const list = panel.querySelector('.editor-list');
            fields.forEach((field) => {
                const row = document.createElement('div');
                row.className = 'editor-row';
                row.title = field.selector;

                const nudgeHtml = field.nudge
                    ? `<button data-action="nudge-minus" data-key="${field.key}" type="button">-2</button><button data-action="nudge-plus" data-key="${field.key}" type="button">+2</button>`
                    : '';

                row.innerHTML = `
                    <span>${field.label}</span>
                    <div class="editor-input-wrap">
                        <input data-key="${field.key}" value="${this.values[field.key] || ''}" />
                        ${nudgeHtml}
                    </div>
                `;

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
                const key = e.target && e.target.dataset ? e.target.dataset.key : null;
                if (!action) return;
                if (action === 'apply') return this.apply();
                if (action === 'save') return this.saveLocal();
                if (action === 'load') return this.loadLocal();
                if (action === 'copy') return this.copyConfig();
                if (action === 'close') return this.close();
                if (action === 'toggle-borders') return this.toggleBorders();
                if (action === 'nudge-plus' && key) return this.nudgeField(key, 1);
                if (action === 'nudge-minus' && key) return this.nudgeField(key, -1);
            });

            panel.addEventListener('input', (e) => {
                const key = e.target && e.target.dataset ? e.target.dataset.key : null;
                if (!key) return;
                const field = fields.find((x) => x.key === key);
                if (!field) return;
                this.applyField(field);
                this.setJsonOutput(this.exportConfig());
            });

            document.body.appendChild(panel);
            this.panel = panel;
            this.applyBordersState();
            this.setJsonOutput(this.exportConfig());
        },
    };

    window.hudLayoutEditor = editor;
})();
