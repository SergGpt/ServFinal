"use strict";

const PREVIEW_LIMIT_PER_BATCH = 30;
const PREVIEW_CAPTURE_DELAY = 350;
const PREVIEW_CLEANUP_DELAY = 250;

const CLOTHES_COMPONENTS = {
    2: 7,
    8: 4,
    9: 6,
    13: 5,
};

const CLOTHES_PROPS = {
    6: 0,
    1: 1,
    10: 2,
    11: 6,
    12: 7,
};

let currentLots = [];
let previewQueue = [];
let previewBusy = false;
let queuedLots = {};
let capturedLots = {};

function parsePayload(lot) {
    if (!lot) return {};
    if (lot.lotPayload && typeof lot.lotPayload === "object") return lot.lotPayload;
    if (typeof lot.lotPayload === "string" && lot.lotPayload.length) {
        try {
            return JSON.parse(lot.lotPayload);
        } catch (e) {
            return {};
        }
    }
    return {};
}

function toNumber(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getLotDescriptor(lot) {
    const lotType = String(lot && lot.lotType ? lot.lotType : "").toLowerCase();
    const payload = parsePayload(lot);

    if (lotType === "vehicle") {
        const model = payload.modelName || payload.model || lot.modelName;
        if (!model) return null;
        return { type: "vehicle", model, plate: payload.plate || lot.plate || "MARKET" };
    }

    if (lotType === "item" || lotType === "clothes") {
        const itemId = Number(lot.itemId || payload.itemId);
        const params = payload.params || lot.itemParams || {};
        const itemInfo = mp.inventory && mp.inventory.itemsInfo ? mp.inventory.itemsInfo[itemId] : null;
        const model = params.model || params.modelName || (itemInfo && itemInfo.model);

        if (lotType === "clothes" || CLOTHES_COMPONENTS[itemId] != null || CLOTHES_PROPS[itemId] != null || itemId === 3 || itemId === 7 || itemId === 14) {
            return { type: "clothes", itemId, params };
        }

        if (model) return { type: "object", itemId, model, params };
    }

    return null;
}

function requestModel(model, callback) {
    const hash = typeof model === "number" ? model : mp.game.joaat(String(model));
    if (!mp.game.streaming.isModelValid(hash)) return callback(null);

    mp.game.streaming.requestModel(hash);
    const started = Date.now();
    const waitTimer = mp.timer.add(() => {
        if (mp.game.streaming.hasModelLoaded(hash)) {
            mp.timer.remove(waitTimer);
            callback(hash);
            return;
        }
        if (Date.now() - started > 3000) {
            mp.timer.remove(waitTimer);
            callback(null);
        }
    }, 100, true);
}

function setComponent(entity, component, drawable, texture) {
    if (!entity) return;
    if (typeof entity.setComponentVariation === "function") {
        entity.setComponentVariation(component, toNumber(drawable), toNumber(texture), 0);
    } else if (typeof entity.setClothes === "function") {
        entity.setClothes(component, toNumber(drawable), toNumber(texture), 0);
    }
}

function setProp(entity, component, drawable, texture) {
    if (!entity) return;
    const parsedDrawable = toNumber(drawable, -1);
    const parsedTexture = toNumber(texture);
    if (typeof entity.setPropIndex === "function") {
        entity.setPropIndex(component, parsedDrawable, parsedTexture, true);
    } else if (typeof entity.setProp === "function") {
        entity.setProp(component, parsedDrawable, parsedTexture);
    }
}

function applyClothingPreview(ped, itemId, params) {
    const variation = toNumber(params.variation || params.drawable || params.drawableId);
    const texture = toNumber(params.texture || params.textureId);

    setComponent(ped, 3, 15, 0);
    setComponent(ped, 11, 15, 0);
    setComponent(ped, 8, 15, 0);
    setComponent(ped, 4, 18, 8);
    setComponent(ped, 6, 34, 0);

    if (CLOTHES_COMPONENTS[itemId] != null) {
        setComponent(ped, CLOTHES_COMPONENTS[itemId], variation, texture);
        return;
    }

    if (CLOTHES_PROPS[itemId] != null) {
        setProp(ped, CLOTHES_PROPS[itemId], variation, texture);
        return;
    }

    if (itemId === 3) {
        setComponent(ped, 9, variation, texture);
        return;
    }

    if (itemId === 7) {
        setComponent(ped, 3, params.torso || 0, params.tTexture || 0);
        setComponent(ped, 11, variation, texture);
        if (params.undershirt != null) setComponent(ped, 8, params.undershirt, params.uTexture || 0);
        if (params.decal != null) setComponent(ped, 10, params.decal, params.dTexture || 0);
        return;
    }

    if (itemId === 14) {
        setComponent(ped, 1, variation, texture);
    }
}

function createPreviewCamera(position, type) {
    let camPosition;
    let target;
    let fov = 38;

    if (type === "vehicle") {
        camPosition = new mp.Vector3(position.x + 4.8, position.y - 6.0, position.z + 2.3);
        target = new mp.Vector3(position.x, position.y, position.z + 0.8);
        fov = 34;
    } else if (type === "clothes") {
        camPosition = new mp.Vector3(position.x, position.y - 3.2, position.z + 1.15);
        target = new mp.Vector3(position.x, position.y, position.z + 0.75);
        fov = 32;
    } else {
        camPosition = new mp.Vector3(position.x, position.y - 2.0, position.z + 0.65);
        target = new mp.Vector3(position.x, position.y, position.z + 0.25);
        fov = 36;
    }

    const cam = mp.cameras.new(`marketplace.preview.${Date.now()}`, camPosition, new mp.Vector3(0, 0, 0), fov);
    cam.pointAtCoord(target.x, target.y, target.z);
    cam.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 0, true, false);
    return cam;
}

