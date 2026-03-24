var dogShop = new Vue({
    el: "#dogshop",
    data: {
        show: false,
        title: "Магазин собак",
        list: [] // список собак
    },
    methods: {
        // Заполнение списка собак
        setDogs(list) {
            this.list = list;
            this.show = true; // открываем магазин сразу
        },
        // Покупка собаки
        buy(id) {
            const dog = this.list.find(d => d.id === id);
            if(dog) mp.trigger("dogshop.buyDog", dog.type);
        },
        // Закрытие магазина
        close() {
            this.show = false;
            mp.trigger("dogshop.exit");
        }
    }
});

// CEF listener для открытия/закрытия
mp.events.add("showDogShopCEF", (list = []) => {
    if(list.length > 0) dogShop.setDogs(list);
    else dogShop.show = false;
});
