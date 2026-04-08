"use strict";

let plotMarkers = [];
let plotStates = [];
let plotPositions = [];
let currentPlot = null;
let selectedSeedType = "potato";
let plantingInProgress = false;
let plantZone = null;
let editorState = { active: false, p1: null, p2: null };
let insideFarmMenuZone = false;
let farmUiBusyActive = false;

const markerColors = {
    available: [124, 194, 91, 120],
    growing: [255, 210, 64, 120],
    growing_foreign: [255, 170, 64, 120],
    ready: [84, 255, 84, 160],
    ready_foreign: [84, 255, 150, 160],
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
    if (plotInfo.cooldownAt) return Math.max(0, Math.ceil((plotInfo.cooldownAt - now) / 1000));
    return 0;
}

function updatePrompt() {
    if (!currentPlot) {
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
    } else if (state === "cooldown") {
        mp.prompt.show(`Грядка восстанавливается (~${getSecondsLeft(currentPlot)} сек.)`);
    } else {
        mp.prompt.hide();
    }
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
    if (!plotStates[index]) plotStates[index] = {};
    plotStates[index] = Object.assign({}, plotStates[index], data || {});
    updateMarker(index);
    if (currentPlot && currentPlot.index === index) {
        currentPlot = Object.assign({}, currentPlot, data || {});
        updatePrompt();
    }
}

function createPeds() {
    mp.events.call("NPC.create", {
        model: "a_m_m_farmer_01",
        position: { x: 2023.0729980469, y: 4976.6215820312, z: 41.2263450623 },
        heading: 40.0,
    });
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

function renderPlantTimers() {
    for (let i = 0; i < plotStates.length; i++) {
        const state = plotStates[i];
        const pos = plotPositions[i];
        if (!state || !pos) continue;
        if (state.state !== "growing" && state.state !== "growing_foreign" && state.state !== "ready" && state.state !== "ready_foreign") continue;

        let text = state.seedName || "Растение";
        if (state.state === "ready" || state.state === "ready_foreign") text += " | Готово";
        else text += ` | ${getSecondsLeft(state)} сек.`;

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

mp.events.add({
    "characterInit.done": () => createPeds(),
    "farms.plots.init": (positions) => {
        if (!Array.isArray(positions)) positions = [];
        createMarkers(positions);
    },
    "farms.plot.update": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        applyPlotUpdate(index, info);
    },
    "farms.plot.enter": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
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
        openFarmMenu(data);
    },
    "farms.menu.update": (data) => {
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
        plantZone = zone;
    },
    "farms.zone.preview": (zoneJson) => {
        try {
            var zone = typeof zoneJson === "string" ? JSON.parse(zoneJson) : zoneJson;
            if (zone) plantZone = zone;
        } catch (e) {}
    },
    "farms.zone.editor.toggle": () => {
        editorState.active = !editorState.active;
        editorState.p1 = null;
        editorState.p2 = null;
        mp.notify.info(editorState.active ? "Редактор зоны: E - точка, ENTER - сохранить" : "Редактор зоны выключен", "Ферма");
    },

    "farms.zone.menu.show.request": () => {
        mp.events.callRemote('farms.zone.menu.open');
    },
    "farms.zone.menu.show": (data) => {
        mp.callCEFV(`selectMenu.menus['farmsZoneEditor'].init(${JSON.stringify(data)})`);
        mp.callCEFV("selectMenu.showByName('farmsZoneEditor')");
    },
    "render": () => {
        renderPlantTimers();
        if (plantZone) drawZoneBox(plantZone, [0, 190, 80, 140]);
        if (editorState.active && editorState.p1 && editorState.p2) {
            const x = Math.min(editorState.p1.x, editorState.p2.x);
            const y = Math.min(editorState.p1.y, editorState.p2.y);
            const z = Math.min(editorState.p1.z, editorState.p2.z);
            drawZoneBox({ x, y, z, dx: Math.abs(editorState.p1.x - editorState.p2.x), dy: Math.abs(editorState.p1.y - editorState.p2.y), dz: Math.abs(editorState.p1.z - editorState.p2.z) }, [255, 140, 20, 170]);
        }
        if (currentPlot || insideFarmMenuZone) updatePrompt();
    },
    "farms.reset": () => {
        clearMarkers();
        currentPlot = null;
        insideFarmMenuZone = false;
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
        if (!editorState.p1) {
            editorState.p1 = { x: p.x, y: p.y, z: p.z };
            mp.notify.info("Точка #1 установлена", "Ферма");
        } else if (!editorState.p2) {
            editorState.p2 = { x: p.x, y: p.y, z: p.z };
            mp.notify.info("Точка #2 установлена, нажмите ENTER для сохранения", "Ферма");
        } else {
            editorState.p1 = editorState.p2;
            editorState.p2 = { x: p.x, y: p.y, z: p.z };
            mp.notify.info("Точка #2 обновлена", "Ферма");
        }
        return;
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
});

mp.keys.bind(0x0D, true, () => {
    if (!editorState.active || !editorState.p1 || !editorState.p2) return;
    const payload = {
        x: Math.min(editorState.p1.x, editorState.p2.x),
        y: Math.min(editorState.p1.y, editorState.p2.y),
        z: Math.min(editorState.p1.z, editorState.p2.z),
        dx: Math.max(1, Math.abs(editorState.p1.x - editorState.p2.x)),
        dy: Math.max(1, Math.abs(editorState.p1.y - editorState.p2.y)),
        dz: Math.max(1, Math.abs(editorState.p1.z - editorState.p2.z)),
    };
    mp.events.callRemote("farms.zone.set", JSON.stringify(payload));
    editorState.active = false;
    mp.notify.success("Зона посадки сохранена", "Ферма");
});

mp.events.add("playerQuit", () => {
    currentPlot = null;
    insideFarmMenuZone = false;
    closeFarmMenu();
    handleFarmUiClosed();
    mp.prompt.hide();
});
