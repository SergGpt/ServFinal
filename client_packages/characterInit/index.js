"use strict";
/// Выбор персоонажа и подключение создания персоонажа
require("characterInit/characterCreate.js");
const freemodeCharacters = [mp.game.joaat("mp_m_freemode_01"), mp.game.joaat("mp_f_freemode_01")];

let charNum;
let charClothes = [];
let charInfos = [];

let peds = [];
let selectMarkers = [];
let currentCharacter = 0;

/// ИЗМЕНЯТЬ ДАННЫЕ НАСТРОЙКИ ДЛЯ УСТАНОВКИ ПЕДОВ
/// Начальная координата камеры
// Исходная позиция выбора персонажа в аэропорту. Не переносим её: под неё рассчитаны
// камера, маркеры и preview-клоны персонажей.
const camPos = [-1209.9, -2511.3, 14.5];//[-222.94, 6584.72, 8];//[1220.15, 195.36, 80.5];//[-1828.8, -870.1, 3.1];
/// На сколько ниже камера смотрит, чем находится
const camPosZDelta = -0.4;
/// Расстояние от камеры до текущего педа
const camDist = 2.5;
/// Расстояние между педами
const pedDist = 2.5;
/// Поворот линии педов
const pedsRotation = 70;
/// Поворот педа
const pedRotation = 260;
/// Поворот камеры
const camRotation = 300;

const cosCamRot = Math.cos(camRotation * Math.PI/180);
const sinCamRot = Math.sin(camRotation * Math.PI/180);
const cosPedRot = Math.cos((pedsRotation - 90) * Math.PI/180);
const sinPedRot = Math.sin((pedsRotation - 90) * Math.PI/180);

let isBinding = false;

let creatorTimer = null;
let slotsNumber;

const selectionAnchorBackDistance = 4.0;
const selectionAnchorDownOffset = 1.2;
function stopSelectionStreamingAnchor() {
    if (mp.game.streaming && typeof mp.game.streaming.clearFocus === "function") mp.game.streaming.clearFocus();
    if (mp.game.streaming && typeof mp.game.streaming.clearHdArea === "function") mp.game.streaming.clearHdArea();
}

function getSelectionCameraPosition(index = currentCharacter) {
    return new mp.Vector3(
        camPos[0] + index * pedDist * sinPedRot,
        camPos[1] + index * pedDist * cosPedRot,
        camPos[2]
    );
}

function getSelectionLookPosition(index = currentCharacter) {
    const cameraPosition = getSelectionCameraPosition(index);

    return new mp.Vector3(
        cameraPosition.x + camDist * sinCamRot,
        cameraPosition.y + camDist * cosCamRot,
        cameraPosition.z + camPosZDelta
    );
}

function getSelectionAnchorPosition(index = currentCharacter) {
    const cameraPosition = getSelectionCameraPosition(index);
    const lookPosition = getSelectionLookPosition(index);
    const forwardX = lookPosition.x - cameraPosition.x;
    const forwardY = lookPosition.y - cameraPosition.y;
    const length = Math.sqrt(forwardX * forwardX + forwardY * forwardY) || 1.0;

    return new mp.Vector3(
        cameraPosition.x - (forwardX / length) * selectionAnchorBackDistance,
        cameraPosition.y - (forwardY / length) * selectionAnchorBackDistance,
        cameraPosition.z - selectionAnchorDownOffset
    );
}

