"use strict";

let plotMarkers = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;
let insideCraftZone = false;
let insideVendorZone = false;
let craftUiOpen = false;
let vendorData = null;

const markerColors = {
    empty: [124, 194, 91, 120],
    seeded: [255, 210, 64, 120],
    sprout: [180, 220, 120, 120],
    mature: [84, 255, 84, 160],
    blocked: [180, 180, 180, 100],
};

function createMarkers(positions) {
    clearMarkers();
    plotPositions = positions.map(pos => new mp.Vector3(pos.x, pos.y, pos.z));
    plotStates = positions.map(() => ({ state: 'empty' }));
    plotPositions.forEach((pos, index) => {
        plotMarkers[index] = mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 0.65, {
            color: markerColors.empty,
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

function getMarkerColor(state, data) {
    switch (state) {
        case 'seeded':
            return markerColors.seeded;
        case 'sprout':
            return markerColors.sprout;
        case 'mature':
            if (data && data.action === 'harvest') return markerColors.mature;
            return markerColors.blocked;
        case 'blocked':
            return markerColors.blocked;
        case 'empty':
        default:
            return markerColors.empty;
    }
}

function updateMarker(index) {
    if (!plotPositions[index] || !plotStates[index]) return;
    const info = plotStates[index];
    const color = getMarkerColor(info.state, info);
    const pos = plotPositions[index];
    if (plotMarkers[index] && mp.markers.exists(plotMarkers[index])) {
        plotMarkers[index].destroy();
    }
    plotMarkers[index] = mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 0.65, {
        color,
    });
}

function secondsLeft(value) {
    if (!value) return null;
    const seconds = Math.max(0, Math.ceil(value / 1000));
    return seconds;
}

function updatePrompt() {
    if (currentPlot) {
        const { state, action, timeLeft, graceEndsIn, owner } = currentPlot;
        if (action === 'plant') {
            mp.prompt.show('Нажмите <span>E</span>, чтобы посадить семя тростника');
            return;
        }
        if (action === 'harvest') {
            mp.prompt.show('Нажмите <span>E</span>, чтобы собрать тростник');
            return;
        }
        if (state === 'seeded' || state === 'sprout') {
            const seconds = secondsLeft(timeLeft);
            if (seconds != null) {
                const stage = state === 'seeded' ? 'Семя прорастает' : 'Росток крепнет';
                mp.prompt.show(`${stage}: ~${seconds} сек.`);
                return;
            }
        }
        if (state === 'mature') {
            if (graceEndsIn && graceEndsIn > 0 && owner) {
                const seconds = secondsLeft(graceEndsIn);
                mp.prompt.show(`Созревшее растение (${owner}). Доступ через ${seconds} сек.`);
                return;
            }
            const seconds = secondsLeft(timeLeft);
            if (seconds != null) {
                mp.prompt.show(`Созревшее растение. Завянет через ${seconds} сек.`);
                return;
            }
        }
    }
    if (insideCraftZone) {
        mp.prompt.show('Нажмите <span>E</span>, чтобы использовать самогонный аппарат');
        return;
    }
    if (insideVendorZone) {
        mp.prompt.show('Нажмите <span>E</span>, чтобы купить семена');
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

function openVendorMenu(data) {
    vendorData = data || {};
    mp.callCEFV(`selectMenu.menus['moonshineVendor'].init(${JSON.stringify(data)})`);
    mp.callCEFV(`selectMenu.showByName('moonshineVendor')`);
}

function updateVendorMenu(data) {
    vendorData = data || vendorData;
    mp.callCEFV(`(function(){var info=${JSON.stringify(data)};if(selectMenu.menus['moonshineVendor'])selectMenu.menus['moonshineVendor'].update(info);})()`);
}

function closeVendorMenu() {
    vendorData = null;
    mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'moonshineVendor') selectMenu.show = false;`);
}

function openCraftUi(data) {
    craftUiOpen = true;
    const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
    mp.callCEFV(`moonshineCraft.open(${payload})`);
}

function updateCraftUi(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
    mp.callCEFV(`moonshineCraft.update(${payload})`);
}

function closeCraftUi() {
    craftUiOpen = false;
    mp.callCEFV('moonshineCraft.hide(true)');
}

function setCraftProgress(sessionId, duration) {
    const payload = JSON.stringify({ sessionId, duration });
    mp.callCEFV(`moonshineCraft.start(${payload})`);
}

function craftSuccess(amount) {
    const payload = JSON.stringify({ success: true, amount });
    mp.callCEFV(`moonshineCraft.finish(${payload})`);
}

function craftFail(message) {
    const payload = JSON.stringify({ success: false, message: message || '' });
    mp.callCEFV(`moonshineCraft.finish(${payload})`);
}

mp.events.add({
    'characterInit.done': () => {
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
        applyPlotUpdate(index, info || {});
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
    'moonshine.menu.update': (data) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
        mp.callCEFV(`(function(){var info=${payload};if(selectMenu.menus['moonshineFarm'])selectMenu.menus['moonshineFarm'].update(info);if(selectMenu.menus['moonshineVendor'])selectMenu.menus['moonshineVendor'].update(info);})()`);
    },
    'moonshine.menu.show': (data) => {
        mp.callCEFV(`selectMenu.menus['moonshineFarm'].init(${JSON.stringify(data)})`);
        mp.callCEFV(`selectMenu.showByName('moonshineFarm')`);
    },
    'moonshine.menu.hide': () => {
        mp.callCEFV(`if (selectMenu.current && selectMenu.current.name === 'moonshineFarm') selectMenu.show = false;`);
    },
    'moonshine.vendor.enter': () => {
        insideVendorZone = true;
        updatePrompt();
    },
    'moonshine.vendor.exit': () => {
        insideVendorZone = false;
        closeVendorMenu();
        updatePrompt();
    },
    'moonshine.vendor.show': (data) => {
        openVendorMenu(typeof data === 'string' ? JSON.parse(data) : data);
    },
    'moonshine.vendor.hide': () => {
        closeVendorMenu();
    },
    'moonshine.craft.enter': () => {
        insideCraftZone = true;
        updatePrompt();
    },
    'moonshine.craft.exit': () => {
        insideCraftZone = false;
        closeCraftUi();
        updatePrompt();
    },
    'moonshine.craft.menu.show': (data) => {
        openCraftUi(data);
    },
    'moonshine.craft.menu.update': (data) => {
        updateCraftUi(data);
    },
    'moonshine.craft.menu.hide': () => {
        closeCraftUi();
    },
    'moonshine.craft.ui.start': (sessionId, duration) => {
        setCraftProgress(sessionId, duration);
    },
    'moonshine.craft.ui.success': (amount) => {
        craftSuccess(amount);
    },
    'moonshine.craft.ui.fail': (message) => {
        craftFail(message);
    },
    'moonshine.craft.ui.abort': () => {
        craftFail('Процесс прерван');
    },
    'moonshine.craft.ui.hide': () => {
        closeCraftUi();
    },
    'moonshine.reset': () => {
        clearMarkers();
        currentPlot = null;
        insideCraftZone = false;
        insideVendorZone = false;
        closeCraftUi();
        closeVendorMenu();
        mp.prompt.hide();
    },
    'playerQuit': () => {
        currentPlot = null;
        insideCraftZone = false;
        insideVendorZone = false;
        closeCraftUi();
        closeVendorMenu();
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
    if (insideCraftZone) {
        if (!craftUiOpen) {
            mp.events.callRemote('moonshine.craft.menu');
        }
        return;
    }
    if (insideVendorZone) {
        mp.events.callRemote('moonshine.vendor.open');
        return;
    }
});

mp.events.add('moonshine.vendor.request', () => {
    mp.events.callRemote('moonshine.menu.sync');
});

mp.events.add('moonshine.craft.ui.start.request', () => {
    mp.events.callRemote('moonshine.craft.start');
});

mp.events.add('moonshine.craft.ui.cancel', () => {
    mp.events.callRemote('moonshine.craft.cancel');
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
