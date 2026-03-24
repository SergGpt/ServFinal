var shop = new Vue({
    el: "#shop",
    data: {
        show: false,
        title: "Супермаркет",
        focus: "products",
        pages: {
            products: {
                title: "Продукты",
                img: "img/shop/market.svg",
                list: [],
            },
            other: {
                title: "Прочее",
                img: "img/shop/dots.svg",
                list: [],
            }
        }
    },
    methods: {
        addProducts(page, list) {
            if (this.pages[page])
                this.pages[page].list = list;
        },
        buy(id) {
            mp.trigger('callRemote', 'supermarket.products.buy', id);
        },
        setTitle(title) {
            this.title = title;
        },
        close() {
            mp.trigger('supermarket.exit');
        },
        focusCategory(category) { // метод для смены фокуса
            if (this.pages[category]) {
                this.focus = category;
            }
        }
    }
});
