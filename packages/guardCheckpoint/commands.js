"use strict";

const { controller } = require("./index");

function isAdmin(player, out) {
    if (!player || !player.character || player.character.admin < 5) {
        if (out && player) out.error("Недостаточно прав", player);
        return false;
    }
    return true;
}

function zoneFromPlayer(player, type, radius) {
    if (type === "polygon") {
        return {
            type: "polygon",
            points: [],
            minZ: player.position.z - 2,
            maxZ: player.position.z + 4,
        };
    }

    return {
        type: "sphere",
        center: { x: player.position.x, y: player.position.y, z: player.position.z },
        radius: Math.max(1, Number(radius) || 5),
    };
}

module.exports = {
    "/gcp.create": {
        access: 5,
        description: "Создать пост guardCheckpoint",
        args: "[postId]:s",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            const postId = String(args[0] || "").trim();
            if (!postId) return out.error("Укажите postId", player);

            const pos = player.position;
            const basePost = {
                id: postId,
                name: `Checkpoint ${postId}`,
                dimension: Number(player.dimension) || 0,
                guardZone: zoneFromPlayer(player, "sphere", 45),
                postZone: zoneFromPlayer(player, "sphere", 45),
                pursuitZone: zoneFromPlayer(player, "sphere", 65),
                stopZone: zoneFromPlayer(player, "sphere", 5),
                violationZone: zoneFromPlayer(player, "sphere", 3),
                warnDistance: 20,
                checkDurationMs: 5000,
                maxChaseDistance: 30,
                leader: {
                    id: "leader",
                    model: "s_m_y_marine_01",
                    heading: Number(player.heading) || 0,
                    weaponHash: "WEAPON_CARBINERIFLE",
                    spawn: { x: pos.x + 1.2, y: pos.y, z: pos.z },
                },
                guards: [],
                warningUi: {
                    text: "ОХРАНА: Стой! В зону досмотра!",
                    soundName: "5s",
                    soundSet: "MP_MISSION_COUNTDOWN_SOUNDSET",
                },
            };

            await controller.createOrReplacePost(basePost);
            out.info(`guardCheckpoint ${postId} создан и сохранён в БД`, player);
            player.call("selectMenu.notification", [`GCP ${postId}: created`]);
        },
    },

    "/gcp.zone": {
        access: 5,
        description: "Настроить зону поста (sphere/polygon)",
        args: "[postId]:s [zoneKey]:s [sphere|polygon]:s [radius]:n",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            const postId = String(args[0] || "");
            const zoneKey = String(args[1] || "");
            const type = String(args[2] || "sphere");
            const radius = Number(args[3]) || 5;

            if (!["postZone", "guardZone", "pursuitZone", "stopZone", "violationZone"].includes(zoneKey)) {
                return out.error("zoneKey: postZone|guardZone|pursuitZone|stopZone|violationZone", player);
            }

            const zoneData = zoneFromPlayer(player, type, radius);
            const ok = await controller.updateZone(postId, zoneKey, zoneData);
            if (!ok) return out.error("Пост не найден", player);
            out.info(`Обновлена ${zoneKey} (${type}) для ${postId}`, player);
            player.call("selectMenu.notification", [`${postId}: ${zoneKey}=${type}`]);
        },
    },

    "/gcp.polyadd": {
        access: 5,
        description: "Добавить точку polygon-зоны (по позиции игрока)",
        args: "[postId]:s [zoneKey]:s",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            const post = controller.getPost(args[0]);
            if (!post) return out.error("Пост не найден", player);
            const zoneKey = String(args[1] || "");
            const zone = post.cfg[zoneKey];
            if (!zone || String(zone.type) !== "polygon") return out.error("Зона не polygon", player);

            zone.points = Array.isArray(zone.points) ? zone.points : [];
            zone.points.push({ x: player.position.x, y: player.position.y, z: player.position.z });
            if (zone.points.length >= 4) {
                zone.minZ = Math.min(...zone.points.map((p) => p.z)) - 1;
                zone.maxZ = Math.max(...zone.points.map((p) => p.z)) + 2;
            }

            await controller.updateZone(post.id, zoneKey, zone);
            out.info(`${post.id}/${zoneKey}: точек ${zone.points.length}`, player);
            player.call("selectMenu.notification", [`${post.id}/${zoneKey}: point ${zone.points.length}`]);
        },
    },

    "/gcp.setleader": {
        access: 5,
        description: "Поставить лидера на текущую позицию",
        args: "[postId]:s [model]:s [weapon]:s",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            const postId = String(args[0] || "");
            const npcData = {
                id: "leader",
                model: String(args[1] || "s_m_y_marine_01"),
                heading: Number(player.heading) || 0,
                weaponHash: String(args[2] || "WEAPON_CARBINERIFLE"),
                spawn: { x: player.position.x, y: player.position.y, z: player.position.z },
            };
            const ok = await controller.updateLeader(postId, npcData);
            if (!ok) return out.error("Пост не найден", player);
            out.info(`Лидер для ${postId} обновлен`, player);
        },
    },

    "/gcp.addguard": {
        access: 5,
        description: "Добавить guard на текущей позиции",
        args: "[postId]:s [model]:s [weapon]:s",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            const postId = String(args[0] || "");
            const guardId = `guard_${Date.now()}`;
            const npcData = {
                id: guardId,
                model: String(args[1] || "s_m_y_marine_01"),
                heading: Number(player.heading) || 0,
                weaponHash: String(args[2] || "WEAPON_CARBINERIFLE"),
                spawn: { x: player.position.x, y: player.position.y, z: player.position.z },
            };
            const ok = await controller.addGuard(postId, npcData);
            if (!ok) return out.error("Пост не найден", player);
            out.info(`Guard добавлен в ${postId}`, player);
        },
    },

    "/gcp.reload": {
        access: 5,
        description: "Перезагрузить посты guardCheckpoint из БД",
        args: "",
        handler: async (player, args, out) => {
            if (!isAdmin(player, out)) return;
            await controller.reloadFromDb();
            out.info("guardCheckpoint перезагружен из БД", player);
        },
    },
};
