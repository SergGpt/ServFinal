"use strict";

let plotMarkers = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;
let selectedSeedType = "potato";
let plantingInProgress = false;
let plantZone = null;
let editorState = { active: false, points: [] };
let insideFarmMenuZone = false;
let farmUiBusyActive = false;
let knownSeedsAmount = 0;
let wasInsidePlantZone = false;
let farmNpc = null;
let zonePreviewUntil = 0;

function parsePayload(value, fallback) {
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    }
    if (value == null) return fallback;
    return value;
}

const markerColors = {
    available: [124, 194, 91, 120],
    growing: [255, 210, 64, 120],
    growing_foreign: [255, 170, 64, 120],
    ready: [84, 255, 84, 160],
    ready_foreign: [84, 255, 150, 160],
    overripe: [255, 115, 115, 180],
    overripe_foreign: [255, 140, 140, 180],
    cooldown: [252, 144, 58, 120],
    busy: [180, 180, 180, 100],
};

function createMarkers(positions) {
    clearMarkers();
    plotPositions = positions.map(pos => new mp.Vector3(pos.x, pos.y, pos.z));
    plotStates = positions.map(() => ({ state: "available" }));
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
    plotMarkers[index] = mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 0.65, { color });
}

function getSecondsLeft(plotInfo) {
    if (!plotInfo) return 0;
    const now = Date.now();
    if (plotInfo.readyAt) return Math.max(0, Math.ceil((plotInfo.readyAt - now) / 1000));
    if (plotInfo.ripeEndsAt) return Math.max(0, Math.ceil((plotInfo.ripeEndsAt - now) / 1000));
    if (plotInfo.overripeEndsAt) return Math.max(0, Math.ceil((plotInfo.overripeEndsAt - now) / 1000));
    if (plotInfo.cooldownAt) return Math.max(0, Math.ceil((plotInfo.cooldownAt - now) / 1000));
    return 0;
}

function updatePrompt() {
    if (!currentPlot) {
        if (isLocalInsidePlantZone()) {
            if (knownSeedsAmount > 0) mp.prompt.show(`Нажмите <span>E</span>, чтобы посадить (${selectedSeedType})`);
            else mp.prompt.show("У вас нет семян для посадки");
            return;
        }
        if (insideFarmMenuZone) {
            mp.prompt.show("Нажмите <span>E</span>, чтобы поговорить с фермером");
            return;
        }
        mp.prompt.hide();
        return;
    }
    const state = currentPlot.state;
    const owner = currentPlot.owner || "игрок";
    if (currentPlot.action === "plant") {
        mp.prompt.show(`Нажмите <span>E</span>, чтобы посадить (${selectedSeedType})`);
    } else if (currentPlot.action === "harvest") {
        if (state === "ready_foreign") mp.prompt.show(`Нажмите <span>E</span>, чтобы сорвать чужой урожай (${owner})`);
        else mp.prompt.show("Нажмите <span>E</span>, чтобы собрать урожай");
    } else if (state === "growing" || state === "growing_foreign") {
        const seconds = getSecondsLeft(currentPlot);
        const prefix = state === "growing_foreign" ? `Чужая грядка (${owner})` : "Ваша грядка";
        mp.prompt.show(`${prefix}: рост ~${seconds} сек.`);
    } else if (state === "ready" || state === "ready_foreign") {
        mp.prompt.show(`Созрело: ${getSecondsLeft(currentPlot)} сек. до перезревания`);
    } else if (state === "overripe" || state === "overripe_foreign") {
        mp.prompt.show(`Перезрело: ${getSecondsLeft(currentPlot)} сек. до исчезновения`);
    } else if (state === "cooldown") {
        mp.prompt.show(`Грядка восстанавливается (~${getSecondsLeft(currentPlot)} сек.)`);
    } else {
        mp.prompt.hide();
    }
}

function updateKnownSeeds(data) {
    if (!data || typeof data !== "object") return;
    const seeds = parseInt(data.seeds);
    if (!isNaN(seeds)) knownSeedsAmount = Math.max(0, seeds);
}

