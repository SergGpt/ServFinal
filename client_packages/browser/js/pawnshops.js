var pawnshop = new Vue({
    el: '#pawnshop',
    data: {
        show: false,
        title: 'Скупщик',
        brokerId: null,
        summary: {
            totalCount: 0,
            totalValue: 0,
            nextPrice: 0,
        },
        items: [],
        processing: false,
    },
    computed: {
        hasItems() {
            return this.items.length > 0;
        },
        hasSellable() {
            return this.items.some(item => item.canSell);
        },
        totalValueFormatted() {
            return this.formatMoney(this.summary.totalValue);
        },
        totalCountFormatted() {
            return `${this.summary.totalCount} шт.`;
        },
        nextPriceFormatted() {
            return this.formatMoney(this.summary.nextPrice);
        }
    },
    methods: {
        open(payload) {
            this.setData(payload);
            this.show = true;
        },
        setData(payload) {
            let data = payload;
            if (typeof payload === 'string') {
                try {
                    data = JSON.parse(payload);
                } catch (e) {
                    console.error('[Pawnshop] Failed to parse payload', e);
                    data = {};
                }
            }

            data = data || {};
            this.brokerId = data.id || null;
            this.title = data.title || 'Скупщик';
            this.summary.totalCount = Number(data.totalCount) || 0;
            this.summary.totalValue = Number(data.totalValue) || 0;
            this.summary.nextPrice = Number(data.nextPrice) || 0;

            if (Array.isArray(data.items)) {
                const prepared = data.items.map((item, index) => {
                    const count = Number(item.count) || 0;
                    const price = Number(item.price) || 0;
                    const total = item.totalPrice != null ? Number(item.totalPrice) : count * price;
                    const itemId = item.itemId != null && !isNaN(item.itemId) ? Number(item.itemId) : null;
                    const resolved = item.resolved !== false && itemId != null;
                    return {
                        key: itemId != null ? `id-${itemId}` : `idx-${index}`,
                        name: item.name || 'Предмет',
                        count,
                        price,
                        total,
                        itemId,
                        resolved,
                        canSell: resolved && count > 0,
                    };
                }).filter(item => item.count > 0);
                this.items = prepared;
            } else {
                this.items = [];
            }
        },
        setProcessing(state) {
            this.processing = !!state;
        },
        requestClose() {
            if (this.processing) return;
            mp.trigger('pawnshops.ui.close');
        },
        close() {
            this.show = false;
            this.brokerId = null;
            this.items = [];
            this.processing = false;
            this.summary.totalCount = 0;
            this.summary.totalValue = 0;
            this.summary.nextPrice = 0;
        },
        sell(item) {
            if (this.processing || !item || !item.canSell) return;
            if (item.itemId == null) return;
            mp.trigger('pawnshops.ui.sell.item', item.itemId);
        },
        sellOne() {
            if (this.processing || !this.summary.totalCount) return;
            mp.trigger('pawnshops.ui.sell.one');
        },
        sellAll() {
            if (this.processing || !this.summary.totalCount) return;
            mp.trigger('pawnshops.ui.sell.all');
        },
        formatMoney(value) {
            const amount = Number(value) || 0;
            if (typeof prettyMoney === 'function') {
                return `$ ${prettyMoney(Math.round(amount))}`;
            }
            return `$ ${amount}`;
        },
        handleKeyup(event) {
            if (!this.show) return;
            if (event.key === 'Escape' || event.keyCode === 27) {
                this.requestClose();
            }
        },
    },
    mounted() {
        window.addEventListener('keyup', this.handleKeyup);
    }
});
