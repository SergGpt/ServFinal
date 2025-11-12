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
        canUseNow: false,
        useInProgress: false,
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
            this.canUseNow = false;
            this.useInProgress = false;
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
            this.canUseNow = false;
            this.useInProgress = false;
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
                this.statusMessage = `Скрафчено 303×${amount}`;
                this.canUseNow = amount > 0;
            } else {
                this.statusMessage = data.message || 'Процесс прерван';
                this.canUseNow = false;
            }
            this.useInProgress = false;
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
            this.canUseNow = false;
            this.useInProgress = false;
            this.show = false;
            if (!force) {
                mp.trigger('moonshine.craft.ui.closed');
            }
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
        useNow() {
            if (this.processing || this.useInProgress) return;
            this.useInProgress = true;
            this.canUseNow = false;
            mp.trigger('callRemote', 'moonshine:drink');
            setTimeout(() => {
                this.useInProgress = false;
            }, 1500);
        },
    },
    mounted() {
        window.addEventListener('keyup', this.handleKeyup);
    }
});
