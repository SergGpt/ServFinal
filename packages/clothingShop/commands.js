const scanIntervals = new Map();


function stopPlayerScan(playerId) {
    if (!scanIntervals.has(playerId)) return false;
    const obj = scanIntervals.get(playerId);
    clearInterval(obj.interval);
    scanIntervals.delete(playerId);
    return true;
}

function startClothesScan(player, out, options) {
    const { from, to, component, texture, key, title } = options;

    if (scanIntervals.has(player.id)) {
        stopPlayerScan(player.id);
        out.info('Предыдущий перебор остановлен.', player);
    }

    out.info(`Начинаю перебор ${title} с ${from} по ${to}`, player);
    console.log(`[CMD] ${player.name} started ${key} ${from}-${to}`);

    let current = from;
    const interval = setInterval(() => {
        try {
            if (!player || !player.handle) {
                clearInterval(interval);
                scanIntervals.delete(player.id);
                console.log(`[CMD] ${key} stopped: player disconnected`);
                return;
            }

            try {
                player.setClothes(component, current, texture, 0);
            } catch (errSet) {
                console.log(`[CMD_ERROR] setClothes failed for ${player.name} ${key} variation=${current}:`, errSet);
            }

            player.outputChatBox(`~y~[SCAN]~s~ Проверка variation: ${current}`);
            console.log(`[SCAN:${key}] ${player.name} variation=${current}`);

            current++;
            if (current > to) {
                clearInterval(interval);
                scanIntervals.delete(player.id);
                out.info(`Перебор завершён (${from}-${to})`, player);
                console.log(`[CMD] ${player.name} finished ${key} ${from}-${to}`);
            }
        } catch (e) {
            console.log(`[CMD_ERROR] ${key} loop`, e);
            clearInterval(interval);
            scanIntervals.delete(player.id);
            out.error(`Ошибка во время перебора: ${e.message}`, player);
        }
    }, 1200);

    scanIntervals.set(player.id, { interval, from, to, key, current: from });
}

