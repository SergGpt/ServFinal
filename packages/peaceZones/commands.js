let peaceZoneService = require('./index.js');

module.exports = {
    "/peacezoneadd": {
        description: "Создать зеленую зону",
        args: "",
        access: 6,
        handler: (player, args) => {
            player.call('peaceZones.add', []);
        }
    },
    "/peacezoneremove": {
        description: "Удалить зеленую зону",
        args: "",
        access: 6,
        handler: (player, args) => {
            player.call('peaceZones.remove', []);
        }
    },
    "/peacezoneaddclose": {
        description: "Остановить создание зеленой зоны",
        args: "",
        access: 6,
        handler: (player, args) => {
            player.call('peaceZones.addClose', []);
        }
    },
    "/peacezonesetup": {
        description: "Настройка polygon-зоны через select menu",
        args: "",
        access: 6,
        handler: (player) => {
            player.call('peaceZones.menu.show');
        }
    },
    "/peacezoneshow": {
        description: "Показать зеленые зоны",
        args: "",
        access: 6,
        handler: (player, args) => {
            if (peaceZoneService.markers.length === 0) {
                peaceZoneService.showDots();
            }
            else {
                peaceZoneService.hideDots();
            }
        }
    },
};
