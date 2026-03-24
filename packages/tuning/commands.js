const tuning = require('./index.js');

module.exports = {
    "/createlsc": {
        access: 6,
        description: "Создать Los Santos Customs без ручного редактирования БД",
        args: "[name]:s [price]:n",
        handler: async (player, args, out) => {
            if (args.length < 2) return out.error('Используйте: /createlsc [name] [price]', player);

            let price = parseInt(args[args.length - 1]);
            if (Number.isNaN(price) || price < 0) return out.error('Цена должна быть числом не меньше 0', player);

            let name = args.slice(0, -1).join(' ');
            let pos = player.position;
            let heading = player.heading;
            let LSC = await tuning.createCustoms(name, price, pos, pos, heading, pos, heading);

            out.info(`LSC #${LSC.id} создан. Бизнес #${LSC.bizId}. Вход, тюнинг и возврат установлены на текущую позицию.`, player);
            out.info(`Далее используйте /setlsctune ${LSC.id} и /setlscreturn ${LSC.id} в нужных точках.`, player);
        }
    },
    "/setlscenter": {
        access: 6,
        description: "Изменить точку входа Los Santos Customs на текущую позицию",
        args: "[lscId]:n",
        handler: async (player, args, out) => {
            let LSC = await tuning.updateCustomsPoint(parseInt(args[0]), 'enter', player.position, player.heading);
            if (!LSC) return out.error(`LSC #${args[0]} не найден`, player);
            out.info(`Точка входа LSC #${LSC.id} обновлена.`, player);
        }
    },
    "/setlsctune": {
        access: 6,
        description: "Изменить точку тюнинга Los Santos Customs на текущую позицию",
        args: "[lscId]:n",
        handler: async (player, args, out) => {
            let LSC = await tuning.updateCustomsPoint(parseInt(args[0]), 'tune', player.position, player.heading);
            if (!LSC) return out.error(`LSC #${args[0]} не найден`, player);
            out.info(`Точка тюнинга LSC #${LSC.id} обновлена.`, player);
        }
    },
    "/setlscreturn": {
        access: 6,
        description: "Изменить точку возврата Los Santos Customs на текущую позицию",
        args: "[lscId]:n",
        handler: async (player, args, out) => {
            let LSC = await tuning.updateCustomsPoint(parseInt(args[0]), 'return', player.position, player.heading);
            if (!LSC) return out.error(`LSC #${args[0]} не найден`, player);
            out.info(`Точка возврата LSC #${LSC.id} обновлена.`, player);
        }
    },
    "/mod": {
        access: 4,
        description: "Выдать тестовый тюнинг",
        args: "[тип] [индекс]",
        handler: (player, args, out) => {
            if (!player.vehicle) return out.error('Вы не в авто!', player);
            player.vehicle.setMod(parseInt(args[0]), parseInt(args[1]));
        }
    },
    "/lsc": {
        access: 6,
        handler: (player, args) => {
            player.spawn(new mp.Vector3(-368.9290466308594, -126.58971405029297, 38.69566345214844));
        }
    },
    "/setpower": {
        access: 5,
        description: "Установить мощность авто",
        args: "[модель]:s [значение]:n",
        handler: async (player, args, out) => {
            await tuning.updateMultiplier(args[0], 'power', args[1]);
            out.info(`Автомобилю ${args[0]} установлена мощность ${args[1]}`);
        }
    },
    "/setbrake": {
        access: 5,
        description: "Установить торможение авто",
        args: "[модель]:s [значение]:n",
        handler: async (player, args, out) => {
            if (args[1] < 0 || args[1] > 5) return out.error(`Значение должно быть от 0 до 5`, player);
            await tuning.updateMultiplier(args[0], 'brake', args[1]);
            out.info(`Автомобилю ${args[0]} установлено торможение ${args[1]}`, player);
        }
    },
}
