const MENU_BUSY_KEY = 'autoroober.menu';
const DROP_BLIP_SPRITE = 473;
const DROP_BLIP_COLOR = 74;
const SEARCH_RADIUS = 250;
const DELIVERY_POS = new mp.Vector3(126.815, -3105.666, 5.595);

let menuAvailable = false;
let menuOpen = false;
let activeOrder = null;
let hackState = null;

function sendNotification(type, message, header = 'Автоугон') {
    if (!message) return;
    const notify = mp.notify;
    if (notify && typeof notify[type] === 'function') {
        notify[type](message, header);
        return;
    }

    const prefix = header ? `[${header}] ` : '';
    if (mp.game && mp.game.graphics && typeof mp.game.graphics.notify === 'function') {
        mp.game.graphics.notify(`${prefix}${message}`);
        return;
    }

    if (mp.gui && mp.gui.chat && typeof mp.gui.chat.push === 'function') {
        mp.gui.chat.push(`${prefix}${message}`);
    }
}

const notifyInfo = (message, header = 'Автоугон') => sendNotification('info', message, header);
const notifySuccess = (message, header = 'Автоугон') => sendNotification('success', message, header);
const notifyError = (message, header = 'Автоугон') => sendNotification('error', message, header);

function openMenu() {
    if (menuOpen) return;
    if (!mp.busy.add(MENU_BUSY_KEY, false)) return;
    menuOpen = true;
    mp.callCEFV('selectMenu.menus["autoRobberJob"].i = 0');
    mp.callCEFV('selectMenu.menus["autoRobberJob"].j = 0');
    mp.callCEFV('selectMenu.showByName("autoRobberJob")');
}

function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    mp.events.call('selectMenu.hide');
    mp.busy.remove(MENU_BUSY_KEY);
}

function destroyOrder(reason) {
    if (!activeOrder) return;
    stopHack();
    if (activeOrder.radiusBlip !== undefined && activeOrder.radiusBlip !== null) {
        mp.game.ui.removeBlip(activeOrder.radiusBlip);
    }
    if (activeOrder.dropBlip && activeOrder.dropBlip.destroy) {
        activeOrder.dropBlip.setRoute(false);
        activeOrder.dropBlip.destroy();
    }
    if (activeOrder.dropMarker && activeOrder.dropMarker.destroy) {
        activeOrder.dropMarker.destroy();
    }
    if (activeOrder.timer) {
        clearInterval(activeOrder.timer);
    }
    activeOrder = null;
    if (reason === 'time') {
        notifyError('Вы не успели выполнить заказ');
    } else if (reason === 'vehicle') {
        notifyError('Транспорт уничтожен');
    }
}

function setupOrder(spawnPos, vehicleName, vehicle, duration, baseReward, dropPos) {
    const player = mp.players.local;
    const expireAt = Date.now() + duration * 1000;
    const radiusBlip = mp.game.ui.addBlipForRadius(spawnPos.x, spawnPos.y, spawnPos.z, SEARCH_RADIUS);
    mp.game.invoke('0x45FF974EEE1C8734', radiusBlip, 175); // SET_BLIP_ALPHA
    mp.game.invoke('0x03D7FB09E75D6B7E', radiusBlip, 1); // SET_BLIP_COLOUR

    activeOrder = {
        vehicle,
        vehicleName,
        baseReward,
        currentReward: baseReward,
        spawnPos,
        dropPos,
        expireAt,
        radiusBlip,
        dropBlip: null,
        dropMarker: null,
        timer: null,
        foundVehicle: false,
        timeRemaining: duration,
    };

    activeOrder.timer = setInterval(() => {
        if (!activeOrder) return;
        const now = Date.now();
        const secondsLeft = Math.max(0, Math.ceil((activeOrder.expireAt - now) / 1000));
        activeOrder.timeRemaining = secondsLeft;

        if (secondsLeft <= 0) {
            destroyOrder('time');
            mp.events.callRemote('autoroober.order.expired');
            return;
        }

        if (activeOrder.vehicle && mp.vehicles.exists(activeOrder.vehicle)) {
            const health = activeOrder.vehicle.getBodyHealth();
            const rewardMultiplier = activeOrder.baseReward / 1000;
            activeOrder.currentReward = Math.max(0, Math.round(health * rewardMultiplier));

            if (!activeOrder.foundVehicle) {
                const dist = mp.game.gameplay.getDistanceBetweenCoords(
                    player.position.x, player.position.y, player.position.z,
                    activeOrder.vehicle.position.x, activeOrder.vehicle.position.y, activeOrder.vehicle.position.z, true
                );
                if (dist <= 12) {
                    onVehicleFound();
                }
            }
        }
    }, 1000);
}