function requestSelectionScene(index = currentCharacter) {
    if (!mp.game.streaming) return;

    const cameraPosition = getSelectionCameraPosition(index);
    const lookPosition = getSelectionLookPosition(index);
    const anchorPosition = getSelectionAnchorPosition(index);

    if (typeof mp.game.streaming.setHdArea === "function") {
        mp.game.streaming.setHdArea(cameraPosition.x, cameraPosition.y, cameraPosition.z, 90.0);
    }
    if (typeof mp.game.streaming.requestCollisionAtCoord === "function") {
        mp.game.streaming.requestCollisionAtCoord(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        mp.game.streaming.requestCollisionAtCoord(lookPosition.x, lookPosition.y, lookPosition.z);
        mp.game.streaming.requestCollisionAtCoord(anchorPosition.x, anchorPosition.y, anchorPosition.z);
    }
    if (typeof mp.game.streaming.loadScene === "function") {
        mp.game.streaming.loadScene(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        mp.game.streaming.loadScene(lookPosition.x, lookPosition.y, lookPosition.z);
    }
}

function restoreLocalPlayerForSelection(index = currentCharacter) {
    const player = mp.players.local;
    const anchorPosition = getSelectionAnchorPosition(index);

    requestSelectionScene(index);
    player.setCoords(anchorPosition.x, anchorPosition.y, anchorPosition.z, false, false, false, false);
    player.freezePosition(true);
    player.setAlpha(255);
    if (typeof player.setVisible === "function") player.setVisible(true, false);
    if (typeof player.setCollision === "function") player.setCollision(false, false);
}

mp.events.add('characterInit.selectionAnchor.stop', stopSelectionStreamingAnchor);

mp.events.add('characterInit.init', (characters, accountInfo) => {
    stopSelectionStreamingAnchor();
    charClothes = [];
    charInfos = [];
    charNum = 0;
    currentCharacter = 0;
    restoreLocalPlayerForSelection();
    mp.gui.cursor.show(true, true);
    if (characters != null) {
        charNum = characters.length;
        for (let i = 0; i < characters.length; i++) {
            charInfos.push(characters[i].charInfo);
            charClothes.push(characters[i].charClothes);
        }
    }
    else {
        for (let i = 0; i < selectMarkers.length; i++) {
            selectMarkers[i].destroy();
            peds[i].destroy();
        }
        selectMarkers = [];
        peds = [];
        mp.callCEFV(`characterInfo.characters = []`);
        mp.callCEFV(`characterInfo.i = 0`);
    }
    if (!isBinding){
        binding(true);
        isBinding = true;
    }

    createPeds();
    setInfo();

    if (characters != null) {
        mp.utils.cam.create(camPos[0], camPos[1], camPos[2], camPos[0] + camDist * sinCamRot, camPos[1] + camDist * cosCamRot, camPos[2] + camPosZDelta, 60);
        slotsNumber = accountInfo.slots;
        mp.callCEFV(`characterInfo.slots = ${accountInfo.slots}`);
        mp.callCEFV(`characterInfo.coins = ${accountInfo.coins}`);
        mp.callCEFV(`characterAddSlot.hours = ${accountInfo.timeForSecondSlot}`);
        if (slotsNumber == 1) {
            mp.callCEFV(`characterAddSlot.price = ${accountInfo.costSecondSlot}`);
        }
        else {
            mp.callCEFV(`characterAddSlot.price = ${accountInfo.costThirdSlot}`);
        }

    }
    else {
        mp.utils.cam.tpTo(camPos[0] + currentCharacter * pedDist * sinPedRot,
            camPos[1] + currentCharacter * pedDist * cosPedRot,
            camPos[2],
            (camPos[0] + currentCharacter * pedDist * sinPedRot) + camDist * sinCamRot,
            (camPos[1] + currentCharacter * pedDist * cosPedRot) + camDist * cosCamRot,
            camPos[2] + camPosZDelta, 60);
        mp.callCEFV(`characterInfo.show = true;`);
    }

    //mp.players.local.setAlpha(0);
    mp.events.call("godmode.set", false);
});

mp.events.add("characterInit.done", () => {
    stopSelectionStreamingAnchor();
    mp.gui.cursor.show(false, false);
    mp.players.local.setAlpha(255);
    if (typeof mp.players.local.setVisible === "function") mp.players.local.setVisible(true, false);
    if (typeof mp.players.local.setCollision === "function") mp.players.local.setCollision(true, true);
    mp.players.local.freezePosition(false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);
    mp.utils.disablePlayerMoving(false);

    mp.utils.cam.destroy();

    for (let i = 0; i < selectMarkers.length; i++) {
        selectMarkers[i].destroy();
        peds[i].destroy();
    }
    selectMarkers = [];
    peds = [];

    // Отключение регенарции здоровья
    mp.game.player.setHealthRechargeMultiplier(0);

    mp.utils.requestIpls();
});

mp.events.add('characterInit.slot.buy', () => {
    mp.events.callRemote('characterInit.slot.buy');
});
mp.events.add('characterInit.slot.buy.ans', (result, slots, coins) => {
    mp.callCEFV(`characterInfo.slots = ${slots}`);
    mp.callCEFV(`characterInfo.coins = ${coins}`);
    if (result === 0) {
        mp.notify.error("Недостаточно коинов на счете");
    }
    if (result === 2) {
        mp.notify.error("Невозможно иметь более 3 слотов");
    }
    mp.callCEFV(`loader.show = false;`);
});

mp.events.add('characterInit.choose', () => {
    if(isBinding) {
        binding(false);
        isBinding = false;
        mp.events.callRemote('characterInit.choose', currentCharacter);
    }
});
mp.events.add('characterInit.choose.ans', (ans) => {     //0 - не успешно     1 - успешно
    if (ans === 0) {
        if(!isBinding){
            binding(true);
            isBinding = true;
        }
    }
    mp.callCEFV(`loader.show = false;`);
    mp.callCEFV(`characterInfo.show = false;`);
});

mp.events.add('characterInit.chooseRight', () => {
    chooseRight();
});
mp.events.add('characterInit.chooseLeft', () => {
    chooseLeft();
});

async function waitCharacterPreviewFrame() {
    if (mp.game && typeof mp.game.waitAsync === "function") {
        await mp.game.waitAsync(0);
    }
}

async function waitFreemodeModel(modelHash) {
    if (!mp.game.streaming || typeof mp.game.streaming.requestModel !== "function") return;

    if (typeof mp.game.streaming.hasModelLoaded === "function" && !mp.game.streaming.hasModelLoaded(modelHash)) {
        mp.game.streaming.requestModel(modelHash);
    }

    for (let i = 0; i < 30; i++) {
        if (typeof mp.game.streaming.hasModelLoaded !== "function" || mp.game.streaming.hasModelLoaded(modelHash)) return;
        await waitCharacterPreviewFrame();
    }
}

let createPeds = function() {
    if (peds.length !== 0) return;
    creatorTimer = mp.timer.add(async () => {
        for (let i = 0; i < charNum; i++) {
            restoreLocalPlayerForSelection(currentCharacter);
            await setCharCustom(i);
            setCharClothes(i);
            setCharTattoos(i);

            let x = (camPos[0] + i * pedDist * sinPedRot) + camDist * sinCamRot;
            let y = (camPos[1] + i * pedDist * cosPedRot) + camDist * cosCamRot;
            let z = mp.game.gameplay.getGroundZFor3dCoord(x, y, camPos[2] + 1, 0.0, false) + 1;
            let ped = mp.peds.new(mp.players.local.model, new mp.Vector3(x, y, z), pedRotation, mp.players.local.dimension);
            await waitCharacterPreviewFrame();
            mp.players.local.cloneToTarget(ped.handle);
            if (typeof ped.setVisible === "function") ped.setVisible(true, false);
            if (typeof ped.setAlpha === "function") ped.setAlpha(255, false);

            selectMarkers.push(mp.markers.new(2, new mp.Vector3(x, y, z + 1), 0.2,
            {
                direction: 0,
                rotation: new mp.Vector3(0, 180, 0),
                color: (i === currentCharacter) ? [255,66,247, 255] : [255, 255, 255, 120],
                visible: true,
                dimension: mp.players.local.dimension
            }));
            peds.push(ped);
        }
        restoreLocalPlayerForSelection();
        creatorTimer = null;
    }, 500);
};

let updateMarkers = function() {
    for (let i = 0; i < selectMarkers.length; i++) {
        selectMarkers[i].destroy();

        let x = (camPos[0] + i * pedDist * sinPedRot) + camDist * sinCamRot;
        let y = (camPos[1] + i * pedDist * cosPedRot) + camDist * cosCamRot;
        let z = mp.game.gameplay.getGroundZFor3dCoord(x, y, camPos[2] + 1, 0.0, false) + 1;

        selectMarkers[i] = mp.markers.new(2, new mp.Vector3(x, y, z + 1),
            0.2, {
            direction: 0,
            rotation: new mp.Vector3(0, 180, 0),
            color: (i === currentCharacter) ? [255,66,247, 255] : [255, 255, 255, 120],
            visible: true,
            dimension: mp.players.local.dimension
        });
    }
};

let setInfo = function() {
    charInfos.forEach(charInfo => {
        mp.callCEFV(`characterInfo.addCharacter({
            name: "${charInfo.name}",
            cash: ${charInfo.cash},
            bank: ${charInfo.bank},
            status: "${charInfo.status}",
            hours: ${charInfo.hours},
            faction: "${charInfo.faction}",
            job: "${charInfo.job}",
            house: "${charInfo.house}",
            biz: "${charInfo.biz}",
            warns: ${charInfo.warnNumber}
        });`);
    });
    mp.callCEFV(`characterInfo.show = true;`);
};

let chooseLeft = function() {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (currentCharacter <= 0) return;
    currentCharacter--;
    updateMarkers();
    mp.callCEFV(`characterInfo.i = ${currentCharacter};`);
    mp.utils.cam.moveTo(
        camPos[0] + currentCharacter * pedDist * sinPedRot,
        camPos[1] + currentCharacter * pedDist * cosPedRot,
        camPos[2],
        (camPos[0] + currentCharacter * pedDist * sinPedRot) + camDist * sinCamRot,
        (camPos[1] + currentCharacter * pedDist * cosPedRot) + camDist * cosCamRot,
        camPos[2] + camPosZDelta,
        500);
    restoreLocalPlayerForSelection(currentCharacter);
};

let chooseRight = function() {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (currentCharacter >= charNum || currentCharacter >= 2) return;
    currentCharacter++;
    updateMarkers();
    mp.callCEFV(`characterInfo.i = ${currentCharacter};`);
    mp.utils.cam.moveTo(
        camPos[0] + currentCharacter * pedDist * sinPedRot,
        camPos[1] + currentCharacter * pedDist * cosPedRot,
        camPos[2],
        (camPos[0] + currentCharacter * pedDist * sinPedRot) + camDist * sinCamRot,
        (camPos[1] + currentCharacter * pedDist * cosPedRot) + camDist * cosCamRot,
        camPos[2] + camPosZDelta,
        500);
    restoreLocalPlayerForSelection(currentCharacter);
};

let choose = function() {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (currentCharacter >= slotsNumber) return;
    if (isBinding) {
        binding(false);
        isBinding = false;
        if (creatorTimer != null) mp.timer.remove(creatorTimer);
        mp.events.callRemote('characterInit.choose', currentCharacter);
        mp.callCEFV(`loader.show = true;`);
    }
};

let setCharClothes = function(indexPed) {
    if (charClothes.length <= indexPed) return;
    mp.utils.clearAllView(mp.players.local, charInfos[indexPed].hair); // раздеваем игрока полностью
    let clothes = charClothes[indexPed].clothes || [];
    let props = charClothes[indexPed].props || [];
    for (let i = 0; i < clothes.length; i++) {
        mp.players.local.setComponentVariation(clothes[i][0], clothes[i][1], clothes[i][2], 0);
    }
    for (let i = 0; i < props.length; i++) {
        mp.players.local.setPropIndex(props[i][0], props[i][1], props[i][2], false);
    }
};

let setCharTattoos = function(indexPed) {
    if (charInfos.length <= indexPed) return;
    if (typeof mp.players.local.clearDecorations === "function") mp.players.local.clearDecorations();

    let tattoos = charInfos[indexPed].tattoos || [];
    tattoos.forEach((tattoo) => {
        mp.players.local.setDecoration(mp.game.joaat(tattoo.collection), mp.game.joaat(tattoo.hashName));
    });
};

let setCharCustom = async function (indexPed) {
    if (charInfos.length <= indexPed) return;
    const modelHash = freemodeCharacters[charInfos[indexPed].gender];
    await waitFreemodeModel(modelHash);
    mp.players.local.model = modelHash;
    await waitCharacterPreviewFrame();
    mp.players.local.setHeadBlendData(
        // shape
        charInfos[indexPed].mother,
        charInfos[indexPed].father,
        0,

        // skin
        0,
        charInfos[indexPed].skin,
        0,

        // mixes
        charInfos[indexPed].similarity,
        1.0,
        0.0,

        false
    );
    mp.players.local.setComponentVariation(2, charInfos[indexPed].hair, 0, 2);
    mp.players.local.setHairColor(charInfos[indexPed].hairColor, charInfos[indexPed].hairHighlightColor);
    mp.players.local.setEyeColor(charInfos[indexPed].eyeColor);
    for (let i = 0; i < 10; i++) {
        const appearance = charInfos[indexPed].Appearances[i];
        if (!appearance) continue;

        mp.players.local.setHeadOverlay(i, appearance.value,
            appearance.opacity, colorForOverlayIdx(i, indexPed), 0);

    }
    for (let i = 0; i < 20; i++) {
        if (!charInfos[indexPed].Features[i]) continue;
        mp.players.local.setFaceFeature(i, charInfos[indexPed].Features[i].value);
    }
};

let colorForOverlayIdx = function(index, indexPed) {
    let color;

    switch (index) {
        case 1:
            color = charInfos[indexPed].beardColor;
        break;

        case 2:
            color = charInfos[indexPed].eyebrowColor;
        break;

        case 5:
            color = charInfos[indexPed].blushColor;
        break;

        case 8:
            color = charInfos[indexPed].lipstickColor;
        break;

        case 10:
            color = charInfos[indexPed].chestHairColor;
        break;

        default:
            color = 0;
    }
    return color;
};



function binding(active) {
    if (active) {
        mp.keys.bind(0x27, true, chooseRight);   // Right arrow
        mp.keys.bind(0x25, true, chooseLeft);    // Left arrow
        mp.keys.bind(0x0D, true, choose);        // Enter
    }
    else {
        mp.keys.unbind(0x27, true, chooseRight);
        mp.keys.unbind(0x25, true, chooseLeft);
        mp.keys.unbind(0x0D, true, choose);
    }
}
