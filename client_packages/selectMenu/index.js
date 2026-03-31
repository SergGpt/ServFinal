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

        if (menuName === "clothesEditor") {
            if (eventName === "onItemValueChanged") {
                mp.events.call("clothes.editor.valueChanged", e.itemName, e.itemValue);
            } else if (eventName === "onItemSelected") {
                if (e.itemName === "Сохранить") mp.events.call("clothes.editor.action", "save");
                if (e.itemName === "Закрыть") mp.events.call("clothes.editor.action", "close");
            } else if (eventName === "onBackspacePressed" || eventName === "onEscapePressed") {
                mp.events.call("clothes.editor.action", "close");
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
