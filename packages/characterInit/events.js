"use strict";
/// Модуль выбора и создания персоонажа
let admin;
let characterInit = require("./index.js");
let logger = call("logger");
let utils = call("utils");
let inventory;
let donate;

const freemodeCharacters = [mp.joaat("mp_m_freemode_01"), mp.joaat("mp_f_freemode_01")];
const selectionCamPos = [-1209.9, -2511.3, 14.5];
const selectionPlayerPos = new mp.Vector3(selectionCamPos[0], selectionCamPos[1], selectionCamPos[2] - 10);
const selectionCamDist = 2.5;
const selectionPedDist = 2.5;
const selectionPedsRotation = 70;
const selectionPedRotation = 260;
const selectionCamRotation = 300;
const selectionPreviewZ = 13.95;
const selectionSinCamRot = Math.sin(selectionCamRotation * Math.PI / 180);
const selectionCosCamRot = Math.cos(selectionCamRotation * Math.PI / 180);
const selectionSinPedRot = Math.sin((selectionPedsRotation - 90) * Math.PI / 180);
const selectionCosPedRot = Math.cos((selectionPedsRotation - 90) * Math.PI / 180);

function roundSelectionDebug(value) {
    return Math.round(value * 100) / 100;
}

function getSelectionPreviewPosition(index) {
    return new mp.Vector3(
        (selectionCamPos[0] + index * selectionPedDist * selectionSinPedRot) + selectionCamDist * selectionSinCamRot,
        (selectionCamPos[1] + index * selectionPedDist * selectionCosPedRot) + selectionCamDist * selectionCosCamRot,
        selectionPreviewZ
    );
}

function formatSelectionPosition(position) {
    return `x=${roundSelectionDebug(position.x)}, y=${roundSelectionDebug(position.y)}, z=${roundSelectionDebug(position.z)}`;
}

function getPedDebugId(ped) {
    if (!ped) return "null";
    if (ped.id != null) return ped.id;
    if (ped.remoteId != null) return ped.remoteId;
    return "unknown";
}

function safePedCall(ped, method, args) {
    if (!ped || typeof ped[method] !== "function") return false;

    try {
        ped[method](...args);
        return true;
    }
    catch (e) {
        return false;
    }
}

function safePedAssign(ped, key, value) {
    if (!ped) return false;

    try {
        ped[key] = value;
        return true;
    }
    catch (e) {
        return false;
    }
}

function applySelectionPreviewPedView(ped, characterData) {
    if (!ped || !characterData) return;

    const info = characterData.charInfo || {};
    const clothes = characterData.charClothes || {};

    safePedCall(ped, "setClothes", [2, info.hair || 0, 0, 2]);

    if (Array.isArray(clothes.clothes)) {
        clothes.clothes.forEach(item => {
            safePedCall(ped, "setClothes", [item[0], item[1], item[2], 0]);
        });
    }

    if (Array.isArray(clothes.props)) {
        clothes.props.forEach(item => {
            safePedCall(ped, "setProp", [item[0], item[1], item[2]]);
        });
    }
}

function destroySelectionPreviewPeds(player, reason = "unknown") {
    if (!player.characterInit || !Array.isArray(player.characterInit.previewPeds)) return;

    player.characterInit.previewPeds.forEach((ped) => {
        if (!ped) return;

        try {
            if (typeof ped.destroy === "function") ped.destroy();
        }
        catch (e) {
            console.log(`[characterInit][selectionDebug] ${player.name || player.id}: failed to destroy server preview ped id=${getPedDebugId(ped)}, reason=${reason}, error=${e.message}`);
        }
    });

    player.characterInit.previewPeds = [];
    console.log(`[characterInit][selectionDebug] ${player.name || player.id}: destroyed server preview peds, reason=${reason}`);
}

