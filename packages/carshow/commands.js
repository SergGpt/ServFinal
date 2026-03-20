var carshow = require('./index.js');

function getPointByHeading(position, heading, forward, right = 0, up = 0) {
    const rad = heading * Math.PI / 180;
    const forwardX = Math.sin(rad);
    const forwardY = Math.cos(rad);
    const rightX = Math.cos(rad);
    const rightY = -Math.sin(rad);

    return {
        x: position.x + forwardX * forward + rightX * right,
        y: position.y + forwardY * forward + rightY * right,
        z: position.z + up
    };
}

module.exports = {
    "/buy": {
        access: 6,
        handler: (player, args) => {
            mp.events.call('carshow.car.buy', player, args[0]);
        }
    },
    "/cs": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(-57.056705474853516, -1097.54443359375, 26.422353744506836));
        }
    },
    "/cs2": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(-212.266357421875, 6216.1689453125, 31.49127960205078));
        }
    },
    "/cs3": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(172.58201599121094, -30.282873153686523, 68.0706787109375));
        }
    },
    "/cs4": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(261.24310302734375, -1154.1524658203125, 29.291667938232422));
        }
    },
    "/cs5": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(310.61126708984375, -700.7601928710938, 29.319625854492188));
        }
    },
    "/addcarshow": {
        access: 6,
        description: "Создать автосалон в текущей точке",
        args: "[name]:s",
        handler: async (player, args, out) => {
            const name = args.length ? args.join(' ') : `Автосалон #${Date.now()}`;
            const entryPos = {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z - 1
            };
            const heading = player.heading;
            const displayPos = getPointByHeading(player.position, heading, 6, 0, -1);
            const cameraPos = getPointByHeading(displayPos, heading, -7, 2.2, 2);

            const dbCarShow = await db.Models.CarShow.create({
                name: name,
                x: entryPos.x,
                y: entryPos.y,
                z: entryPos.z,
                cameraX: cameraPos.x,
                cameraY: cameraPos.y,
                cameraZ: cameraPos.z,
                toX: displayPos.x,
                toY: displayPos.y,
                toZ: displayPos.z,
                toH: heading,
                returnX: player.position.x,
                returnY: player.position.y,
                returnZ: player.position.z,
                returnH: heading,
                blipId: 225,
                blipColor: 4
            });

            carshow.registerCarShow(dbCarShow);
            out.info(`Автосалон "${name}" создан. ID: ${dbCarShow.id}`, player);
        }
    }
}
