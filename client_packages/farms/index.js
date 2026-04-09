"use strict";

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
let lastPromptText = null;
let lastPromptAt = 0;
const MARKER_DRAW_DISTANCE = 90;
const PROMPT_REFRESH_MS = 450;
const ENABLE_TOP_PROMPT = false;
const FARM_SEED_ITEM_IDS = new Set([400, 402, 404]);
const FARM_INTERACT_RADIUS = 6.0;
const FARM_HARVEST_RADIUS = 1.0;
const FARM_PLANT_ANIM = { dict: "amb@world_human_gardener_plant@male@idle_a", name: "idle_b", duration: 1800 };
const FARM_HARVEST_ANIM = { dict: "amb@world_human_gardener_plant@male@idle_a", name: "idle_b", duration: 1400 };
const READY_STAGE_FALLBACK_MS = 60 * 1000;
const OVERRIPE_STAGE_FALLBACK_MS = 45 * 1000;
const FARMS_CLIENT_DEBUG = true;

function debugLog(message, data) {
    if (!FARMS_CLIENT_DEBUG) return;
    if (data === undefined) return console.log(`[farms][client] ${message}`);
    console.log(`[farms][client] ${message}`, data);
}

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
    const previousStates = plotStates.slice();
    plotPositions = positions.map(pos => new mp.Vector3(pos.x, pos.y, pos.z));
    plotStates = positions.map((_, index) => Object.assign({
        state: "available",
        action: null,
        owner: null,
        seedName: null,
        readyAt: null,
        ripeEndsAt: null,
        overripeEndsAt: null,
    }, previousStates[index] || {}));
    debugLog("farms.plots.init applied", { plots: positions.length, restoredStates: previousStates.filter(Boolean).length });
}

function clearMarkers() {
    plotStates = [];
    plotPositions = [];
}

