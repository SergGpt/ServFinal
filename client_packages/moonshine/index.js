"use strict";

let plotMarkers = [];
let plotCenterMarkers = [];
let plotObjects = [];
let plotObjectModels = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;
let lastMarkerDimension = 0;
let insideCraftZone = false;
let insideVendorZone = false;
let craftUiOpen = false;
let vendorData = null;
let moonshineBuffState = { active: false, remainingMs: 0 };

const markerColors = {
    empty: [140, 140, 140, 100],
    plantable: [110, 200, 110, 150],
    growing: [240, 205, 80, 160],
    mature: [70, 255, 130, 190],
    blocked: [160, 160, 160, 110],
};

const plantModels = {
    seeded: 'prop_cane_seedling',
    sprout: 'prop_cane_seedling',
    mature: 'prop_cane_mature',
};

const STREAM_RADIUS = 65;
const STREAM_RADIUS_SQ = STREAM_RADIUS * STREAM_RADIUS;
const ACTION_BUSY_KEY = 'moonshine.action';

let nextStreamUpdate = 0;

const actionAnimations = {
    plant: { dict: 'amb@world_human_gardener_plant@male@enter', name: 'enter', duration: 2600, flag: 1 },
    harvest: { dict: 'amb@world_human_gardener_plant@male@exit', name: 'exit', duration: 2000, flag: 1 },
};

function createMarkers(positions) {
    clearMarkers();
    plotPositions = positions.map(pos => new mp.Vector3(pos.x, pos.y, pos.z));
    plotStates = positions.map(() => ({ state: 'empty' }));
    const dimension = mp.players.local ? mp.players.local.dimension : 0;
    plotPositions.forEach((pos, index) => {
        plotMarkers[index] = mp.markers.new(28, new mp.Vector3(pos.x, pos.y, pos.z + 0.05), 0.85, {
            color: markerColors.empty,
            scale: new mp.Vector3(1.35, 1.35, 0.35),
            dimension,
        });
        plotCenterMarkers[index] = mp.markers.new(2, new mp.Vector3(pos.x, pos.y, pos.z - 0.9), 0.18, {
            color: markerColors.empty,
            dimension,
        });
    });
    lastMarkerDimension = dimension;
    mp.events.callRemote('cane:syncPlots');
}

function destroyPlotObject(index) {
    const obj = plotObjects[index];
    if (obj && mp.objects.exists(obj)) obj.destroy();
    plotObjects[index] = null;
    plotObjectModels[index] = null;
}

function clearMarkers() {
    plotMarkers.forEach(marker => {
        if (marker && mp.markers.exists(marker)) marker.destroy();
    });
    plotCenterMarkers.forEach(marker => {
        if (marker && mp.markers.exists(marker)) marker.destroy();
    });
    plotObjects.forEach((obj, index) => {
        destroyPlotObject(index);
    });
    plotMarkers = [];
    plotCenterMarkers = [];
    plotObjects = [];
    plotObjectModels = [];
    plotStates = [];
    plotPositions = [];
    lastMarkerDimension = 0;
}

function isPlotInStreamRange(index) {
    if (!plotPositions[index] || !mp.players.local) return false;
    const pos = plotPositions[index];
    const playerPos = mp.players.local.position;
    const dx = pos.x - playerPos.x;
    const dy = pos.y - playerPos.y;
    const dz = pos.z - playerPos.z;
    return (dx * dx + dy * dy + dz * dz) <= STREAM_RADIUS_SQ;
}

function updatePlotObject(index, force = false) {
    const state = plotStates[index] ? plotStates[index].state : 'empty';
    const modelName = plantModels[state];
    const dimension = mp.players.local ? mp.players.local.dimension : 0;
    const shouldSpawn = !!modelName && isPlotInStreamRange(index);
    const currentObj = plotObjects[index];
    const currentModel = plotObjectModels[index];

    if (!shouldSpawn || dimension == null) {
        if (currentObj) destroyPlotObject(index);
        return;
    }

    if (!force && currentObj && mp.objects.exists(currentObj) && currentModel === modelName && currentObj.dimension === dimension) {
        return;
    }

    destroyPlotObject(index);
    const pos = plotPositions[index];
    if (!pos) return;
    const hash = mp.game.joaat(modelName);
    if (!mp.game.streaming.hasModelLoaded(hash)) {
        mp.game.streaming.requestModel(hash);
    }
    const spawnPos = new mp.Vector3(pos.x, pos.y, pos.z - 0.9);
    const obj = mp.objects.new(hash, spawnPos, { rotation: new mp.Vector3(0, 0, 0), dimension });
    plotObjects[index] = obj;
    plotObjectModels[index] = modelName;
    try {
        obj.setCollision(false, false);
    } catch (e) {
        // ignore
    }
}

function getMarkerColor(state, data) {
    switch (state) {
        case 'seeded':
        case 'sprout':
            return markerColors.growing;
        case 'mature':
            if (data && data.action === 'harvest') return markerColors.mature;
            return markerColors.blocked;
        case 'empty':
        default:
            if (data && data.action === 'plant') return markerColors.plantable;
            return markerColors.empty;
    }
}

