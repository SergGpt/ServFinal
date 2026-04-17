"use strict";
let peaceZones = require('./index');

let notifications = call('notifications');

module.exports = {
    "init": () => {
        peaceZones.init();
        inited(__dirname);
    },
    "peaceZones.add": (player, info) => {
        info = JSON.parse(info);
        peaceZones.add(info.x, info.y, info.z, info.dx, info.dy, info.dz);
    },
    "peaceZones.menu.save": async (player, info) => {
        if (!player || !player.character || player.character.admin < 6) return;
        let payload = null;
        try {
            payload = typeof info === 'string' ? JSON.parse(info) : info;
        } catch (e) {}
        if (!payload || !Array.isArray(payload.points) || payload.points.length < 3) {
            return notifications.error(player, "Для сохранения нужно минимум 3 точки", "Peace Zone");
        }

        const zone = await peaceZones.createPolygonZone(payload);
        if (!zone) return notifications.error(player, "Не удалось сохранить polygon-зону", "Peace Zone");

        notifications.success(player, `Зеленая зона сохранена в БД (ID: ${zone.id})`, "Peace Zone");
        player.call('peaceZones.menu.saved', [zone.id]);
    },
    "peaceZones.remove": (player, id) => {
        id = JSON.parse(id);
        if (id != null) {
            peaceZones.remove(player, id);
            notifications.info(player, "Зеленая зона удалена", "Удаление peace zone");
        }
        else {
            notifications.info(player, "Вы не находитесь в зеленой зоне", "Удаление peace zone");
        }
    },
    "playerEnterColshape": (player, shape) => {
        if (shape.zoneId) {
            notifications.info(player, "Вы вошли в зеленую зону", "Зеленая зона");
            player.call("peaceZones.inside", [shape.zoneId]);
        }
    },
    "playerExitColshape": (player, shape) => {
        if (shape.zoneId) {
            notifications.info(player, "Вы вышли из зеленой зоны", "Зеленая зона");
            player.call("peaceZones.inside", [null]);
        }
    },

}
