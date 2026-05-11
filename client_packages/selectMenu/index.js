"use strict";

// ************** События взаимодействия с меню **************

// Вызов события необходимо прописать в [CEF] selectMenu.menu.handler(), если в этом есть необходимость.
mp.events.add({
    "selectMenu.handler": (menuName, eventName, e) => {
        e = JSON.parse(e);
        
        // Обработка событий для меню собак
        if (menuName === "dogMenu") {
            switch(eventName) {
                case "husky":
                    mp.events.call("dog.buy", "husky");
                    break;
                case "shepherd":
                    mp.events.call("dog.buy", "shepherd");
                    break;
                case "rottweiler":
                    mp.events.call("dog.buy", "rottweiler");
                    break;
                case "labrador":
                    mp.events.call("dog.buy", "labrador");
                    break;
                case "bulldog":
                    mp.events.call("dog.buy", "bulldog");
                    break;
                case "close":
                    mp.events.call("dog.menu.close");
                    break;
            }
        }

        if (menuName === "carShowSetup" && eventName === "onItemSelected") {
            if (e.itemName === "Поставить вход") {
                mp.events.call("carshow.setup.action", "entry");
            } else if (e.itemName === "Поставить выход / выдачу авто") {
                mp.events.call("carshow.setup.action", "return");
            } else if (e.itemName === "Поставить точку показа авто") {
                mp.events.call("carshow.setup.action", "display");
            } else if (e.itemName === "Поставить камеру") {
                mp.events.call("carshow.setup.action", "camera");
            } else if (e.itemName === "Закрыть") {
                mp.events.call("carshow.setup.action", "close");
            }
        }

        if (menuName === "moonshineSetup" && eventName === "onItemSelected") {
            if (e.itemName === "Поставить точку меню работы") {
                mp.events.call("moonshine.setup.action", "menu");
            } else if (e.itemName === "Поставить точку продавца семян") {
                mp.events.call("moonshine.setup.action", "vendor");
            } else if (e.itemName === "Поставить точку аппарата") {
                mp.events.call("moonshine.setup.action", "craft");
            } else if (e.itemName === "Добавить грядку в текущей точке") {
                mp.events.call("moonshine.setup.action", "plot");
            } else if (e.itemName === "Закрыть") {
                mp.events.call("moonshine.setup.action", "close");
            }
        }


        if (menuName === "cargoRouteAdmin" && eventName === "onItemSelected") {
            if (e.itemName === "Создать маршрут (погрузка тут)") {
                mp.events.callRemote("cargo.admin.route.create");
            } else if (e.itemName === "Добавить точку доставки") {
                if (!e.itemValue || e.itemValue === "Нет маршрутов") return mp.events.call("selectMenu.notification", "Сначала создайте маршрут");
                const match = e.itemValue.match(/^#(\d+)/);
                if (!match) return mp.events.call("selectMenu.notification", "Маршрут не выбран");
                mp.events.callRemote("cargo.admin.route.dropoff.add", parseInt(match[1]));
            } else if (e.itemName === "Обновить список") {
                mp.events.callRemote("cargo.admin.routes.refresh");
            } else if (e.itemName === "Закрыть") {
                mp.events.call("selectMenu.hide");
            }
        }
        
        // TODO: Обработка других событий меню...
    },

    
    "selectMenu.show": (menuName) => {
        mp.callCEFV(`selectMenu.showByName(\`${menuName}\`)`);
    },
    "selectMenu.hide": () => {
        mp.callCEFV(`selectMenu.show = false`);
    },
    "selectMenu.loader": (enable) => {
        mp.callCEFV(`selectMenu.loader = ${enable}`);
    },
    "selectMenu.notification": (text) => {
        mp.callCEFV(`selectMenu.notification = \`${text}\``);
    },
    "selectMenu.focusSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "NAV_UP_DOWN", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },
    "selectMenu.backSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "CANCEL", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },
    "selectMenu.selectSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "SELECT", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },

    "selectMenu.show": (menuName) => {
        mp.callCEFV(`selectMenu.showByName(\`${menuName}\`)`);
    },
    "selectMenu.hide": () => {
        mp.callCEFV(`selectMenu.show = false`);
    },
    "selectMenu.loader": (enable) => {
        mp.callCEFV(`selectMenu.loader = ${enable}`);
    },
    "selectMenu.notification": (text) => {
        mp.callCEFV(`selectMenu.notification = \`${text}\``);
    },
    "selectMenu.focusSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "NAV_UP_DOWN", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },
    "selectMenu.backSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "CANCEL", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },
    "selectMenu.selectSound.play": () => {
        mp.game.audio.playSoundFrontend(-1, "SELECT", "HUD_FRONTEND_DEFAULT_SOUNDSET", true);
    },
});