module.exports = {
    '/cshopadd': {
        args: '[bizId] [bType] [class]',
        description: 'Создать магазин одежды на позиции игрока и открыть редактор',
        access: 6,
        handler: async (player, args, out) => {
            const bizId = parseInt(args[0]);
            const bType = parseInt(args[1]);
            const shopClass = parseInt(args[2]);

            if (isNaN(bizId) || isNaN(bType) || isNaN(shopClass)) {
                return out.error('Используй: /cshopadd [bizId] [bType] [class]', player);
            }

            const enter = {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z - 1.3
            };
            const place = {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
                h: player.heading
            };
            const camera = {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z + 1.0
            };

            const clothingShop = require('./index.js');
            const shop = await clothingShop.createNewShop({
                bizId,
                bType,
                class: shopClass,
                enter,
                place,
                camera,
                priceMultiplier: 1.0
            });

            player.call('clothingShop.edit.open', [clothingShop.getEditShopData(shop.id)]);
            out.info(`Создан магазин одежды #${shop.id}. Открываю редактор.`, player);
        }
    },
    '/cshopedit': {
        args: '[id]',
        description: 'Настроить вход, место примерки и камеру магазина одежды',
        access: 6,
        handler: async (player, args, out) => {
            const id = parseInt(args[0]);
            if (isNaN(id)) return out.error('Используй: /cshopedit [id]', player);

            const clothingShop = require('./index.js');
            const shopData = clothingShop.getEditShopData(id);
            if (!shopData) return out.error('Магазин не найден', player);

            player.call('clothingShop.edit.open', [shopData]);
            out.info(`Открыта настройка магазина одежды #${id}`, player);
        }
    },
    '/loadcshops': {
        args: '',
        description: 'Загрузка магазов одежды',
        access: 6,
        handler: (player, args) => {
            let data = [ ]
            data.forEach(async (current) => {
                let type;
                switch (current.subclass) {
                    case 'binco': type = 0; break;
                    case 'discount': type = 1; break;
                    case 'suburban': type = 2; break;
                    case 'ponsonbys': type = 3; break;
                }

                await db.Models.ClothingShop.create({
                    class: current.class + 1,
                    bType: type,
                    x: current.pos[0],
                    y: current.pos[1],
                    z: current.pos[2],
                    placeX: current.clothes[0][5][0],
                    placeY: current.clothes[0][5][1],
                    placeZ: current.clothes[0][5][2],
                    placeH: current.clothes[0][6],
                    cameraX: current.clothes[0][7][0],
                    cameraY: current.clothes[0][7][1],
                    cameraZ: current.clothes[0][7][2],
                });
            });
        }
    },

    '/setclshape': {
        args: '[id]',
        description: 'Учстановить колшейп магазина одежды',
        access: 6,
        handler: async (player, args, out) => {
            let id = parseInt(args[0]);
            let shape = mp.colshapes.toArray().find(x => x.clothingShopId === id);
            if (!shape) return out.error('Магазин не найден', player);

            shape.destroy();

            let shop = await db.Models.ClothingShop.findOne({ where: { id } });

            await shop.update({
                x: player.position.x,
                y: player.position.y,
                z: player.position.z - 1.3
            });

            shape = mp.colshapes.newSphere(shop.x, shop.y, shop.z, 1.8);
            shape.isClothingShop = true;
            shape.clothingShopId = id;

            mp.markers.new(1, new mp.Vector3(shop.x, shop.y, shop.z - 0.1), 0.8, {
                color: [50, 168, 82, 128],
                visible: true,
                dimension: 0
            });
        }
    },

    '/testtops': {
        args: '[variation]',
        description: 'Тест топов (компонент 11)',
        access: 6,
        handler: (player, args, out) => {
            let variation = parseInt(args[0]);
            if (isNaN(variation)) {
                return out.error("Используй: /testtops [variation]", player);
            }
            player.setClothes(11, variation, 0, 0);
            out.info(`Установлен топ variation=${variation}, texture=0`, player);
        }
    },

    '/scantops': {
        args: '[from] [to]',
        description: 'Перебор топов (компонент 11)',
        access: 6,
        handler: (player, args, out) => {
            let from = parseInt(args[0]);
            let to = parseInt(args[1]);

            if (isNaN(from) || isNaN(to) || from > to) {
                return out.error('Используй: /scantops [from] [to]', player);
            }

            startClothesScan(player, out, {
                from,
                to,
                component: 11,
                texture: 0,
                key: 'scantops',
                title: 'топов'
            });
        }
    },

    '/testbags': {
        args: '[variation] [texture]',
        description: 'Тест рюкзаков (компонент 5)',
        access: 6,
        handler: (player, args, out) => {
            let variation = parseInt(args[0]);
            let texture = parseInt(args[1] || 0);
            if (isNaN(variation) || variation < 0) {
                return out.error('Используй: /testbags [variation] [texture]', player);
            }
            if (isNaN(texture) || texture < 0) texture = 0;

            player.setClothes(5, variation, texture, 0);
            out.info(`Установлен рюкзак variation=${variation}, texture=${texture}`, player);
        }
    },

    '/scanbags': {
        args: '[from] [to] [texture]',
        description: 'Перебор рюкзаков (компонент 5)',
        access: 6,
        handler: (player, args, out) => {
            let from = parseInt(args[0]);
            let to = parseInt(args[1]);
            let texture = parseInt(args[2] || 0);

            if (isNaN(from) || isNaN(to) || from > to) {
                return out.error('Используй: /scanbags [from] [to] [texture]', player);
            }
            if (isNaN(texture) || texture < 0) texture = 0;

            startClothesScan(player, out, {
                from,
                to,
                component: 5,
                texture,
                key: 'scanbags',
                title: 'рюкзаков'
            });
        }
    },

    '/stopscanbags': {
        args: '',
        description: 'Остановить перебор рюкзаков',
        access: 6,
        handler: (player, args, out) => {
            if (!scanIntervals.has(player.id)) return out.info('Перебор не запущен', player);
            stopPlayerScan(player.id);
            out.info('Перебор рюкзаков остановлен', player);
            console.log(`[CMD] ${player.name} stopped scanbags`);
        }
    },

    '/stopscantops': {
        args: '',
        description: 'Остановить перебор топов',
        access: 6,
        handler: (player, args, out) => {
            if (!scanIntervals.has(player.id)) return out.info('Перебор не запущен', player);
            stopPlayerScan(player.id);
            out.info('Перебор остановлен', player);
            console.log(`[CMD] ${player.name} stopped scantops`);
        }
    },
};
