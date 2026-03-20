let fuelstations = require('./index.js')
module.exports = {
    "/fu": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(265.92852783203125, -1245.748291015625, 29.14651107788086));
        }
    },
    "/fueladd": {
        access: 6,
        description: "Создать новую АЗС на позиции игрока",
        args: "[bizId] [название]",
        handler: async (player, args) => {
            const bizId = parseInt(args[0]);
            const name = args.slice(1).join(' ').trim();

            if (isNaN(bizId)) return player.call('notifications.push.error', ['Укажите корректный bizId', 'Ошибка']);
            if (!name) return player.call('notifications.push.error', ['Укажите название АЗС', 'Ошибка']);

            const station = await fuelstations.createNewFuelStation({
                bizId: bizId,
                name: name,
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
                fuelPrice: 3
            });

            player.call('notifications.push.success', [`АЗС #${station.id} (${station.name}) создана`, 'Успешно']);
        }
    },
    "/setfuelprice": {
        access: 6,
        description: "Установить цену топлива на АЗС",
        args: "[ID АЗС] [цена за литр]",
        handler: (player, args) => {
            let fsId = parseInt(args[0]);
            if (isNaN(fsId)) return player.call('notifications.push.error', ['Некорректное значение', 'Ошибка']);;;
            let price = parseInt(args[1]);
            if (isNaN(price) || price < 1 || price > 100) return player.call('notifications.push.error', ['Некорректное значение', 'Ошибка']);;

            try {
                fuelstations.setFuelPrice(fsId, price);
                player.call('notifications.push.success', [`Цена топлива АЗС №${fsId} - $${price}`, 'Успешно']);
            } catch (err) {
                player.call('notifications.push.error', [err.message, 'Ошибка']);
            }
        }
    }
}