function updateMarker(index) {
    if (!plotPositions[index] || !plotStates[index]) return;
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

function setPromptText(text) {
    if (!ENABLE_TOP_PROMPT) {
        lastPromptText = null;
        lastPromptAt = Date.now();
        mp.prompt.hide();
        return;
    }
    const nextText = text || null;
    const now = Date.now();
    if (nextText === lastPromptText && (!nextText || (now - lastPromptAt) < PROMPT_REFRESH_MS)) return;
    lastPromptText = nextText;
    lastPromptAt = now;
    if (!nextText) return mp.prompt.hide();
    mp.prompt.show(nextText);
}

function ensurePlotState(index) {
    if (!plotStates[index]) {
        plotStates[index] = {
            state: "available",
            action: null,
            owner: null,
            seedName: null,
            readyAt: null,
            ripeEndsAt: null,
            overripeEndsAt: null,
        };
        debugLog("plot state created", { index });
    }
    return plotStates[index];
}

function updatePrompt() {
    const handSeedItemId = getHandSeedItemId();
    const canPlantByHand = handSeedItemId != null;
    if (!currentPlot) {
        if (isLocalInsidePlantZone()) {
            if (canPlantByHand) setPromptText("Нажмите <span>E</span>, чтобы посадить");
            else setPromptText("Возьмите семена в руки для посадки");
            return;
        }
        if (insideFarmMenuZone) {
            setPromptText("Нажмите <span>E</span>, чтобы поговорить с фермером");
            return;
        }
        setPromptText(null);
        return;
    }
    const state = currentPlot.state;
    const owner = currentPlot.owner || "игрок";
    if (currentPlot.action === "plant") {
        if (canPlantByHand) setPromptText("Нажмите <span>E</span>, чтобы посадить");
        else setPromptText("Возьмите семена в руки для посадки");
    } else if (currentPlot.action === "harvest") {
        if (state === "ready_foreign") setPromptText(`Нажмите <span>E</span>, чтобы сорвать чужой урожай (${owner})`);
        else setPromptText("Нажмите <span>E</span>, чтобы собрать урожай");
    } else if (state === "growing" || state === "growing_foreign") {
        const seconds = getSecondsLeft(currentPlot);
        const prefix = state === "growing_foreign" ? `Чужая грядка (${owner})` : "Ваша грядка";
        setPromptText(`${prefix}: рост ~${seconds} сек.`);
    } else if (state === "ready" || state === "ready_foreign") {
        setPromptText(`Созрело: ${getSecondsLeft(currentPlot)} сек. до перезревания`);
    } else if (state === "overripe" || state === "overripe_foreign") {
        setPromptText(`Перезрело: ${getSecondsLeft(currentPlot)} сек. до исчезновения`);
    } else if (state === "cooldown") {
        setPromptText(`Грядка восстанавливается (~${getSecondsLeft(currentPlot)} сек.)`);
    } else {
        setPromptText(null);
    }
}

function requestFarmSync() {
    mp.events.callRemote("farms.menu.sync");
}

function getHandSeedItemId() {
    const player = mp.players.local;
    if (!player || typeof player.getVariable !== "function") return null;
    const raw = player.getVariable("hands");
    const itemId = parseInt(raw);
    if (!Number.isInteger(itemId)) return null;
    return FARM_SEED_ITEM_IDS.has(itemId) ? itemId : null;
}

function getPlantSeedArg() {
    const handSeedItemId = getHandSeedItemId();
    if (handSeedItemId != null) return handSeedItemId;
    return null;
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
    const current = ensurePlotState(index);
    plotStates[index] = Object.assign({}, current, payload);
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

function isHarvestableState(state) {
    if (!state) return false;
    return state.action === "harvest"
        || state.state === "ready"
        || state.state === "ready_foreign"
        || state.state === "overripe"
        || state.state === "overripe_foreign";
}

function playFarmAction(animDict, animName, animMs, done) {
    const localPlayer = mp.players.local;
    if (!localPlayer) return done();
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        try {
            if (localPlayer && mp.players.local) {
                localPlayer.stopAnimTask(animDict, animName, -4.0);
                localPlayer.clearTasksImmediately();
            }
        } catch (e) {}
        done();
    };
    const startedAt = Date.now();
    const tryPlay = (attempt = 0) => {
        if (!mp.players.local) return finish();
        mp.game.streaming.requestAnimDict(animDict);
        if (!mp.game.streaming.hasAnimDictLoaded(animDict)) {
            if (attempt >= 40) {
                debugLog("anim dict load timeout", { animDict, animName, attempts: attempt });
                return finish();
            }
            return setTimeout(() => tryPlay(attempt + 1), 25);
        }
        debugLog("anim dict loaded", { animDict, animName, waitMs: Date.now() - startedAt, attempts: attempt });
        localPlayer.taskPlayAnim(animDict, animName, 4.0, 0.0, animMs, 49, 0, false, false, false);
        debugLog("animation started", { animDict, animName, animMs });
        setTimeout(finish, animMs + 120);
    };
    setTimeout(finish, animMs + 1200);
    tryPlay(0);
}

function performHarvest(index) {
    const nearestHarvestIndex = getNearestHarvestablePlotIndex(FARM_HARVEST_RADIUS);
    const targetIndex = nearestHarvestIndex !== -1 ? nearestHarvestIndex : index;
    if (targetIndex === -1) {
        mp.notify.warning("Подойдите ближе к созревшей грядке (1м)", "Ферма");
        return;
    }
    plantingInProgress = true;
    playFarmAction(FARM_HARVEST_ANIM.dict, FARM_HARVEST_ANIM.name, FARM_HARVEST_ANIM.duration, () => {
        mp.events.callRemote("farms.plot.harvest", targetIndex);
        plantingInProgress = false;
        setPromptText(null);
    });
}

function performPlant(index, seedArg) {
    plantingInProgress = true;
    playFarmAction(FARM_PLANT_ANIM.dict, FARM_PLANT_ANIM.name, FARM_PLANT_ANIM.duration, () => {
        mp.events.callRemote("farms.plot.plant", index, seedArg);
        plantingInProgress = false;
        setPromptText(null);
    });
}

function getNearestPlotIndex(maxDistance = FARM_INTERACT_RADIUS) {
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
        if ((state.state === "growing" || state.state === "growing_foreign") && state.readyAt && getSecondsLeft(state) <= 0) {
            state.state = state.state === "growing_foreign" ? "ready_foreign" : "ready";
            state.action = "harvest";
            state.readyAt = null;
            if (!state.ripeEndsAt) state.ripeEndsAt = Date.now() + READY_STAGE_FALLBACK_MS;
            updateMarker(i);
        }
        if ((state.state === "ready" || state.state === "ready_foreign") && state.ripeEndsAt && getSecondsLeft(state) <= 0) {
            state.state = state.state === "ready_foreign" ? "overripe_foreign" : "overripe";
            state.action = "harvest";
            state.ripeEndsAt = null;
            if (!state.overripeEndsAt) state.overripeEndsAt = Date.now() + OVERRIPE_STAGE_FALLBACK_MS;
            updateMarker(i);
        }
        if (state.state !== "growing" && state.state !== "growing_foreign" && state.state !== "ready" && state.state !== "ready_foreign" && state.state !== "overripe" && state.state !== "overripe_foreign") continue;

        const isReadyToHarvest = state.state === "ready" || state.state === "ready_foreign" || state.state === "overripe" || state.state === "overripe_foreign";
        const statusText = isReadyToHarvest ? "Готово к сбору" : "Не готово к сбору";
        let text = `${state.seedName || "Растение"} | ${statusText}`;
        text += `: ${getSecondsLeft(state)} сек.`;
        if (isReadyToHarvest) text += " | Нажмите E для сбора";

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

        if (isReadyToHarvest) {
            const harvestText = "ГОТОВО К СБОРУ [E]";
            mp.game.graphics.drawText(harvestText, [screen.x, screen.y + 0.018], {
                font: 4,
                color: [100, 255, 100, 240],
                scale: [0.32, 0.32],
                outline: true,
                centre: true,
            });
        }
    }
}