function destroyPreview(entity, cam) {
    try {
        if (cam) {
            cam.setActive(false);
            cam.destroy();
        }
        mp.game.cam.renderScriptCams(false, false, 0, true, false);
    } catch (e) {}

    try {
        if (entity && typeof entity.destroy === "function") entity.destroy();
    } catch (e) {}
}

function publishPreview(lotId, url) {
    currentLots = currentLots.map((lot) => {
        if (String(lot.id) !== String(lotId)) return lot;
        return Object.assign({}, lot, {
            preview: url,
            image: url,
            previewReady: true,
        });
    });

    if (mp.callCEFR) {
        mp.callCEFR("marketplace.phone.data", [currentLots, null]);
    }
}

function takePreviewScreenshot(lotId, entity, cam) {
    const fileName = `marketplace_lot_${lotId}.jpg`;
    const url = `http://screenshots/${fileName}?v=${Date.now()}`;

    if (!mp.gui || typeof mp.gui.takeScreenshot !== "function") {
        destroyPreview(entity, cam);
        return finishQueueItem();
    }

    mp.timer.add(() => {
        try {
            mp.gui.takeScreenshot(fileName, 1, 85, 0);
        } catch (e) {
            destroyPreview(entity, cam);
            return finishQueueItem();
        }

        mp.timer.add(() => {
            destroyPreview(entity, cam);
            capturedLots[lotId] = url;
            publishPreview(lotId, url);
            finishQueueItem();
        }, PREVIEW_CLEANUP_DELAY);
    }, PREVIEW_CAPTURE_DELAY);
}

function getPreviewPosition(index) {
    const playerPos = mp.players.local.position;
    return new mp.Vector3(playerPos.x + 35 + (index % 5) * 8, playerPos.y + 35 + Math.floor(index / 5) * 8, playerPos.z + 12);
}

function captureVehicle(lot, descriptor, position) {
    requestModel(descriptor.model, (hash) => {
        if (!hash) return finishQueueItem();

        const vehicle = mp.vehicles.new(hash, position, {
            heading: 225,
            numberPlate: descriptor.plate || "MARKET",
            dimension: mp.players.local.dimension,
        });

        if (vehicle && typeof vehicle.freezePosition === "function") vehicle.freezePosition(true);
        if (vehicle && typeof vehicle.setDirtLevel === "function") vehicle.setDirtLevel(0);

        const cam = createPreviewCamera(position, "vehicle");
        takePreviewScreenshot(lot.id, vehicle, cam);
    });
}

function captureObject(lot, descriptor, position) {
    requestModel(descriptor.model, (hash) => {
        if (!hash) return finishQueueItem();

        const object = mp.objects.new(hash, position, {
            rotation: new mp.Vector3(0, 0, 35),
            dimension: mp.players.local.dimension,
        });

        const cam = createPreviewCamera(position, "object");
        takePreviewScreenshot(lot.id, object, cam);
    });
}

function captureClothes(lot, descriptor, position) {
    const localModel = mp.players.local && mp.players.local.model ? mp.players.local.model : mp.game.joaat("mp_m_freemode_01");
    requestModel(localModel, (hash) => {
        if (!hash) return finishQueueItem();

        const ped = mp.peds.new(hash, position, 180, mp.players.local.dimension);
        if (ped && typeof ped.freezePosition === "function") ped.freezePosition(true);
        mp.timer.add(() => {
            applyClothingPreview(ped, descriptor.itemId, descriptor.params || {});
            const cam = createPreviewCamera(position, "clothes");
            takePreviewScreenshot(lot.id, ped, cam);
        }, 150);
    });
}

function processQueue() {
    if (previewBusy || !previewQueue.length) return;
    previewBusy = true;

    const lot = previewQueue.shift();
    const descriptor = getLotDescriptor(lot);
    if (!descriptor) return finishQueueItem();

    const position = getPreviewPosition(lot.id || Date.now());
    if (descriptor.type === "vehicle") return captureVehicle(lot, descriptor, position);
    if (descriptor.type === "clothes") return captureClothes(lot, descriptor, position);
    return captureObject(lot, descriptor, position);
}

function finishQueueItem() {
    previewBusy = false;
    mp.timer.add(processQueue, 150);
}

function enqueuePreview(lot) {
    if (!lot || !lot.id) return;
    if (capturedLots[lot.id] || queuedLots[lot.id] || lot.previewReady) return;
    const descriptor = getLotDescriptor(lot);
    if (!descriptor) return;

    queuedLots[lot.id] = true;
    previewQueue.push(lot);
    processQueue();
}

function preparePreviewBatch(lots) {
    if (!Array.isArray(lots)) return;
    currentLots = lots.slice();
    lots.slice(0, PREVIEW_LIMIT_PER_BATCH).forEach(enqueuePreview);
}

mp.events.add("marketplace.phone.data", (lots) => {
    preparePreviewBatch(lots);
});

mp.events.add("marketplace.preview.request", (rawLot) => {
    let lot = rawLot;
    if (typeof rawLot === "string") {
        try {
            lot = JSON.parse(rawLot);
        } catch (e) {
            lot = null;
        }
    }
    enqueuePreview(lot);
});