function createSelectionPreviewPeds(player, charInfos) {
    if (!player.characterInit) player.characterInit = { created: false };

    destroySelectionPreviewPeds(player, "recreate");
    player.characterInit.previewPeds = [];

    for (let i = 0; i < charInfos.length; i++) {
        const info = charInfos[i].charInfo || {};
        const gender = info.gender === 1 ? 1 : 0;
        const model = freemodeCharacters[gender];
        const position = getSelectionPreviewPosition(i);
        let ped;

        try {
            ped = mp.peds.new(model, position, {
                heading: selectionPedRotation,
                dimension: player.dimension,
                dynamic: true,
                invincible: true,
            });
        }
        catch (e) {
            console.log(`[characterInit][selectionDebug] ${player.name || player.id}: failed to create server preview ped #${i}, model=${model}, name=${info.name || "empty"}, ${formatSelectionPosition(position)}, dim=${player.dimension}, error=${e.message}`);
            continue;
        }

        safePedAssign(ped, "dimension", player.dimension);
        safePedAssign(ped, "heading", selectionPedRotation);
        safePedAssign(ped, "alpha", 255);
        safePedAssign(ped, "visible", true);

        applySelectionPreviewPedView(ped, charInfos[i]);
        player.characterInit.previewPeds.push(ped);

        console.log(`[characterInit][selectionDebug] ${player.name || player.id}: server preview ped #${i} id=${getPedDebugId(ped)}, model=${model}, name=${info.name || "empty"}, ${formatSelectionPosition(position)}, h=${selectionPedRotation}, dim=${player.dimension}`);
    }
}

