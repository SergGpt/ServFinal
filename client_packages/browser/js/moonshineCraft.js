var moonshineCraft = new Vue({
    el: '#moonshineCraft',
    data: {
        show: false,
        recipe: {
            skillPercent: 0,
            output: 1,
            outputLabel: '1 бутылка',
            cane: 0,
            bottles: 0,
            caneRequired: 3,
            bottlesRequired: 1,
        },
        processing: false,
        statusMessage: '',
        sessionId: null,
        duration: 0,
        progress: 0,
        progressTimer: null,
    },
    computed: {
        canCraft() {
            return (
                this.recipe.cane >= this.recipe.caneRequired &&
                this.recipe.bottles >= this.recipe.bottlesRequired
            );
        },
        progressPercent() {
            return Math.min(100, Math.max(0, Math.round(this.progress * 100)));
        },
    },
    methods: {
        open(payload) {
            this.setData(payload);
            this.statusMessage = '';
            this.show = true;
        },
        update(payload) {
            this.setData(payload);
        },
        setData(payload) {
            let data = payload;
            if (typeof payload === 'string') {
                try {
                    data = JSON.parse(payload);
                } catch (e) {
                    data = {};
                }
            }
            data = data || {};
            this.recipe.skillPercent = Number(data.skillPercent) || 0;
            this.recipe.output = Number(data.output) || 1;
            this.recipe.outputLabel = this.recipe.output === 1 ? '1 бутылка' : `${this.recipe.output} бутылки`;
            this.recipe.cane = Number(data.cane) || 0;
            this.recipe.bottles = Number(data.bottles) || 0;
            this.recipe.caneRequired = Number(data.caneRequired) || 3;
            this.recipe.bottlesRequired = Number(data.bottlesRequired) || 1;
            if (data.state === 'processing' && !this.processing) {
                this.processing = true;
            }
            if (data.state !== 'processing' && this.processing && !this.sessionId) {
                this.processing = false;
            }
        },
        start(payload) {
            let data = payload;
            if (typeof payload === 'string') {
                try {
                    data = JSON.parse(payload);
                } catch (e) {
                    data = {};
                }
            }
            if (!data) data = {};
            this.processing = true;
            this.sessionId = data.sessionId || null;
            this.duration = Number(data.duration) || 0;
            this.progress = 0;
            this.statusMessage = 'Варка...' ;
            this.startProgress();
        },
        finish(payload) {
            let data = payload;
            if (typeof payload === 'string') {
                try {
                    data = JSON.parse(payload);
                } catch (e) {
                    data = {};
                }
            }
            if (!data) data = {};
            this.stopProgress();
            this.processing = false;
            this.sessionId = null;
            if (data.success) {
                const amount = Number(data.amount) || this.recipe.output;
                this.statusMessage = `Готово: ${amount} шт.`;
            } else {
                this.statusMessage = data.message || 'Процесс прерван';
            }
        },
        cancel() {
            if (!this.processing) {
                this.hide(true);
                return;
            }
            mp.trigger('moonshine.craft.ui.cancel');
        },
        brew() {
            if (!this.canCraft || this.processing) return;
            this.statusMessage = 'Подготовка...';
            mp.trigger('moonshine.craft.ui.start.request');
        },
        closeWindow() {
            this.hide(false);
        },
        hide(force) {
            if (this.processing && !force) return;
            this.stopProgress();
            this.processing = false;
            this.sessionId = null;
            this.statusMessage = '';
            this.show = false;
        },
        startProgress() {
            this.stopProgress();
            if (!this.duration || this.duration <= 0) return;
            const start = Date.now();
            this.progressTimer = setInterval(() => {
                const elapsed = Date.now() - start;
                this.progress = Math.min(1, elapsed / this.duration);
                if (elapsed >= this.duration) {
                    this.stopProgress();
                }
            }, 100);
        },
        stopProgress() {
            if (this.progressTimer) {
                clearInterval(this.progressTimer);
                this.progressTimer = null;
            }
            this.progress = 0;
        },
        handleKeyup(event) {
            if (!this.show) return;
            if (event.key === 'Escape' || event.keyCode === 27) {
                this.cancel();
            }
        },
    },
    mounted() {
        window.addEventListener('keyup', this.handleKeyup);
    }
});
