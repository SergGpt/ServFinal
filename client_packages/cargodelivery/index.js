const BOARD_BUSY = 'cargo.board.menu';
const RENT_BUSY = 'cargo.rent.menu';

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

function closeBoardMenu() {
    mp.events.call('selectMenu.hide');
    mp.busy.remove(BOARD_BUSY);
}

function closeRentMenu() {
    mp.events.call('selectMenu.hide');
    mp.busy.remove(RENT_BUSY);
}

function openBoardMenu() {
    if (!boardAvailable || !boardData) return;
    if (!mp.busy.add(BOARD_BUSY, false)) return;
    const payload = JSON.stringify(boardData);
    mp.callCEFV(`(function(){var menu = selectMenu.menus['cargoBoardMenu']; if(!menu) return; if(!menu.baseItems) menu.init(${payload}); else menu.update(${payload}); selectMenu.showByName('cargoBoardMenu');})()`);
}

function openRentMenu() {
    if (!rentAvailable || !rentData) return;
    if (!mp.busy.add(RENT_BUSY, false)) return;
    const payload = JSON.stringify(rentData);
    mp.callCEFV(`(function(){var menu = selectMenu.menus['cargoRentMenu']; if(!menu) return; if(!menu.baseItems) menu.init(${payload}); else menu.update(${payload}); selectMenu.showByName('cargoRentMenu');})()`);
}

mp.events.add('cargo.board.state', (state) => {
    boardAvailable = !!state;
    if (!boardAvailable) closeBoardMenu();
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
    if (!rentAvailable) closeRentMenu();
});

mp.events.add('cargo.rent.data', (json) => {
    try {
        rentData = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        rentData = null;
    }
});

mp.events.add('cargo.board.accept', () => {
    closeBoardMenu();
    mp.events.callRemote('cargo.contract.accept');
});

mp.events.add('cargo.board.close', () => {
    closeBoardMenu();
});

mp.events.add('cargo.rent.accept', () => {
    closeRentMenu();
    mp.events.callRemote('cargo.mule.rent');
});

mp.events.add('cargo.rent.close', () => {
    closeRentMenu();
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
        openBoardMenu();
        return;
    }
    if (rentAvailable) {
        openRentMenu();
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
