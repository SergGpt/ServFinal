var farmUi = new Vue({
    el: '#farmUi',
    data: {
        show: false,
        visible: false,
        tab: 'job',
        buyAmount: 1,
        selectedSeed: 'potato',
        info: {
            employed: false,
            level: 0,
            maxLevel: 20,
            progress: 0,
            seeds: 0,
            harvest: 0,
            toNext: 0,
            exchangeRate: 0,
            estimatedReward: 0,
            seedTypes: [],
            marketHistory: [],
        },
    },
    computed: {
        historyLabel() {
            var history = this.info.marketHistory || [];
            var values = history.slice(-8).map(function (item) { return '$' + item.rate; });
            return values.length ? values.join(' → ') : 'нет данных';
        },
    },
    methods: {
        open(payload) {
            this.update(payload);
            this.show = true;
            this.visible = true;
            if (!this.info.employed) this.tab = 'job';
        },
        update(payload) {
            var data = payload;
            if (typeof payload === 'string') {
                try { data = JSON.parse(payload); } catch (e) { data = {}; }
            }
            data = data || {};
            this.info = Object.assign({}, this.info, data);
            if (!this.info.seedTypes || !this.info.seedTypes.length) this.info.seedTypes = [];
            if (!this.selectedSeed && this.info.seedTypes[0]) this.selectedSeed = this.info.seedTypes[0].id;
            if (this.info.seedTypes[0] && !this.info.seedTypes.find(s => s.id === this.selectedSeed)) {
                this.selectedSeed = this.info.seedTypes[0].id;
            }
            mp.trigger('farms.seed.select', this.selectedSeed);
        },
        close() {
            this.visible = false;
            this.show = false;
            mp.trigger('farms.ui.closed');
        },
        toggleJob() {
            mp.trigger('callRemote', 'farms.employment');
        },
        selectSeed(seedId) {
            this.selectedSeed = seedId;
            mp.trigger('farms.seed.select', seedId);
        },
        changeAmount(delta) {
            this.buyAmount = Math.max(1, Math.min(100, this.buyAmount + delta));
        },
        buySeeds() {
            if (!this.selectedSeed) return;
            mp.trigger('callRemote', 'farms.seed.buy', JSON.stringify({
                seedId: this.selectedSeed,
                amount: Number(this.buyAmount) || 1,
            }));
        },
        sellHarvest() {
            mp.trigger('callRemote', 'farms.sell');
        },
    },
});