function renderPlotMarkers() {
    const player = mp.players.local;
    if (!player) return;
    const nearestHarvestIndex = getNearestHarvestablePlotIndex(FARM_INTERACT_RADIUS);
    for (let i = 0; i < plotPositions.length; i++) {
        const pos = plotPositions[i];
        const state = plotStates[i];
        if (!pos || !state) continue;
        if (player.position.distanceTo(pos) > MARKER_DRAW_DISTANCE) continue;
        const color = markerColors[state.state] || markerColors.busy;
        mp.game.graphics.drawMarker(
            1,
            pos.x, pos.y, pos.z - 1,
            0, 0, 0,
            0, 0, 0,
            0.55, 0.55, 0.55,
            color[0], color[1], color[2], color[3],
            false, true, 2, false, null, null, false
        );

        const isHarvestReady = state.state === "ready" || state.state === "ready_foreign" || state.state === "overripe" || state.state === "overripe_foreign";
        if (isHarvestReady) {
            const isNearestHarvest = i === nearestHarvestIndex;
            mp.game.graphics.drawMarker(
                0,
                pos.x, pos.y, pos.z + 0.35,
                0, 0, 0,
                0, 0, 0,
                isNearestHarvest ? 0.38 : 0.28, isNearestHarvest ? 0.38 : 0.28, isNearestHarvest ? 0.38 : 0.28,
                isNearestHarvest ? 255 : 100, 255, isNearestHarvest ? 120 : 100, isNearestHarvest ? 245 : 220,
                false, true, 2, false, null, null, false
            );

            const screen = mp.game.graphics.world3dToScreen2d(new mp.Vector3(pos.x, pos.y, pos.z + 0.9));
            if (screen) {
                mp.game.graphics.drawText("ГОТОВО К СБОРУ [E]", [screen.x, screen.y], {
                    font: 4,
                    color: isNearestHarvest ? [255, 255, 160, 250] : [100, 255, 100, 240],
                    scale: isNearestHarvest ? [0.36, 0.36] : [0.33, 0.33],
                    outline: true,
                    centre: true,
                });
            }
        }
    }
}

function getNearestHarvestablePlotIndex(maxDistance = FARM_INTERACT_RADIUS) {
    if (!plotPositions.length || !plotStates.length || !mp.players.local) return -1;
    const me = mp.players.local.position;
    let nearest = -1;
    let bestDistance = maxDistance;
    for (let i = 0; i < plotPositions.length; i++) {
        const state = plotStates[i];
        const fallbackPos = plotPositions[i];
        const pos = (state && state.interactPos) ? state.interactPos : fallbackPos;
        if (!state || !pos) continue;
        if (!isHarvestableState(state)) continue;
        const dx = me.x - Number(pos.x);
        const dy = me.y - Number(pos.y);
        const dz = me.z - Number(pos.z);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= bestDistance) {
            bestDistance = dist;
            nearest = i;
        }
    }
    return nearest;
}

mp.events.add({
    "characterInit.done": () => {
        requestFarmSync();
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
        ensurePlotState(index);
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
    "farms.plot.ready": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        const state = ensurePlotState(index);
        state.state = "ready";
        state.action = "harvest";
        state.readyAt = null;
        info = parsePayload(info, {});
        state.ripeEndsAt = Number(info.ripeEndsAt) || (Date.now() + READY_STAGE_FALLBACK_MS);
        state.overripeEndsAt = null;
        debugLog("event ready", { index, ripeEndsAt: state.ripeEndsAt });
        updatePrompt();
        updateMarker(index);
    },
    "farms.plot.overripe": (index, info) => {
        index = parseInt(index);
        if (isNaN(index)) return;
        const state = ensurePlotState(index);
        state.state = "overripe";
        state.action = "harvest";
        state.ripeEndsAt = null;
        info = parsePayload(info, {});
        state.overripeEndsAt = Number(info.overripeEndsAt) || (Date.now() + OVERRIPE_STAGE_FALLBACK_MS);
        debugLog("event overripe", { index, overripeEndsAt: state.overripeEndsAt });
        updatePrompt();
        updateMarker(index);
    },
    "farms.menu.enter": () => {
        insideFarmMenuZone = true;
        requestFarmSync();
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
        updatePrompt();
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
        renderPlotMarkers();
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
        if (currentPlot || insideFarmMenuZone || insideNow) updatePrompt();
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
        setPromptText(null);
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

    if (mp.busy.includes() || plantingInProgress) return;

    const nearestHarvestIndex = getNearestHarvestablePlotIndex(FARM_HARVEST_RADIUS);
    if (nearestHarvestIndex !== -1) {
        performHarvest(nearestHarvestIndex);
        return;
    }

    if (currentPlot && isHarvestableState(currentPlot)) {
        performHarvest(currentPlot.index);
        return;
    }

    if (insideFarmMenuZone) {
        mp.events.callRemote("farms.menu.open");
        return;
    }

    if (!isLocalInsidePlantZone()) return;

    const seedArg = getPlantSeedArg();
    if (seedArg == null) {
        const fallbackHarvestIndex = currentPlot ? currentPlot.index : -1;
        performHarvest(fallbackHarvestIndex);
        return;
    }

    const plantIndex = currentPlot ? currentPlot.index : -1;
    performPlant(plantIndex, seedArg);
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
    setPromptText(null);
});