function isLocalInsidePlantZone() {
    if (!plantZone || !mp.players.local) return false;
    const pos = mp.players.local.position;
    if (Array.isArray(plantZone.points) && plantZone.points.length >= 3) {
        const minZ = Number.isFinite(Number(plantZone.minZ)) ? Number(plantZone.minZ) : -1000;
        const maxZ = Number.isFinite(Number(plantZone.maxZ)) ? Number(plantZone.maxZ) : 10000;
        if (pos.z < minZ || pos.z > maxZ) return false;
        let inside = false;
        for (let i = 0, j = plantZone.points.length - 1; i < plantZone.points.length; j = i++) {
            const xi = plantZone.points[i].x, yi = plantZone.points[i].y;
            const xj = plantZone.points[j].x, yj = plantZone.points[j].y;
            const intersect = ((yi > pos.y) !== (yj > pos.y))
                && (pos.x < ((xj - xi) * (pos.y - yi)) / ((yj - yi) || 0.000001) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    return pos.x >= plantZone.x && pos.x <= plantZone.x + plantZone.dx &&
        pos.y >= plantZone.y && pos.y <= plantZone.y + plantZone.dy &&
        pos.z >= plantZone.z && pos.z <= plantZone.z + plantZone.dz;
}

function openFarmMenu(data) {
    if (!farmUiBusyActive) {
        const added = mp.busy.add("farms.ui");
        farmUiBusyActive = added !== false ? true : mp.busy.includes("farms.ui");
    }
    mp.callCEFV(`farmUi.open(${JSON.stringify(data || {})})`);
}

function closeFarmMenu() {
    mp.callCEFV("if (farmUi && farmUi.visible) farmUi.close()");
}

function handleFarmUiClosed() {
    if (!farmUiBusyActive) return;
    mp.busy.remove("farms.ui");
    farmUiBusyActive = false;
    updatePrompt();
}

function applyPlotUpdate(index, data) {
    data = data || {};
    const payload = Object.assign({}, data);
    if (Object.prototype.hasOwnProperty.call(payload, "state") && !Object.prototype.hasOwnProperty.call(payload, "action")) {
        payload.action = null;
    }
    if (!plotStates[index]) plotStates[index] = {};
    plotStates[index] = Object.assign({}, plotStates[index], payload);
    updateMarker(index);
    if (currentPlot && currentPlot.index === index) {
        currentPlot = Object.assign({}, currentPlot, payload);
        updatePrompt();
    }
}

function createFarmNpc(position) {
    if (!position) return;
    if (farmNpc) {
        try {
            if (mp.peds.exists(farmNpc)) farmNpc.destroy();
        } catch (e) {}
        farmNpc = null;
    }
    const pos = new mp.Vector3(Number(position.x), Number(position.y), Number(position.z));
    farmNpc = mp.peds.new(mp.game.joaat("a_m_m_farmer_01"), pos, 40.0, 0);
    if (farmNpc) {
        farmNpc.defaultScenario = "WORLD_HUMAN_STAND_IMPATIENT";
        try {
            farmNpc.taskStartScenarioInPlace(farmNpc.defaultScenario, 0, false);
        } catch (e) {}
    }
}

function drawZoneBox(zone, color) {
    if (!zone) return;
    const x1 = zone.x;
    const y1 = zone.y;
    const z1 = zone.z;
    const x2 = zone.x + zone.dx;
    const y2 = zone.y + zone.dy;
    const z2 = zone.z + zone.dz;
    const c = color || [0, 190, 80, 160];

    const p = [
        new mp.Vector3(x1, y1, z1), new mp.Vector3(x2, y1, z1), new mp.Vector3(x2, y2, z1), new mp.Vector3(x1, y2, z1),
        new mp.Vector3(x1, y1, z2), new mp.Vector3(x2, y1, z2), new mp.Vector3(x2, y2, z2), new mp.Vector3(x1, y2, z2),
    ];

    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    edges.forEach(edge => {
        const a = p[edge[0]], b = p[edge[1]];
        mp.game.graphics.drawLine(a.x, a.y, a.z, b.x, b.y, b.z, c[0], c[1], c[2], c[3]);
    });
}

function drawZonePolygon(zone, color) {
    if (!zone || !Array.isArray(zone.points) || zone.points.length < 2) return;
    const c = color || [0, 190, 80, 160];
    const points = zone.points;
    const minZ = Number(zone.minZ);
    const maxZ = Number(zone.maxZ);
    const hasHeight = Number.isFinite(minZ) && Number.isFinite(maxZ);
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        mp.game.graphics.drawLine(a.x, a.y, a.z + 0.05, b.x, b.y, b.z + 0.05, c[0], c[1], c[2], c[3]);
        if (hasHeight) {
            mp.game.graphics.drawLine(a.x, a.y, minZ, a.x, a.y, maxZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, minZ, b.x, b.y, minZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, maxZ, b.x, b.y, maxZ, c[0], c[1], c[2], c[3]);
        }
    }
}

function drawEditorPoints(points) {
    if (!Array.isArray(points) || !points.length) return;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        mp.game.graphics.drawMarker(
            1,
            p.x, p.y, p.z - 1.0,
            0, 0, 0,
            0, 0, 0,
            0.42, 0.42, 0.42,
            255, 140, 20, 220,
            false, true, 2, false, null, null, false
        );
        const next = points[(i + 1) % points.length];
        if (!next) continue;
        const shouldClose = points.length >= 3 || i < points.length - 1;
        if (!shouldClose) continue;
        mp.game.graphics.drawLine(
            p.x, p.y, p.z + 0.08,
            next.x, next.y, next.z + 0.08,
            255, 180, 40, 255
        );
    }
}

function getNearestPlotIndex(maxDistance = 4.0) {
    if (!plotPositions.length || !plotStates.length) return -1;
    const me = mp.players.local;
    if (!me) return -1;
    let nearest = -1;
    let best = maxDistance;
    let bestPriority = -1;

    const getPriority = (state) => {
        if (!state) return 0;
        if (state.action === "harvest") return 4;
        if (state.state === "ready" || state.state === "ready_foreign") return 3;
        if (state.state === "growing" || state.state === "growing_foreign") return 2;
        if (state.action === "plant") return 1;
        return 0;
    };

    for (let i = 0; i < plotPositions.length; i++) {
        const pos = plotPositions[i];
        const state = plotStates[i];
        if (!pos || !state) continue;
        const dist = me.position.distanceTo(pos);
        if (dist <= best) {
            const priority = getPriority(state);
            if (priority > bestPriority || (priority === bestPriority && dist < best)) {
                best = dist;
                nearest = i;
                bestPriority = priority;
            }
        }
    }
    return nearest;
}

function updateCurrentPlotByDistance() {
    const index = getNearestPlotIndex();
    if (index === -1) {
        if (currentPlot) {
            currentPlot = null;
            updatePrompt();
        }
        return;
    }
    const nextState = plotStates[index] || {};
    if (currentPlot && currentPlot.index === index) {
        currentPlot = Object.assign({}, currentPlot, nextState);
    } else {
        currentPlot = Object.assign({ index }, nextState);
    }
}

function renderPlantTimers() {
    for (let i = 0; i < plotStates.length; i++) {
        const state = plotStates[i];
        const pos = plotPositions[i];
        if (!state || !pos) continue;
        if ((state.state === "growing" || state.state === "growing_foreign") && getSecondsLeft(state) <= 0) {
            state.state = state.state === "growing_foreign" ? "ready_foreign" : "ready";
            state.action = "harvest";
            state.readyAt = null;
            updateMarker(i);
        }
        if ((state.state === "ready" || state.state === "ready_foreign") && getSecondsLeft(state) <= 0) {
            state.state = state.state === "ready_foreign" ? "overripe_foreign" : "overripe";
            state.action = "harvest";
            state.ripeEndsAt = null;
            updateMarker(i);
        }
        if (state.state !== "growing" && state.state !== "growing_foreign" && state.state !== "ready" && state.state !== "ready_foreign" && state.state !== "overripe" && state.state !== "overripe_foreign") continue;

        let phase = "Рост";
        if (state.state === "ready" || state.state === "ready_foreign") phase = "Созрело";
        if (state.state === "overripe" || state.state === "overripe_foreign") phase = "Перезрело";
        let text = `${state.seedName || "Растение"} | ${phase}`;
        if (phase === "Рост") text += `: ${getSecondsLeft(state)} сек.`;
        if (phase === "Созрело") text += `: ${getSecondsLeft(state)} сек.`;
        if (phase === "Перезрело") text += `: ${getSecondsLeft(state)} сек.`;

        if (mp.players.local.position.distanceTo(pos) > 100) continue;

        const screen = mp.game.graphics.world3dToScreen2d(new mp.Vector3(pos.x, pos.y, pos.z + 0.6));
        if (!screen) continue;
        mp.game.graphics.drawText(text, [screen.x, screen.y], {
            font: 4,
            color: [255, 255, 255, 220],
            scale: [0.28, 0.28],
            outline: true,
            centre: true,
        });
    }
}

function getNearestHarvestablePlotIndex(maxDistance = 4.0) {
    if (!plotPositions.length || !plotStates.length || !mp.players.local) return -1;
    let nearest = -1;
    let bestDistance = maxDistance;
    for (let i = 0; i < plotPositions.length; i++) {
        const state = plotStates[i];
        const pos = plotPositions[i];
        if (!state || !pos) continue;
        const canHarvest = state.action === "harvest"
            || state.state === "ready"
            || state.state === "ready_foreign"
            || state.state === "overripe"
            || state.state === "overripe_foreign";
        if (!canHarvest) continue;
        const dist = mp.players.local.position.distanceTo(pos);
        if (dist <= bestDistance) {
            bestDistance = dist;
            nearest = i;
        }
    }
    return nearest;
}

mp.events.add({
    "characterInit.done": () => {
        mp.events.callRemote("farms.menu.sync");
    },
    "farms.plots.init": (positions) => {
        positions = parsePayload(positions, []);
        if (!Array.isArray(positions)) positions = [];
        createMarkers(positions);
    },
    "farms.plot.update": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        info = parsePayload(info, {});
        applyPlotUpdate(index, info);
    },
    "farms.plot.add": (index, pos) => {
        index = parseInt(index);
        if (isNaN(index) || !pos) return;
        plotPositions[index] = new mp.Vector3(pos.x, pos.y, pos.z);
        if (!plotStates[index]) plotStates[index] = { state: "available" };
        updateMarker(index);
    },
    "farms.plot.enter": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        info = parsePayload(info, {});
        currentPlot = Object.assign({ index }, info || {});
        updatePrompt();
    },
    "farms.plot.exit": () => {
        currentPlot = null;
        updatePrompt();
    },
    "farms.plot.ready": (index) => {
        index = parseInt(index);
        if (isNaN(index) || !plotStates[index]) return;
        plotStates[index].state = "ready";
        plotStates[index].action = "harvest";
        plotStates[index].readyAt = null;
        updateMarker(index);
    },
    "farms.menu.enter": () => {
        insideFarmMenuZone = true;
        mp.events.callRemote("farms.menu.sync");
        updatePrompt();
    },
    "farms.menu.exit": () => {
        insideFarmMenuZone = false;
        closeFarmMenu();
        updatePrompt();
    },
    "farms.menu.show": (data) => {
        data = parsePayload(data, {});
        updateKnownSeeds(data);
        openFarmMenu(data);
    },
    "farms.menu.update": (data) => {
        data = parsePayload(data, {});
        updateKnownSeeds(data);
        mp.callCEFV(`farmUi.update(${JSON.stringify(data)})`);
    },
    "farms.menu.hide": () => {
        closeFarmMenu();
    },
    "farms.employment.show": () => {
        openFarmMenu({ employed: false });
    },
    "farms.employment.hide": () => {
        closeFarmMenu();
    },
    "farms.seed.select": (seedId) => {
        selectedSeedType = seedId || "potato";
        updatePrompt();
    },
    "farms.zone.sync": (zone) => {
        zone = parsePayload(zone, null);
        plantZone = zone;
        if (zone && zone.npcPos) createFarmNpc(zone.npcPos);
    },
    "farms.zone.preview": (zoneJson) => {
        try {
            var zone = typeof zoneJson === "string" ? JSON.parse(zoneJson) : zoneJson;
            if (zone) {
                plantZone = zone;
                zonePreviewUntil = Date.now() + 15000;
            }
        } catch (e) {}
    },
    "farms.zone.editor.toggle": () => {
        editorState.active = !editorState.active;
        editorState.points = [];
        mp.notify.info(editorState.active ? "Редактор грядок: E - добавить грядку, ENTER - сохранить" : "Редактор грядок выключен", "Ферма");
    },

    "farms.zone.menu.show.request": () => {
        mp.events.callRemote('farms.zone.menu.open');
    },
    "farms.zone.menu.npc.fromPlayer": () => {
        const p = mp.players.local.position;
        const payload = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
        mp.callCEFV(`selectMenu.menus['farmsZoneEditor'].setNpcFromPlayer(${JSON.stringify(payload)})`);
    },
    "farms.zone.menu.zonepoint.fromPlayer": () => {
        const p = mp.players.local.position;
        const payload = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
        mp.callCEFV(`selectMenu.menus['farmsZoneEditor'].addZonePointFromPlayer(${JSON.stringify(payload)})`);
    },
    "farms.zone.menu.point.fromPlayer": () => {
        const p = mp.players.local.position;
        const payload = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
        mp.callCEFV(`selectMenu.menus['farmsZoneEditor'].addPointFromPlayer(${JSON.stringify(payload)})`);
    },
    "farms.zone.menu.show": (data) => {
        mp.callCEFV(`selectMenu.menus['farmsZoneEditor'].init(${JSON.stringify(data)})`);
        mp.callCEFV("selectMenu.showByName('farmsZoneEditor')");
    },
    "render": () => {
        renderPlantTimers();
        const showZone = editorState.active || Date.now() < zonePreviewUntil;
        if (plantZone && showZone) {
            if (Array.isArray(plantZone.points) && plantZone.points.length >= 2) drawZonePolygon(plantZone, [0, 190, 80, 140]);
            else drawZoneBox(plantZone, [0, 190, 80, 140]);
        }
        if (editorState.active) drawEditorPoints(editorState.points);
        updateCurrentPlotByDistance();
        const insideNow = isLocalInsidePlantZone();
        if (insideNow !== wasInsidePlantZone) {
            wasInsidePlantZone = insideNow;
            if (insideNow) mp.notify.info("Вы вошли в зону посадки растений", "Ферма");
        }
        if (currentPlot || insideFarmMenuZone) updatePrompt();
    },
    "farms.reset": () => {
        clearMarkers();
        currentPlot = null;
        insideFarmMenuZone = false;
        if (farmNpc) {
            try {
                if (mp.peds.exists(farmNpc)) farmNpc.destroy();
            } catch (e) {}
            farmNpc = null;
        }
        closeFarmMenu();
        handleFarmUiClosed();
        mp.prompt.hide();
    },
    "farms.ui.closed": () => {
        handleFarmUiClosed();
    },
});

