export default new class MarketPlace {
    VIEW_NAME = "MajesticMarketplace"

    constructor() {
        this.register("openApp", this.openApp.bind(this));
        this.register("closeApp", this.closeApp.bind(this));

        this.register("open", this.open.bind(this));
        this.register("close", this.close.bind(this));

        this.register("setPage", this.setPage.bind(this));
        this.register("setMarketPage", this.setMarketPage.bind(this));
        this.register("create_lot", this.createLot.bind(this));
        this.register("prolong", this.prolong.bind(this));

        this.register("setItems", this.setItems.bind(this));
        this.register("updateItem", this.updateItem.bind(this))

        this.register("actions", this.actions.bind(this));
        this.register("selectItem", this.selectItem.bind(this));

        this.register("setModal", this.setModal.bind(this));
        this.register("edit_lot", this.editLot.bind(this));
        this.register("delete_lot", this.deleteLot.bind(this));
        this.register("set_favourite", this.setFavourite.bind(this));

        this.register("request", this.request.bind(this));
        this.register("resolve", this.resolve.bind(this));
        this.register("buy", this.buy.bind(this));
        this.register("unload", this.unload.bind(this));

        this.register("auction.setBet", this.setBet.bind(this));
        this.register("contactAuthor", this.contactAuthor.bind(this));

        // for majestic auction interior
        mp.game.streaming.requestIpl("q_auc_milo_");
    }
    
    register(eventName, callback) { mp.events.add("client.marketPlace." + eventName, callback); }
    callServer(eventName, ...args) { mp.events.callRemote("server.marketPlace." + eventName, ...args); }

    openApp() {
        this.callServer("openApp")
    }

    closeApp() {     
        mp.console.logInfo(`${this.modal}`);

        if (this.modal)
            return;

        this.callServer("closeApp")
    }

    currentPage = null
    setPage(pageName) {
        this.currentPage = pageName;
        this.callServer("setPage", pageName);
    }

    setMarketPage(pageName) {
        mp.gui.emmit(`window.marketPlace.setPage('${pageName}')`)
    }

    opened = false
    open() {
        const viewData = {};

        mp.gui.emmit(`window.router.setView('${this.VIEW_NAME}', '${JSON.stringify(viewData)}')`);
        global.menuOpen();

        this.opened = true;
    }

    close() {
        if (!this.opened)
            return;

        mp.gui.emmit(`window.router.setHud()`);
        global.menuClose();

        this.opened = false;
    }

    createLot(type, id, comment, title, price, hours, count, paymentType) {
        this.callServer("create_lot", type, id, comment, title, price, hours, count, paymentType);
    }

    editLot(id, comment, title, price) {
        this.callServer("edit_lot", id, comment, title, price);
    }
    
    deleteLot(id) {
        this.callServer("delete_lot", id);
    }

    selectItem(type, id) {
        this.callServer("selectItem", type, id);
    }

    setFavourite(type, id, subData) {
        this.callServer("set_favourite", type, id, subData);
    }

    request(type, data) {
        this.callServer("request", type, data);
    }

    buy(lotId, count, paymentType) {
        this.callServer("buy", lotId, count, paymentType);
    }

    setBet(lotId, multiplayer) {
        this.callServer("auction.setBet", lotId, multiplayer);
    }

    unload(lotId) {
        this.callServer("unload", lotId);
    }

    resolve(type, data) {
        mp.gui.emmit(`window.marketPlace.resolve_${type}(${data})`);
    }

    prolong(lotId, hours, paymentType) {
        console.log(hours);
        this.callServer("prolong", lotId, hours, paymentType);
    }

    async contactAuthor(type, phoneNumber) {
        this.closeApp();

        while (this.opened == true) {
            await global.wait(1);
        }

        mp.events.call("client.phone.open");

        setTimeout(() => {
            mp.gui.emmit(`window.hudStore.phoneContactNumber('${type}', ${phoneNumber})`);
        }, 100);
    }

    modal = null
    setModal(modalName) {
        this.modal = modalName;
    }

    setItems(type, items) {
        mp.console.logInfo(`${type}; ${items}`);
        mp.gui.emmit(`window.marketPlace.setItems('${type}', ${
            JSON.stringify(
                this.formatMarketItems(JSON.parse(items))
            )
        })`);
    }

    updateItem(type, id, data) {
        mp.gui.emmit(`window.marketPlace.updateItem('${type}', ${id}, ${JSON.stringify(this.formatMarketItem(JSON.parse(data)))})`)
    }

    formatMarketItems(list) {
        return list.map(x => this.formatMarketItem(x));
    }

    formatMarketItem(item) {
        if (item.params && item.params.hasOwnProperty("area") && item.params.hasOwnProperty("position"))
            item.params.area = global.getAreaName(item.params.position.x, item.params.position.y, item.params.position.z)

        return item;
    }

    actions(type, id, ...args) {
        if (type == "testdrive") {
            this.callServer("actions.testdrive", id);
        }
        
        if (type == "waypoint") {
            mp.game.ui.setNewWaypoint(args[0], args[1]);
            mp.events.call("notify", 1, 9, "Метка установлена!", 3000);
        }
    }
}