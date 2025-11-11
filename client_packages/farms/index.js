"use strict";

let plotMarkers = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;

const markerColors = {
    available: [124, 194, 91, 120],
    growing: [255, 210, 64, 120],
    ready: [84, 255, 84, 160],
    cooldown: [252, 144, 58, 120],
    busy: [180, 180, 180, 100],
};

function createMarkers(positions) {
    clearMarkers();
    plotPositions = positions.map(pos => new mp.Vector3(pos.x, pos.y, pos.z));
    plotStates = positions.map(() => ({ state: 'available' }));
    plotPositions.forEach((pos, index) => {
        plotMarkers[index] = mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 0.65, {
            color: markerColors.available,
        });
    });
}

function clearMarkers() {
    plotMarkers.forEach(marker => {
        if (marker && mp.markers.exists(marker)) marker.destroy();
    });
    plotMarkers = [];
    plotStates = [];
    plotPositions = [];
}

function updateMarker(index) {
    if (!plotPositions[index] || !plotStates[index]) return;
    const color = markerColors[plotStates[index].state] || markerColors.busy;
    const pos = plotPositions[index];
    if (plotMarkers[index] && mp.markers.exists(plotMarkers[index])) {
        plotMarkers[index].destroy();
    }
    plotMarkers[index] = mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 0.65, {
        color,
    });
}

function updatePrompt() {
    if (!currentPlot) {
        mp.prompt.hide();
        return;
    }
    const { state, action, timeLeft } = currentPlot;
    if (action === 'plant') {
        mp.prompt.show('Нажмите <span>E</span>, чтобы посадить семя');
    } else if (action === 'harvest') {
        mp.prompt.show('Нажмите <span>E</span>, чтобы собрать урожай');
    } else if (state === 'growing' && timeLeft) {
        const seconds = Math.ceil(timeLeft / 1000);
        mp.prompt.show(`Грядка созревает (~${seconds} сек.)`);
    } else if (state === 'cooldown' && timeLeft) {
        const seconds = Math.ceil(timeLeft / 1000);
        mp.prompt.show(`Грядка восстанавливается (~${seconds} сек.)`);
    } else if (state === 'busy') {
        mp.prompt.show('Грядка занята другим фермером');
    } else {
        mp.prompt.hide();
    }
}

function applyPlotUpdate(index, data) {
    if (!plotStates[index]) plotStates[index] = {};
    plotStates[index] = Object.assign({}, plotStates[index], data || {});
    updateMarker(index);
    if (currentPlot && currentPlot.index === index) {
        currentPlot = Object.assign({}, currentPlot, data || {});
        updatePrompt();
    }
}

function createPeds() {
    [
        {
            model: "a_m_m_farmer_01",
            position: { x: 1959.803, y: 5164.562, z: 47.883 },
            heading: 40.0,
            marker: {
                x: 1960.056,
                y: 5164.228,
                z: 46.883,
                color: [124, 194, 91, 120],
                enterEvent: 'farms.jobshape.enter',
                leaveEvent: 'farms.jobshape.leave',
            },
            blip: {
                sprite: 280,
                position: { x: 1960.056, y: 5164.228, z: 46.883 },
                name: 'Работа фермера',
                color: 25,
            },
        }
    ].forEach(data => mp.events.call('NPC.create', data));
}

mp.events.add({
    'characterInit.done': () => {
        createPeds();
    },
    'farms.plots.init': (positions) => {
        if (!Array.isArray(positions)) positions = [];
        createMarkers(positions);
    },
    'farms.plot.update': (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        applyPlotUpdate(index, info);
    },
    'farms.plot.enter': (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        currentPlot = Object.assign({ index }, info || {});
        updatePrompt();
    },
    'farms.plot.exit': () => {
        currentPlot = null;
        mp.prompt.hide();
    },
    'farms.plot.ready': (index) => {
        index = parseInt(index);
        if (isNaN(index) || !plotStates[index]) return;
        plotStates[index].state = 'ready';
        updateMarker(index);
    },
    'farms.menu.show': (data) => {
        mp.callCEFV(`selectMenu.menus['farmsMain'].init(${JSON.stringify(data)})`);
        mp.callCEFV(`selectMenu.showByName('farmsMain')`);
    },
    'farms.vendor.show': (data) => {
        mp.callCEFV(`selectMenu.menus['farmsVendor'].init(${JSON.stringify(data)})`);
        mp.callCEFV(`selectMenu.showByName('farmsVendor')`);
    },
    'farms.menu.update': (data) => {
        mp.callCEFV(`(function(){var info=${JSON.stringify(data)};if(selectMenu.menus['farmsMain'])selectMenu.menus['farmsMain'].update(info);if(selectMenu.menus['farmsVendor'])selectMenu.menus['farmsVendor'].update(info);})()`);
    },
    'farms.menu.hide': () => {
        mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'farmsMain') selectMenu.show = false;`);
    },
    'farms.vendor.hide': () => {
        mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'farmsVendor') selectMenu.show = false;`);
    },
    'farms.reset': () => {
        clearMarkers();
        currentPlot = null;
        mp.prompt.hide();
    },
    'farms.jobshape.enter': () => {
        mp.events.callRemote('farms.jobshape.request');
    },
    'farms.jobshape.leave': () => {
        mp.callCEFV(`selectionWindow.close('farmsJob')`);
    },
    'farms.jobWindow.show': (config) => {
        const payload = typeof config === 'string' ? config : JSON.stringify(config || {});
        mp.callCEFV(`selectionWindow.open('farmsJob', ${payload})`);
    },
    'farms.jobWindow.update': (config) => {
        const payload = typeof config === 'string' ? config : JSON.stringify(config || {});
        mp.callCEFV(`selectionWindow.update('farmsJob', ${payload})`);
    },
});

mp.events.add('farms.jobWindow.accept', (windowName, action) => {
    if (windowName !== 'farmsJob') return;
    if (action === 'join') {
        mp.events.callRemote('farms.job.start');
    } else if (action === 'leave') {
        mp.events.callRemote('jobs.leave');
    } else if (action === 'help') {
        mp.callCEFV(`modal.showByName('farms_help')`);
    } else if (action === 'sell') {
        mp.events.callRemote('farms.sell');
    } else if (typeof action === 'string' && action.startsWith('buy:')) {
        const amount = parseInt(action.split(':')[1], 10);
        if (!isNaN(amount) && amount > 0) mp.events.callRemote('farms.seed.buy', amount);
    } else if (action === 'close') {
        mp.callCEFV(`selectionWindow.close('farmsJob')`);
    }
});

mp.events.add('farms.jobWindow.cancel', (windowName) => {
    if (windowName !== 'farmsJob') return;
    // No additional logic required, hook reserved for future use.
});

mp.keys.bind(0x45, true, () => {
    if (!currentPlot) return;
    if (mp.busy.includes()) return;
    if (currentPlot.action === 'plant') {
        mp.events.callRemote('farms.plot.plant', currentPlot.index);
        mp.prompt.hide();
    } else if (currentPlot.action === 'harvest') {
        mp.events.callRemote('farms.plot.harvest', currentPlot.index);
        mp.prompt.hide();
    }
});

mp.events.add('playerQuit', () => {
    currentPlot = null;
    mp.prompt.hide();
});
