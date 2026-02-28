const BOARD_BUSY = 'cargo.board.window';
const RENT_BUSY = 'cargo.rent.window';

let boardAvailable = false;
let rentAvailable = false;
let boardData = null;
let rentData = null;
let deliveryState = {
    pickupBlip: null,
    dropoffBlip: null,
    timerEndAt: null,
};

function destroyBlip(blip) {
    if (blip && mp.blips.exists(blip)) blip.destroy();
}

function closeTerminal() {
    mp.callCEFV('acceptWindow.show = false;');
    mp.busy.remove(BOARD_BUSY);
    mp.busy.remove(RENT_BUSY);
}

function openBoardTerminal() {
    if (!boardAvailable || !boardData) return;
    if (!mp.busy.add(BOARD_BUSY, true)) return;

    const refreshSeconds = boardData.refreshInSeconds != null ? boardData.refreshInSeconds : 0;
    const mm = Math.floor(refreshSeconds / 60);
    const ss = refreshSeconds % 60;
    const timeLabel = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;

    const text =
        `Погрузка: <span>${boardData.pickupName || '-'}</span><br>` +
        `Доставка: <span>${boardData.dropoffName || '-'}</span><br>` +
        `Награда: <span>$${boardData.reward || 0}</span><br>` +
        `Цена контракта (10%): <span>$${boardData.deposit || 0}</span><br>` +
        `Обновление: <span>${timeLabel}</span> | Маршрутов: <span>${boardData.routesCount || 0}</span>`;

    mp.callCEFV(`acceptWindow.name = 'cargo_board';`);
    mp.callCEFV(`acceptWindow.header = 'Терминал грузоперевозок';`);
    mp.callCEFV(`acceptWindow.text = '${text.replace(/'/g, "\\'")}';`);
    mp.callCEFV(`acceptWindow.leftWord = '${boardData.hasActiveContract ? 'Контракт активен' : 'Взять контракт'}';`);
    mp.callCEFV(`acceptWindow.rightWord = 'Закрыть';`);
    mp.callCEFV('acceptWindow.show = true;');
}

function openRentTerminal() {
    if (!rentAvailable || !rentData) return;
    if (!mp.busy.add(RENT_BUSY, true)) return;

    const text =
        `Стоимость аренды Mule: <span>$${rentData.rentPrice || 1000}</span><br>` +
        `Контракт: <span>${rentData.hasActiveContract ? 'Активен' : 'Нет'}</span><br>` +
        `Mule: <span>${rentData.hasVehicle ? 'Уже арендован' : 'Свободен'}</span>`;

    mp.callCEFV(`acceptWindow.name = 'cargo_rent';`);
    mp.callCEFV(`acceptWindow.header = 'Терминал аренды Mule';`);
    mp.callCEFV(`acceptWindow.text = '${text.replace(/'/g, "\\'")}';`);
    mp.callCEFV(`acceptWindow.leftWord = '${(!rentData.hasActiveContract || rentData.hasVehicle) ? 'Недоступно' : 'Арендовать'}';`);
    mp.callCEFV(`acceptWindow.rightWord = 'Закрыть';`);
    mp.callCEFV('acceptWindow.show = true;');
}

mp.events.add('characterInit.done', () => {
    mp.events.call('NPC.create', {
        model: 's_m_m_dockwork_01',
        position: { x: 109.629, y: -3247.442, z: 5.701 },
        heading: 90,
        defaultScenario: 'WORLD_HUMAN_CLIPBOARD',
    });

    mp.events.call('NPC.create', {
        model: 's_m_m_dockwork_01',
        position: { x: 109.23, y: -3255.38, z: 5.857 },
        heading: 90,
        defaultScenario: 'WORLD_HUMAN_STAND_IMPATIENT',
    });
});

mp.events.add('cargo.board.state', (state) => {
    boardAvailable = !!state;
    if (!boardAvailable) closeTerminal();
});

mp.events.add('cargo.board.data', (json) => {
    try {
        boardData = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        boardData = null;
    }
});

mp.events.add('cargo.rent.state', (state) => {
    rentAvailable = !!state;
    if (!rentAvailable) closeTerminal();
});

mp.events.add('cargo.rent.data', (json) => {
    try {
        rentData = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        rentData = null;
    }
});

mp.events.add('cargo.board.accept', () => {
    closeTerminal();
    mp.events.callRemote('cargo.contract.accept');
});

mp.events.add('cargo.rent.accept', () => {
    closeTerminal();
    mp.events.callRemote('cargo.mule.rent');
});

mp.events.add('cargo.board.close', () => {
    closeTerminal();
});

mp.events.add('cargo.delivery.pickup.set', (x, y, z) => {
    destroyBlip(deliveryState.pickupBlip);
    deliveryState.pickupBlip = mp.blips.new(478, new mp.Vector3(x, y, z), { color: 5, shortRange: false, name: 'Погрузка' });
    deliveryState.pickupBlip.setRoute(true);
});

mp.events.add('cargo.delivery.dropoff.set', (x, y, z) => {
    destroyBlip(deliveryState.dropoffBlip);
    destroyBlip(deliveryState.pickupBlip);
    deliveryState.pickupBlip = null;
    deliveryState.dropoffBlip = mp.blips.new(1, new mp.Vector3(x, y, z), { color: 2, shortRange: false, name: 'Разгрузка' });
    deliveryState.dropoffBlip.setRoute(true);
});

mp.events.add('cargo.delivery.timer.start', (seconds) => {
    deliveryState.timerEndAt = Date.now() + (seconds * 1000);
});

mp.events.add('cargo.delivery.clear', () => {
    destroyBlip(deliveryState.pickupBlip);
    destroyBlip(deliveryState.dropoffBlip);
    deliveryState.pickupBlip = null;
    deliveryState.dropoffBlip = null;
    deliveryState.timerEndAt = null;
});

mp.keys.bind(0x45, true, () => {
    if (mp.busy.includes()) return;
    if (mp.game.ui.isPauseMenuActive()) return;

    if (boardAvailable) {
        openBoardTerminal();
        return;
    }
    if (rentAvailable) {
        openRentTerminal();
    }
});

mp.events.add('render', () => {
    if (!deliveryState.timerEndAt) return;
    const left = Math.max(0, Math.ceil((deliveryState.timerEndAt - Date.now()) / 1000));
    const mm = Math.floor(left / 60);
    const ss = left % 60;
    const label = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;

    mp.game.graphics.drawText(`Доставка груза: ${label}`, [0.015, 0.84], {
        scale: 0.45,
        color: [255, 255, 255, 215],
        font: 4,
        outline: true,
    });
});