module.exports = {
    "init": () => {
        admin = call('admin');
        inventory = call('inventory');
        donate = call('donate');
        characterInit.moduleInit();
        inited(__dirname);
    },
    "auth.done": (player) => {
        player.characterInit = {
            created: false,
        };
        mp.events.call('characterInit.start', player);
    },
    "characterInit.start": async (player) => {
        let charInfos = await characterInit.init(player);
        if (charInfos.length != 0 && player.account.slots == 1 && charInfos[0].charInfo.hours >= characterInit.timeForSecondSlot) {
            player.account.slots = 2;
            await player.account.save();
        }

        if (!player.characterInit) player.characterInit = { created: false };
        player.dimension = player.id + 1000;
        player.position = selectionPlayerPos;
        console.log(`[characterInit][selectionDebug] ${player.name || player.id}: moved player to selection streamer anchor ${formatSelectionPosition(selectionPlayerPos)}, dim=${player.dimension}`);
        createSelectionPreviewPeds(player, charInfos);

        player.call('characterInit.init', [charInfos, {
            slots: player.account.slots,
            coins: player.account.donate,
            costSecondSlot: characterInit.costSecondSlot,
            timeForSecondSlot: characterInit.timeForSecondSlot,
            costThirdSlot: characterInit.costThirdSlot,
            selectionDimension: player.dimension,
        }]);
    },

    "characterInit.selection.debug": (player, data) => {
        let payload;

        try {
            payload = typeof data === "string" ? JSON.parse(data) : data;
        }
        catch (e) {
            console.log(`[characterInit][selectionDebug] ${player.name || player.id}: invalid payload`);
            return;
        }

        if (!payload || typeof payload !== "object") return;

        const playerName = player.name || `id:${player.id}`;
        const type = payload.type || "unknown";
        const dimension = payload.dimension == null ? "unknown" : payload.dimension;

        if (type === "client.dimension") {
            console.log(`[characterInit][selectionDebug] ${playerName}: client localDimension=${payload.localDimension}, serverSelectionDimension=${payload.serverSelectionDimension}, currentServerDimension=${player.dimension}`);
            return;
        }

        if (type === "marker.place") {
            const pos = payload.position || {};
            const marker = payload.marker || {};
            console.log(`[characterInit][selectionDebug] ${playerName}: marker #${payload.index} (${payload.name || "empty"}) pedPos x=${pos.x}, y=${pos.y}, z=${pos.z}, marker x=${marker.x}, y=${marker.y}, z=${marker.z}, dim=${dimension}`);
            return;
        }

        if (type === "ped.place") {
            const pos = payload.position || {};
            console.log(`[characterInit][selectionDebug] ${playerName}: ped #${payload.index} (${payload.name || "empty"}) placed at x=${pos.x}, y=${pos.y}, z=${pos.z}, h=${payload.heading}, dim=${dimension}`);
            return;
        }

        if (type === "ped.visibility") {
            const visibility = payload.visibility || {};
            const pos = visibility.position || {};
            console.log(`[characterInit][selectionDebug] ${playerName}: ped #${payload.index} (${payload.name || "empty"}) visibility ${payload.stage}, exists=${visibility.exists}, collectionExists=${visibility.collectionExists}, nativeExists=${visibility.nativeExists}, visible=${visibility.visible}, alpha=${visibility.alpha}, onScreen=${visibility.onScreen}, occluded=${visibility.occluded}, handle=${visibility.handle}, pos x=${pos.x}, y=${pos.y}, z=${pos.z}, dim=${dimension}`);
            return;
        }

        if (type === "ped.handle") {
            const visibility = payload.visibility || {};
            console.log(`[characterInit][selectionDebug] ${playerName}: ped #${payload.index} (${payload.name || "empty"}) handle mode=${payload.mode || "unknown"}, ready=${payload.ready}, waitedMs=${payload.waitedMs}, collectionExists=${visibility.collectionExists}, nativeExists=${visibility.nativeExists}, handle=${visibility.handle}, dim=${dimension}`);
            return;
        }

        if (type === "ped.create.error") {
            console.log(`[characterInit][selectionDebug] ${playerName}: ped #${payload.index} (${payload.name || "empty"}) create error mode=${payload.mode || "unknown"}, message=${payload.message}, dim=${dimension}`);
            return;
        }

        if (type === "ped.retry") {
            console.log(`[characterInit][selectionDebug] ${playerName}: ped #${payload.index} (${payload.name || "empty"}) retry reason=${payload.reason}, dim=${dimension}`);
            return;
        }

        if (type === "ped.model") {
            console.log(`[characterInit][selectionDebug] ${playerName}: ped model ${payload.model} loaded=${payload.loaded}, reason=${payload.reason || "none"}, dim=${dimension}`);
            return;
        }

        if (type === "camera.create" || type === "camera.tp" || type === "camera.move") {
            const camera = payload.camera || {};
            const lookAt = payload.lookAt || {};
            console.log(`[characterInit][selectionDebug] ${playerName}: ${type} char #${payload.index}, camera x=${camera.x}, y=${camera.y}, z=${camera.z} -> lookAt x=${lookAt.x}, y=${lookAt.y}, z=${lookAt.z}, fov=${payload.fov}, dim=${dimension}`);
            return;
        }

        console.log(`[characterInit][selectionDebug] ${playerName}: ${JSON.stringify(payload).slice(0, 500)}`);
    },
    "characterInit.choose": (player, charnumber) => {
        if (charnumber == null || isNaN(charnumber)) return player.call('characterInit.choose.ans', [0]);
        if (charnumber < 0 || charnumber > 2) return player.call('characterInit.choose.ans', [0]);

        destroySelectionPreviewPeds(player, "choose");

        if (player.characters[charnumber]) {
            player.character = player.characters[charnumber];
            player.name = player.character.name;
            delete player.characters;
            player.dimension = 0;
            characterInit.applyCharacter(player);

            player.call('characterInit.choose.ans', [1]);
            characterInit.spawn(player);
            admin.checkClearWarns(player);
            mp.events.call('characterInit.done', player);
        } else {
            player.call('characterInit.choose.ans', [1]);
            characterInit.create(player);
        }
    },
    "characterInit.change": (player) => {
        if (player.account.donate < donate.changeAppearancePrice) return;
        player.lastPos = player.position;
        player.lastDim = player.dimension;
        player.dimension = player.id + 1;

        characterInit.create(player, true);
    },
    "characterInit.change.result": async (player, charData) => {
        if (charData) {
            player.characterInfo = JSON.parse(charData);

            player.character.father = player.characterInfo.father;
            player.character.mother = player.characterInfo.mother;
            player.character.similarity = player.characterInfo.similarity;
            player.character.skin = player.characterInfo.skin;
            player.character.hair = player.characterInfo.hair;
            player.character.hairColor = player.characterInfo.hairColor;
            player.character.hairHighlightColor = player.characterInfo.hairHighlightColor;
            player.character.eyebrowColor = player.characterInfo.eyebrowColor;
            player.character.beardColor = player.characterInfo.beardColor;
            player.character.eyeColor = player.characterInfo.eyeColor;
            player.character.blushColor = player.characterInfo.blushColor;
            player.character.lipstickColor = player.characterInfo.lipstickColor;
            player.character.chestHairColor = player.characterInfo.chestHairColor;

            for (let i = 0; i < 20; i++) {
                player.character.Features[i].value = player.characterInfo.Features[i].value;
                player.character.Features[i].order = player.characterInfo.Features[i].order;
                await player.character.Features[i].save();
            }
            for (let i = 0; i < 11; i++) {
                player.character.Appearances[i].value = player.characterInfo.Appearances[i].value;
                player.character.Appearances[i].opacity = player.characterInfo.Appearances[i].opacity;
                player.character.Appearances[i].order = player.characterInfo.Appearances[i].order;
                await player.character.Appearances[i].save();
            }

            await player.character.save();

            player.character.Appearances.sort((x, y) => {
                if (x.order > y.order) return 1;
                if (x.order < y.order) return -1;
                if (x.order === y.order) return 0;
            });
            player.character.Features.sort((x, y) => {
                if (x.order > y.order) return 1;
                if (x.order < y.order) return -1;
                if (x.order === y.order) return 0;
            });
        }
        characterInit.applyCharacter(player);
        inventory.updateAllView(player);
        player.position = player.lastPos;
        player.lastPos = null;
        player.dimension = player.lastDim;
        player.lastDim = null;
        player.characterInfo = null;
        player.account.donate -= donate.changeAppearancePrice;
        await player.account.save();
        mp.events.call("player.donate.changed", player);
    },
    "characterInit.slot.buy": async (player) => {
        let price = player.account.slots === 3 ? null : player.account.slots === 2 ? characterInit.costThirdSlot : characterInit.costSecondSlot;
        if (price) {
            if (player.account.donate >= price) {
                player.account.donate -= price;
                player.account.slots++;
                await player.account.save();
                player.call("characterInit.slot.buy.ans", [1, player.account.slots, player.account.donate]);
            }
            else {
                player.call("characterInit.slot.buy.ans", [0, player.account.slots, player.account.donate]);
            }
        }
        else {
            player.call("characterInit.slot.buy.ans", [2, player.account.slots, player.account.donate]);
        }
    },
    /// Разморозка игрока после выбора персоонажа
    "characterInit.done": (player) => {
        destroySelectionPreviewPeds(player, "done");
        player.call('characterInit.done');
        player.authTime = Date.now();

        logger.log(`Авторизовал персонажа (IP: ${player.ip})`, "characterInit", player);
    },
    /// События создания персоонажа
    "characterInit.create.check": (player, fullname, charData) => {
        characterInit.save(player, fullname, charData);
    },
    "characterInit.loadCharacter": (player) => {
        characterInit.applyCharacter(player);
    },
    "inventory.done": (player) => {
        if (player.characterInit.created) {
            characterInit.giveStartFood(player);
            characterInit.setStartClothes(player);
            // characterInit.giveStartWater(player);
        }
    },
    "playerQuit": (player) => {
        destroySelectionPreviewPeds(player, "quit");
        if (!player.character) return;

        var minutes = parseInt((Date.now() - player.authTime) / 1000 / 60);
        player.character.minutes += minutes;
        player.character.bonusMinutes += minutes;
        if (!player.dimension && !player.character.arrestTime) {
            player.character.x = player.position.x;
            player.character.y = player.position.y;
            player.character.z = player.position.z;
            player.character.h = player.heading;
        }
        player.character.save();

        player.account.lastIp = player.ip;
        player.account.lastDate = new Date();
        player.account.save();
        logger.log(`Деавторизовал персонажа`, "characterInit", player);
    },
};