mp.keys.bind(0x45, true, () => {
    if (editorState.active) {
        const p = mp.players.local.position;
        editorState.points.push({
            x: Number(p.x.toFixed(3)),
            y: Number(p.y.toFixed(3)),
            z: Number(p.z.toFixed(3)),
        });
        mp.notify.info(`Грядка добавлена (#${editorState.points.length})`, "Ферма");
        return;
    }

    if (!mp.busy.includes() && isLocalInsidePlantZone()) {
        const harvestIndex = getNearestHarvestablePlotIndex();
        if (harvestIndex !== -1) {
            mp.events.callRemote("farms.plot.harvest", harvestIndex);
            mp.prompt.hide();
            return;
        }
    }

    if (currentPlot) {
        if (mp.busy.includes() || plantingInProgress) return;
        if (currentPlot.action === "plant") {
            plantingInProgress = true;
            mp.players.local.taskPlayAnim("amb@world_human_gardener_plant@male@idle_a", "idle_a", 4.0, 0.0, 1300, 49, 0, false, false, false);
            setTimeout(() => {
                mp.events.callRemote("farms.plot.plant", currentPlot.index, selectedSeedType);
                mp.players.local.clearTasks();
                plantingInProgress = false;
            }, 1300);
            mp.prompt.hide();
        } else if (currentPlot.action === "harvest") {
            mp.events.callRemote("farms.plot.harvest", currentPlot.index);
            mp.prompt.hide();
        }
        return;
    }

    if (insideFarmMenuZone && !mp.busy.includes()) {
        mp.events.callRemote("farms.menu.open");
        return;
    }

    if (!mp.busy.includes() && isLocalInsidePlantZone()) {
        mp.events.callRemote("farms.plot.plant", -1, selectedSeedType);
    }
});

mp.keys.bind(0x0D, true, () => {
    if (!editorState.active || !editorState.points.length) return;
    const zs = editorState.points.map((point) => point.z);
    const minZ = Math.min.apply(null, zs) - 1.0;
    const maxZ = Math.max.apply(null, zs) + 2.5;
    mp.events.callRemote("farms.zone.set", JSON.stringify({
        points: editorState.points,
        minZ: Number(minZ.toFixed(3)),
        maxZ: Number(maxZ.toFixed(3)),
    }));
    editorState.active = false;
    mp.notify.success("Зона посадки сохранена", "Ферма");
});

mp.events.add("playerQuit", () => {
    currentPlot = null;
    insideFarmMenuZone = false;
    if (farmNpc) {
        try {
            if (mp.peds.exists(farmNpc)) farmNpc.destroy();
        } catch (e) {}
        farmNpc = null;
    }
    closeFarmMenu();
    handleFarmUiClosed();
    mp.prompt.hide();
});
