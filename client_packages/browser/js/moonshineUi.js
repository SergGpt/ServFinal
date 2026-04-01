var moonshineUi = new Vue({
    el: '#moonshineUi',
    data: {
        show: false,
        view: 'main',
        info: {
            employed: false,
            canJoin: true,
            currentJobName: null,
            activePlots: 0,
            maxPlots: 0,
            seeds: 0,
            seedPrice: 0,
            dailyLimit: 0,
            seedsRemaining: 0,
            skillPercent: 0,
        },
        buyAmount: 1,
        processing: false,
    },
    computed: {
        hasCurrentJob() {
            return !!(this.info.currentJobName && !this.info.employed);
        },
        canBuy() {
            const amount = Number(this.buyAmount) || 0;
            const remaining = Number(this.info.seedsRemaining) || 0;
            return amount > 0 && amount <= remaining && !this.processing;
        },
    },
    methods: {
        openMain(payload, tabName) {
            this.setInfo(payload);
            this.show = true;
            this.view = tabName === 'vendor' ? 'vendor' : 'main';
            this.processing = false;
        },
        openVendor(payload) {
            this.setInfo(payload);
            this.show = true;
            this.view = 'vendor';
            this.processing = false;
            this.buyAmount = 1;
        },
        update(payload) {
            this.setInfo(payload);
            if (this.view === 'vendor') {
                const remaining = Number(this.info.seedsRemaining) || 0;
                if ((Number(this.buyAmount) || 1) > remaining) this.buyAmount = Math.max(1, remaining);
            }
        },
        setInfo(payload) {
            var data = payload;
            if (typeof payload === 'string') {
                try {
                    data = JSON.parse(payload);
                } catch (e) {
                    data = {};
                }
            }
            data = data || {};
            this.info.employed = !!data.employed;
            this.info.canJoin = data.canJoin !== false;
            this.info.currentJobName = data.currentJobName || null;
            this.info.activePlots = Number(data.activePlots) || 0;
            this.info.maxPlots = Number(data.maxPlots) || 0;
            this.info.seeds = Number(data.seeds) || 0;
            this.info.seedPrice = Number(data.seedPrice) || 0;
            this.info.dailyLimit = Number(data.dailyLimit) || 0;
            this.info.seedsRemaining = Number(data.seedsRemaining) || 0;
            this.info.skillPercent = Number(data.skillPercent) || 0;
        },
        close() {
            this.show = false;
            this.processing = false;
            mp.trigger('moonshine.ui.closed');
        },
        switchView(view) {
            if (!this.show) return;
            this.view = view;
        },
        joinOrLeave() {
            if (this.processing) return;
            this.processing = true;
            if (this.info.employed) {
                mp.trigger('callRemote', 'moonshine.job.leave');
            } else {
                mp.trigger('callRemote', 'moonshine.job.join');
            }
            setTimeout(() => (this.processing = false), 500);
        },
        buySeeds() {
            if (!this.canBuy) return;
            const amount = Number(this.buyAmount) || 0;
            this.processing = true;
            mp.trigger('callRemote', 'moonshine.seed.buy', amount);
            setTimeout(() => (this.processing = false), 500);
        },
        addAmount(delta) {
            const remaining = Number(this.info.seedsRemaining) || 0;
            let next = (Number(this.buyAmount) || 1) + delta;
            next = Math.max(1, Math.min(remaining || 1, next));
            this.buyAmount = next;
        },
        handleKeyup(event) {
            if (!this.show) return;
            if (event.key === 'Escape' || event.keyCode === 27) this.close();
        },
        getNextLevelHint() {
            const skill = Number(this.info.skillPercent) || 0;
            if (skill < 30) return `До следующего уровня выхода осталось ${30 - skill}% (будет 2 бутылки).`;
            if (skill < 60) return `До следующего уровня выхода осталось ${60 - skill}% (будет 3 бутылки).`;
            return 'Максимальный уровень выхода достигнут: 3 бутылки.';
        },
    },
    mounted() {
        window.addEventListener('keyup', this.handleKeyup);
    },
});
