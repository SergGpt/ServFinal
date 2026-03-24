"use strict";
/// Подключение всех модулей на сервере

mp.gui.cursor.show(true, false);

/// Служебные модули
require('base');
require('utils');
require('browser');

let browserLoaded = false;
let initDone = false;

mp.events.add('render', () => {
    if (!browserLoaded || !initDone) {
        mp.game.graphics.drawText("Сервер загружается, подождите", [0.5, 0.5], {
            font: 0,
            color: [255,66,247, 200],
            scale: [0.5, 0.5],
            outline: true
        });
    }
});
require('./licenseNPC/licenseNPC_client.js');
require('./attachmentsEditor/index.js');
// В client_packages/index.js в самом начале добавьте:
mp.game.streaming.requestIpl("tops01"); // замените на название вашего DLC


/// Автоподключение клиентских модулей, игнорируем game_resources
mp.events.add('init', (activeModules) => {
    activeModules.forEach(moduleName => {
        if (moduleName !== 'game_resources') { // исключаем папку с DLC
            try {
                require(moduleName);
            } catch (e) {
                console.error(`Ошибка при подключении модуля ${moduleName}:`, e);
            }
        }
    });

    if (browserLoaded) {
        mp.events.callRemote('player.joined');
    }
    initDone = true;
});

mp.events.add('browserDomReady', (browser) => {
    if (initDone) {
        mp.events.callRemote('player.joined');
    }
    browserLoaded = true;
});

mp.events.callRemote('player.join');
