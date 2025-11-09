"use strict";

let plotMarkers = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;
let insideCraftZone = false;
let craftMenuOpen = false;
let storedCraftData = null;

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
    if (currentPlot) {
        const { state, action, timeLeft } = currentPlot;
        if (action === 'plant') {
            mp.prompt.show('Нажмите <span>E</span>, чтобы посадить семя');
            return;
        }
        if (action === 'harvest') {
            mp.prompt.show('Нажмите <span>E</span>, чтобы собрать урожай');
            return;
        }
        if (state === 'growing' && timeLeft) {
            const seconds = Math.ceil(timeLeft / 1000);
            mp.prompt.show(`Грядка созревает (~${seconds} сек.)`);
            return;
        }
        if (state === 'cooldown' && timeLeft) {
            const seconds = Math.ceil(timeLeft / 1000);
            mp.prompt.show(`Грядка восстанавливается (~${seconds} сек.)`);
            return;
        }
        if (state === 'busy') {
            mp.prompt.show('Грядка занята другим фермером');
            return;
        }
    }
    if (insideCraftZone) {
        mp.prompt.show('Нажмите <span>E</span>, чтобы открыть самогонный аппарат');
        return;
    }
    mp.prompt.hide();
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
            position: { x: 1479.9052734375, y: 1154.0726318359375, z: 114.30072021484375 },
            heading: 90.0,
        },
        {
            model: "ig_old_man1a",
            position: { x: 1479.9052734375, y: 1154.0726318359375, z: 114.30072021484375 },
            heading: 252.0,
        },
        {
            model: "s_m_m_chemsec_01",
            position: { x: 1479.9052734375, y: 1154.0726318359375, z: 114.30072021484375 },
            heading: 0.0,
        }
    ].forEach(data => mp.events.call('NPC.create', data));
}

function showCraftMenu(data) {
    storedCraftData = data;
    craftMenuOpen = true;
    mp.callCEFV(`selectMenu.menus['moonshineCraft'].init(${JSON.stringify(data)})`);
    mp.callCEFV(`selectMenu.showByName('moonshineCraft')`);
}

function updateCraftMenu(data) {
    storedCraftData = data;
    mp.callCEFV(`(function(){var info=${JSON.stringify(data)};if(selectMenu.menus['moonshineCraft'])selectMenu.menus['moonshineCraft'].update(info);})()`);
}

function hideCraftMenu() {
    craftMenuOpen = false;
    storedCraftData = null;
    mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'moonshineCraft') selectMenu.show = false;`);
}

mp.events.add({
    'characterInit.done': () => {
        createPeds();
        if (mp.players.local.getVariable('moonshine.effect')) {
            mp.events.call('moonshine.effect.refresh');
        }
    },
    'moonshine.plots.init': (positions) => {
        if (!Array.isArray(positions)) positions = [];
        createMarkers(positions);
    },
    'moonshine.plot.update': (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        applyPlotUpdate(index, info);
    },
    'moonshine.plot.enter': (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        currentPlot = Object.assign({ index }, info || {});
        updatePrompt();
    },
    'moonshine.plot.exit': () => {
        currentPlot = null;
        updatePrompt();
    },
    'moonshine.plot.ready': (index) => {
        index = parseInt(index);
        if (isNaN(index) || !plotStates[index]) return;
        plotStates[index].state = 'ready';
        updateMarker(index);
    },
    'moonshine.menu.show': (data) => {
        mp.callCEFV(`selectMenu.menus['moonshineFarm'].init(${JSON.stringify(data)})`);
        mp.callCEFV(`selectMenu.showByName('moonshineFarm')`);
    },
    'moonshine.vendor.show': (data) => {
        mp.callCEFV(`selectMenu.menus['moonshineVendor'].init(${JSON.stringify(data)})`);
        mp.callCEFV(`selectMenu.showByName('moonshineVendor')`);
    },
    'moonshine.menu.update': (data) => {
        mp.callCEFV(`(function(){var info=${JSON.stringify(data)};if(selectMenu.menus['moonshineFarm'])selectMenu.menus['moonshineFarm'].update(info);if(selectMenu.menus['moonshineVendor'])selectMenu.menus['moonshineVendor'].update(info);})()`);
    },
    'moonshine.menu.hide': () => {
        mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'moonshineFarm') selectMenu.show = false;`);
    },
    'moonshine.vendor.hide': () => {
        mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'moonshineVendor') selectMenu.show = false;`);
    },
    'moonshine.craft.enter': () => {
        insideCraftZone = true;
        updatePrompt();
    },
    'moonshine.craft.exit': () => {
        insideCraftZone = false;
        if (craftMenuOpen) hideCraftMenu();
        updatePrompt();
    },
    'moonshine.craft.menu.show': (data) => {
        showCraftMenu(typeof data === 'string' ? JSON.parse(data) : data);
    },
    'moonshine.craft.menu.update': (data) => {
        updateCraftMenu(typeof data === 'string' ? JSON.parse(data) : data);
    },
    'moonshine.craft.menu.hide': () => {
        hideCraftMenu();
    },
    'moonshine.reset': () => {
        clearMarkers();
        currentPlot = null;
        insideCraftZone = false;
        hideCraftMenu();
        mp.prompt.hide();
    },
    'playerQuit': () => {
        currentPlot = null;
        insideCraftZone = false;
        hideCraftMenu();
        mp.prompt.hide();
    },
});

mp.keys.bind(0x45, true, () => {
    if (mp.busy.includes()) return;
    if (currentPlot) {
        if (currentPlot.action === 'plant') {
            mp.events.callRemote('moonshine.plot.plant', currentPlot.index);
            mp.prompt.hide();
            return;
        }
        if (currentPlot.action === 'harvest') {
            mp.events.callRemote('moonshine.plot.harvest', currentPlot.index);
            mp.prompt.hide();
            return;
        }
    }
    if (insideCraftZone && !craftMenuOpen) {
        mp.events.callRemote('moonshine.craft.menu');
    }
});

let baseMaxHealth = null;
let moonshineEffectActive = false;

function setRunSprintMultiplier(multiplier) {
    try {
        const playerId = mp.game.player.playerId();
        mp.game.invoke('0x6DB47AA77FD94E09', playerId, multiplier);
    } catch (e) {
        // ignore invoke errors
    }
}

function applyMoonshineEffectClient(data) {
    if (!moonshineEffectActive) {
        baseMaxHealth = mp.players.local.getMaxHealth();
    }
    const multiplier = data && data.speedMultiplier ? data.speedMultiplier : 1.1;
    moonshineEffectActive = true;
    mp.players.local.setMaxHealth(120);
    setRunSprintMultiplier(multiplier);
}

function clearMoonshineEffectClient() {
    if (!moonshineEffectActive) return;
    moonshineEffectActive = false;
    const maxHealth = baseMaxHealth != null ? baseMaxHealth : 100;
    mp.players.local.setMaxHealth(maxHealth);
    setRunSprintMultiplier(1.0);
    baseMaxHealth = null;
}

mp.events.addDataHandler('moonshine.effect', (entity, value) => {
    if (!entity || !entity.handle || !entity.isLocalPlayer()) return;
    if (value && value.active) {
        applyMoonshineEffectClient(value);
    } else {
        clearMoonshineEffectClient();
    }
});

mp.events.add('moonshine.effect.refresh', () => {
    const value = mp.players.local.getVariable('moonshine.effect');
    if (value && value.active) {
        applyMoonshineEffectClient(value);
    } else {
        clearMoonshineEffectClient();
    }
});

setRunSprintMultiplier(1.0);