function onVehicleFound() {
    if (!activeOrder || activeOrder.foundVehicle) return;
    activeOrder.foundVehicle = true;
    if (activeOrder.radiusBlip !== undefined && activeOrder.radiusBlip !== null) {
        mp.game.ui.removeBlip(activeOrder.radiusBlip);
        activeOrder.radiusBlip = null;
    }
    const dropBlip = mp.blips.new(DROP_BLIP_SPRITE, activeOrder.dropPos, {
        color: DROP_BLIP_COLOR,
        alpha: 255,
        name: 'Склад',
        shortRange: false,
    });
    dropBlip.setRoute(true);
    dropBlip.setRouteColour(DROP_BLIP_COLOR);

    const markerPos = new mp.Vector3(activeOrder.dropPos.x, activeOrder.dropPos.y, DELIVERY_POS.z - 1);
    const dropMarker = mp.markers.new(1, markerPos, 4, {
        color: [0, 125, 255, 175],
        visible: true,
    });

    activeOrder.dropBlip = dropBlip;
    activeOrder.dropMarker = dropMarker;
    notifyInfo(`${activeOrder.vehicleName.toUpperCase()} обнаружен. Везите авто в порт.`, 'Симон');
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds - mins * 60;
    const minStr = mins < 10 ? `0${mins}` : `${mins}`;
    const secStr = secs < 10 ? `0${secs}` : `${secs}`;
    return `${minStr}:${secStr}`;
}

function stopHack() {
    if (!hackState) return;
    if (hackState.timeout) {
        clearTimeout(hackState.timeout);
    }
    const player = mp.players.local;
    player.freezePosition(false);
    player.stopAnimTask('veh@break_in@0h@p_m_one@', 'low_force_entry_ps', 0);
    hackState = null;
}

mp.events.add('autoroober.menu.state', (state) => {
    menuAvailable = !!state;
    if (!menuAvailable) closeMenu();
});

mp.events.add('autoroober.menu.accept', () => {
    closeMenu();
    mp.events.callRemote('autoroober.order.request');
});

mp.events.add('autoroober.menu.close', () => {
    closeMenu();
});

mp.events.add('autoroober.menu.forceClose', () => {
    closeMenu();
});

mp.events.add('autoroober.order.prepare', () => {
    notifyInfo('Жди координаты цели', 'Симон');
});

mp.events.add('autoroober.order.created', (sx, sy, sz, duration, vehicleName, vehicle, reward, dx, dy, dz) => {
    destroyOrder();
    const spawnPos = new mp.Vector3(sx, sy, sz);
    const dropPos = new mp.Vector3(dx, dy, dz);
    setupOrder(spawnPos, vehicleName, vehicle, duration, reward, dropPos);
    notifyInfo(`Найди ${vehicleName.toUpperCase()} и вези в порт`, 'Симон');
});

mp.events.add('autoroober.order.clear', (reason) => {
    stopHack();
    destroyOrder(reason);
});

mp.events.add('autoroober.order.completed', (reward) => {
    stopHack();
    destroyOrder('success');
    notifySuccess(`Угон завершён. Вы заработали $${reward}`, 'Симон');
});

mp.events.add('autoroober.vehicle.hack', (duration) => {
    stopHack();
    const player = mp.players.local;
    player.clearTasksImmediately();
    player.freezePosition(true);
    player.taskPlayAnim('veh@break_in@0h@p_m_one@', 'low_force_entry_ps', 8.0, 0.0, -1, 49, 0, false, false, false);
    hackState = {
        endTime: Date.now() + duration * 1000,
        duration,
        timeout: null,
    };
    notifyInfo('Начался взлом транспорта');
    hackState.timeout = setTimeout(() => {
        stopHack();
        notifySuccess('Взлом завершён');
    }, duration * 1000);
});

mp.keys.bind(0x45, true, () => {
    if (!menuAvailable) return;
    if (menuOpen) return;
    if (mp.busy.includes()) return;
    if (mp.game.ui.isPauseMenuActive()) return;
    openMenu();
});

mp.events.add('render', () => {
    if (hackState) {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((hackState.endTime - now) / 1000));
        const progress = 1 - (remaining / hackState.duration);
        mp.game.graphics.drawText(`Взлом: ${(progress * 100).toFixed(0)}%`, [0.5, 0.8], {
            scale: 0.6,
            color: [0, 150, 255, 220],
            font: 4,
            outline: true,
            centre: true,
        });
        if (remaining <= 0) {
            stopHack();
        }
    }

    if (activeOrder) {
        const timerText = formatTime(activeOrder.timeRemaining || 0);
        mp.game.graphics.drawText(`Время: ${timerText}`, [0.015, 0.78], {
            scale: 0.45,
            color: [255, 255, 255, 200],
            font: 4,
            outline: true,
        });
        mp.game.graphics.drawText(`Прибыль: $${activeOrder.currentReward}`, [0.015, 0.81], {
            scale: 0.45,
            color: [114, 204, 114, 220],
            font: 4,
            outline: true,
        });
        const infoText = activeOrder.foundVehicle ? 'Доберитесь до ~b~места ликвидации транспорта' : `Угоните ~b~${activeOrder.vehicleName}`;
        mp.game.graphics.drawText(infoText, [0.5, 0.93], {
            scale: 0.55,
            color: [255, 255, 255, 210],
            font: 4,
            outline: true,
            centre: true,
        });
    }
});
