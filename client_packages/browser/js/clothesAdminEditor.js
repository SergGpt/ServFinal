(function () {
    const TYPES = ['tops', 'pants', 'shoes', 'bags', 'hats', 'glasses', 'ears', 'watches', 'bracelets', 'ties'];

    function toArray(value) {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return value.split(',').map(v => parseInt(v.trim())).filter(v => Number.isFinite(v));
            }
        }
        return [];
    }

    function parseJsonFromInput(value, fallback) {
        if (!value || !value.trim()) return fallback;
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function createEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    const editor = {
        show: false,
        data: {},
        rows: [],
        page: 1,
        pages: 1,
        total: 0,
        selectedSex: 1,
        selectedType: 'tops',
        selectedId: null,
        isNew: false,
        formData: {},

        ensureMounted() {
            if (this.root) return;

            this.root = createEl('div', 'clothes-editor-root');
            this.root.style.display = 'none';

            this.root.innerHTML = `
                <div class="clothes-editor-overlay"></div>
                <div class="clothes-editor-window">
                    <div class="clothes-editor-header">
                        <div>
                            <div class="title">Редактор одежды (админ)</div>
                            <div class="subtitle">Редактирование таблиц + предпросмотр на персонаже</div>
                        </div>
                        <div class="actions">
                            <button class="ce-btn ce-btn-secondary" data-action="cam-left">◀</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-right">▶</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-up">▲</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-down">▼</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-zoom-in">＋</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-zoom-out">－</button>
                            <button class="ce-btn ce-btn-secondary" data-action="cam-reset">Камера</button>
                            <button class="ce-btn ce-btn-secondary" data-action="refresh">Обновить из БД</button>
                            <button class="ce-btn ce-btn-danger" data-action="close">Закрыть</button>
                        </div>
                    </div>
                    <div class="clothes-editor-content">
                        <div class="clothes-editor-sidebar">
                            <div class="filters">
                                <label>Пол</label>
                                <select data-field="sex">
                                    <option value="1">Мужской</option>
                                    <option value="0">Женский</option>
                                </select>
                                <label>Тип</label>
                                <select data-field="type"></select>
                                <label>Поиск</label>
                                <input type="text" data-field="search" placeholder="id / название" />
                            </div>
                            <div class="list" data-list="items"></div>
                            <button class="ce-btn ce-btn-primary" data-action="new">+ Новая запись</button>
                        </div>
                        <div class="clothes-editor-form" data-form="body"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(this.root);

            const typeSelect = this.root.querySelector('[data-field="type"]');
            TYPES.forEach((type) => {
                const option = createEl('option', null, type);
                option.value = type;
                typeSelect.appendChild(option);
            });

            this.root.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-action]');
                if (!button) return;
                const action = button.getAttribute('data-action');
                if (action === 'close') return this.close();
                if (action === 'cam-left') return mp.trigger('clothes.editor.camera.step', 'left');
                if (action === 'cam-right') return mp.trigger('clothes.editor.camera.step', 'right');
                if (action === 'cam-up') return mp.trigger('clothes.editor.camera.step', 'up');
                if (action === 'cam-down') return mp.trigger('clothes.editor.camera.step', 'down');
                if (action === 'cam-zoom-in') return mp.trigger('clothes.editor.camera.step', 'zoom_in');
                if (action === 'cam-zoom-out') return mp.trigger('clothes.editor.camera.step', 'zoom_out');
                if (action === 'cam-reset') return mp.trigger('clothes.editor.camera.step', 'reset');
                if (action === 'refresh') return this.requestPage(1);
                if (action === 'new') return this.createNew();
                if (action === 'save') return this.save();
                if (action === 'preview') return this.previewCurrent();
                if (action === 'reset') return this.resetPreview();
            });

            this.root.querySelector('[data-field="sex"]').addEventListener('change', (event) => {
                this.selectedSex = parseInt(event.target.value);
                this.selectedId = null;
                this.isNew = false;
                this.requestPage(1);
            });

            this.root.querySelector('[data-field="type"]').addEventListener('change', (event) => {
                this.selectedType = event.target.value;
                this.selectedId = null;
                this.isNew = false;
                this.requestPage(1);
            });

            this.root.querySelector('[data-field="search"]').addEventListener('input', () => this.requestPage(1));
        },

        open(data) {
            this.ensureMounted();
            this.show = true;
            this.root.style.display = 'block';
            this.setData(data || {});
            this.requestPage(1);
        },

        close() {
            if (!this.root) return;
            this.show = false;
            this.root.style.display = 'none';
            this.selectedId = null;
            this.isNew = false;
            mp.trigger('clothes.editor.close');
        },

        setData(data) {
            if (data && Array.isArray(data.items)) {
                this.rows = data.items;
                this.page = data.page || 1;
                this.pages = data.pages || 1;
                this.total = data.total || this.rows.length;
            } else {
                this.data = data || {};
                this.rows = this.getCurrentList();
            }
            this.renderList();
            this.renderForm();
        },

        requestPage(page) {
            const search = (this.root && this.root.querySelector('[data-field="search"]'))
                ? (this.root.querySelector('[data-field="search"]').value || '')
                : '';
            mp.trigger('clothes.editor.requestData', JSON.stringify({
                sex: this.selectedSex,
                type: this.selectedType,
                page: page || 1,
                search,
            }));
        },

        getCurrentList() {
            if (Array.isArray(this.rows) && this.rows.length) return this.rows;
            const bySex = this.data[this.selectedSex] || {};
            return bySex[this.selectedType] || [];
        },

        getSelectedItem() {
            if (this.isNew) return this.formData;
            const list = this.getCurrentList();
            return list.find(x => x.id === this.selectedId) || null;
        },

        selectItem(id) {
            this.selectedId = id;
            this.isNew = false;
            const item = this.getSelectedItem();
            this.formData = item ? JSON.parse(JSON.stringify(item)) : {};
            this.renderList();
            this.renderForm();
            this.previewCurrent();
        },

        createDefaultEntry() {
            const base = {
                name: 'new_item',
                variation: 0,
                price: 1,
                textures: [0],
                sex: this.selectedSex,
                class: 1,
            };
            if (this.selectedType === 'tops') Object.assign(base, { torso: 0, undershirt: 0, uTextures: [0], pockets: [2, 2], clime: [-10, 45] });
            if (this.selectedType === 'pants' || this.selectedType === 'shoes') Object.assign(base, { pockets: [2, 2], clime: [-10, 45] });
            if (this.selectedType === 'hats') Object.assign(base, { clime: [-10, 45] });
            if (this.selectedType === 'bags') Object.assign(base, { capacity: 0 });
            return base;
        },

        createNew() {
            this.isNew = true;
            this.selectedId = null;
            this.formData = this.createDefaultEntry();
            this.renderList();
            this.renderForm();
            this.previewCurrent();
        },

        renderList() {
            if (!this.root) return;
            const container = this.root.querySelector('[data-list="items"]');
            container.innerHTML = '';

            const search = (this.root.querySelector('[data-field="search"]').value || '').trim().toLowerCase();
            const rows = this.getCurrentList().filter((item) => {
                if (!search) return true;
                return String(item.id).includes(search) || String(item.name || '').toLowerCase().includes(search);
            });

            if (!rows.length) {
                container.appendChild(createEl('div', 'empty', 'Нет записей для выбранного фильтра'));
                return;
            }

            rows.forEach((item) => {
                const row = createEl('div', 'row');
                if (!this.isNew && item.id === this.selectedId) row.classList.add('active');
                row.innerHTML = `<b>#${item.id}</b> ${item.name || 'Без названия'} <span>var:${item.variation}</span>`;
                row.addEventListener('click', () => this.selectItem(item.id));
                container.appendChild(row);
            });
        },

        makeField(labelText, key, value) {
            const wrapper = createEl('div', 'field');
            const label = createEl('label', null, labelText);
            wrapper.appendChild(label);

            const isJson = ['textures', 'uTextures', 'pockets', 'clime'].includes(key);
            const input = isJson ? document.createElement('textarea') : document.createElement('input');
            input.setAttribute('data-key', key);
            input.value = isJson ? JSON.stringify(value != null ? value : []) : (value != null ? value : '');
            wrapper.appendChild(input);
            return wrapper;
        },

        collectFormData() {
            const result = {};
            const fields = this.root.querySelectorAll('.clothes-editor-form [data-key]');
            fields.forEach((field) => {
                const key = field.getAttribute('data-key');
                const value = field.value;
                if (['variation', 'price', 'sex', 'class', 'torso', 'undershirt', 'capacity', 'id'].includes(key)) {
                    result[key] = parseInt(value) || 0;
                } else if (['textures', 'uTextures', 'pockets', 'clime'].includes(key)) {
                    result[key] = parseJsonFromInput(value, []);
                } else {
                    result[key] = value;
                }
            });

            if (!result.textures || !result.textures.length) result.textures = [0];
            if (this.selectedType === 'tops' && (!result.uTextures || !result.uTextures.length)) result.uTextures = [0];
            return result;
        },

        getTextureForPreview(data) {
            const arr = toArray(data.textures);
            if (!arr.length) return 0;
            return parseInt(arr[0]) || 0;
        },

        getTopUTextureForPreview(data) {
            const arr = toArray(data.uTextures);
            if (!arr.length) return 0;
            return parseInt(arr[0]) || 0;
        },

        previewCurrent() {
            const data = this.collectFormData();
            data.type = this.selectedType;
            data.texture = this.getTextureForPreview(data);
            if (this.selectedType === 'tops') {
                data.uTexture = this.getTopUTextureForPreview(data);
                data.tTexture = 0;
            }
            mp.trigger('clothes.editor.preview', JSON.stringify(data));
        },

        resetPreview() {
            mp.trigger('clothes.editor.restore');
        },

        save() {
            const data = this.collectFormData();
            data.sex = parseInt(data.sex);

            const payload = {
                mode: this.isNew ? 'create' : 'update',
                type: this.selectedType,
                id: this.isNew ? null : this.selectedId,
                data,
            };
            mp.trigger('clothes.editor.save', JSON.stringify(payload));
        },

        renderForm() {
            if (!this.root) return;
            const form = this.root.querySelector('[data-form="body"]');
            form.innerHTML = '';

            const item = this.getSelectedItem();
            if (!item) {
                form.appendChild(createEl('div', 'empty', 'Выберите запись из списка или создайте новую.'));
                return;
            }

            const title = createEl('div', 'form-title', this.isNew ? `Новая запись (${this.selectedType})` : `Редактирование #${item.id}`);
            form.appendChild(title);

            const keys = Object.keys(item).filter(k => k !== 'type').sort((a, b) => {
                if (a === 'id') return -1;
                if (b === 'id') return 1;
                return a.localeCompare(b);
            });

            keys.forEach((key) => {
                if (key === 'id' && this.isNew) return;
                form.appendChild(this.makeField(key, key, item[key]));
            });

            const actions = createEl('div', 'form-actions');
            actions.innerHTML = `
                <button class="ce-btn ce-btn-secondary" data-action="preview">Предпросмотр</button>
                <button class="ce-btn ce-btn-secondary" data-action="reset">Сбросить вид</button>
                <button class="ce-btn ce-btn-primary" data-action="save">Сохранить</button>
            `;
            form.appendChild(actions);
        },
    };

    window.clothesAdminEditor = editor;
})();
