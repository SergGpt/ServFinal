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
