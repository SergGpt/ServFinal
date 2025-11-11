var selectionWindow = new Vue({
    el: "#selection-window",
    data: {
        show: false,
        name: '',
        header: 'Выбор',
        description: '',
        leftWord: 'Выбрать',
        rightWord: 'Закрыть',
        records: [],
        selected: null,
        acceptEvent: null,
        cancelEvent: null,
    },
    methods: {
        select(record) {
            if (!record || record.disabled) return;
            this.selected = record;
        },
        accept() {
            if (!this.selected || this.selected.disabled) return;
            const windowName = this.name;
            const payload = this.selected.value != null ? this.selected.value : this.selected.text;
            this.close();
            if (this.acceptEvent) mp.trigger(this.acceptEvent, windowName, payload);
        },
        decline() {
            const windowName = this.name;
            this.close();
            if (this.cancelEvent) mp.trigger(this.cancelEvent, windowName);
        },
        open(name, config) {
            this.name = name || '';
            this.applyConfig(config, null);
            this.show = true;
        },
        update(name, config) {
            if (name && name !== this.name) return;
            const preserved = this.selected ? this.selected.value : null;
            this.applyConfig(config, preserved);
        },
        applyConfig(config, preservedValue) {
            config = config || {};
            this.header = config.header || 'Выбор';
            this.description = config.description || '';
            this.leftWord = config.leftWord || 'Выбрать';
            this.rightWord = config.rightWord || 'Закрыть';
            this.acceptEvent = config.acceptEvent || null;
            this.cancelEvent = config.cancelEvent || null;

            const records = Array.isArray(config.records) ? config.records : [];
            this.records = records.map((record) => {
                const text = record.text || '';
                const value = record.value != null ? record.value : text;
                const description = record.description || '';
                const disabled = Boolean(record.disabled);
                return Object.assign({}, record, { text, value, description, disabled });
            });

            const availableRecord = preservedValue != null
                ? this.records.find((record) => record.value === preservedValue && !record.disabled)
                : null;
            this.selected = availableRecord || this.records.find((record) => !record.disabled) || null;
        },
        close(name) {
            if (name && name !== this.name) return;
            this.show = false;
        },
    },
    watch: {
        show(val) {
            if (val) {
                busy.add('selectionWindow', true, true);
                setCursor(true);
            } else {
                setCursor(false);
                busy.remove('selectionWindow', true);
                this.name = '';
                this.header = 'Выбор';
                this.description = '';
                this.leftWord = 'Выбрать';
                this.rightWord = 'Закрыть';
                this.records = [];
                this.selected = null;
                this.acceptEvent = null;
                this.cancelEvent = null;
            }
        }
    }
});

// selectionWindow.open('test', { header: 'Заголовок', records: [{ text: 'Вариант' }] });