function updateMarker(index) {
    if (!plotPositions[index] || !plotStates[index]) return;
    const info = plotStates[index];
    const color = getMarkerColor(info.state, info);
    const pos = plotPositions[index];
    const dimension = mp.players.local ? mp.players.local.dimension : 0;
    if (plotMarkers[index] && mp.markers.exists(plotMarkers[index])) {
        plotMarkers[index].destroy();
    }
    if (plotCenterMarkers[index] && mp.markers.exists(plotCenterMarkers[index])) {
        plotCenterMarkers[index].destroy();
    }
    plotMarkers[index] = mp.markers.new(28, new mp.Vector3(pos.x, pos.y, pos.z + 0.05), 0.85, {
        color,
        scale: new mp.Vector3(1.35, 1.35, 0.35),
        dimension,
    });
    plotCenterMarkers[index] = mp.markers.new(2, new mp.Vector3(pos.x, pos.y, pos.z - 0.9), 0.18, {
        color,
        dimension,
    });
    lastMarkerDimension = dimension;
}

function formatEta(milliseconds) {
    if (milliseconds == null) return null;
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function playActionAnimation(info) {
    if (!info || !info.dict || !info.name) return;
    mp.game.streaming.requestAnimDict(info.dict);
    let attempts = 0;
    const tryStart = () => {
        try {
            mp.players.local.taskPlayAnim(info.dict, info.name, 8.0, -8.0, info.duration, info.flag || 1, 0, false, false, false);
        } catch (e) {
            // ignore animation errors
        }
    };
    const interval = setInterval(() => {
        attempts++;
        if (mp.game.streaming.hasAnimDictLoaded(info.dict) || attempts >= 20) {
            clearInterval(interval);
            if (mp.game.streaming.hasAnimDictLoaded(info.dict)) tryStart();
        }
    }, 50);
}

function startPlotAction(type) {
    const anim = actionAnimations[type] || actionAnimations.plant;
    const duration = anim ? anim.duration + 150 : 2200;
    if (!mp.busy.add(ACTION_BUSY_KEY, false)) return;
    try {
        mp.players.local.freezePosition(true);
    } catch (e) {
        // ignore freeze errors
    }
    playActionAnimation(anim);
    try {
        const sound = type === 'harvest' ? 'PICK_UP' : 'SELECT';
        mp.game.audio.playSoundFrontend(-1, sound, 'HUD_FRONTEND_DEFAULT_SOUNDSET', true);
    } catch (e) {
        // ignore sound errors
    }
    setTimeout(() => {
        try {
            mp.players.local.stopAnimTask(anim.dict, anim.name, 3.0);
        } catch (e) {
            // ignore stop errors
        }
        try {
            mp.players.local.freezePosition(false);
        } catch (e) {
            // ignore freeze errors
        }
        mp.busy.remove(ACTION_BUSY_KEY);
    }, duration);
}

function updatePrompt() {
    if (currentPlot) {
        const { state, action, timeLeft, graceEndsIn } = currentPlot;
        if (action === 'plant') {
            mp.prompt.show('[E] Посадить семя (id 300)');
            return;
        }
        if (action === 'harvest') {
            mp.prompt.show('[E] Собрать тростник (id 301)');
            return;
        }
        if (state === 'seeded' || state === 'sprout') {
            const eta = formatEta(timeLeft);
            if (eta) {
                mp.prompt.show(`Растёт… ETA: ${eta}`);
                return;
            }
        }
        if (state === 'mature') {
            if (graceEndsIn && graceEndsIn > 0) {
                const eta = formatEta(graceEndsIn);
                if (eta) {
                    mp.prompt.show(`Созревшее растение. Доступ через ${eta}`);
                    return;
                }
            }
            const eta = formatEta(timeLeft);
            if (eta) {
                mp.prompt.show(`Созревшее растение. Завянет через ${eta}`);
                return;
            }
        }
        if (state === 'empty') {
            mp.prompt.show('Пустая грядка');
            return;
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
    if (!plotStates[index]) plotStates[index] = { state: 'empty' };
    plotStates[index] = Object.assign({ state: 'empty' }, plotStates[index], data || {});
    updateMarker(index);
    updatePlotObject(index, true);
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
    'cane:stageSync': (items) => {
        if (!Array.isArray(items)) return;
        items.forEach(data => {
            if (!data) return;
            const index = parseInt(data.index);
            if (isNaN(index)) return;
            applyPlotUpdate(index, { state: data.stage || 'empty' });
        });
    },
    'cane:stageUpdate': (index, stage) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        applyPlotUpdate(index, { state: stage || 'empty' });
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
    'cane:plant': () => {
        startPlotAction('plant');
    },
    'cane:harvest': () => {
        startPlotAction('harvest');
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
    'moonshine:buffState': (state) => {
        if (typeof state === 'string') {
            try {
                moonshineBuffState = JSON.parse(state);
            } catch (e) {
                moonshineBuffState = { active: false, remainingMs: 0 };
            }
        } else {
            moonshineBuffState = state || { active: false, remainingMs: 0 };
        }
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
        clearMarkers();
        currentPlot = null;
        insideCraftZone = false;
        insideVendorZone = false;
        closeCraftUi();
        closeVendorMenu();
        mp.prompt.hide();
    },
});

mp.events.add('render', () => {
    if (!plotPositions.length) return;
    const dimension = mp.players.local ? mp.players.local.dimension : 0;
    if (dimension !== lastMarkerDimension) {
        lastMarkerDimension = dimension;
        for (let i = 0; i < plotPositions.length; i++) {
            updateMarker(i);
        }
    }
    const now = Date.now();
    if (now < nextStreamUpdate) return;
    nextStreamUpdate = now + 750;
    for (let i = 0; i < plotPositions.length; i++) {
        updatePlotObject(i);
    }
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
