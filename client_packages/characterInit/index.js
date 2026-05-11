"use strict";
/// Выбор персоонажа и подключение создания персоонажа
require("characterInit/characterCreate.js");
const freemodeCharacters = [mp.game.joaat("mp_m_freemode_01"), mp.game.joaat("mp_f_freemode_01")];

let charNum;
let charClothes = [];
let charInfos = [];

let selectMarkers = [];
let currentCharacter = 0;

/// ИЗМЕНЯТЬ ДАННЫЕ НАСТРОЙКИ ДЛЯ УСТАНОВКИ ПЕДОВ
/// Начальная координата камеры
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
let selectionDimension = 0;

const selectionLookPos = new mp.Vector3(
    camPos[0] + camDist * sinCamRot,
    camPos[1] + camDist * cosCamRot,
    camPos[2] + camPosZDelta
);
const selectionLoadRadius = 90.0;
const selectionLoadTimeout = 3000;
const selectionDebugEvent = "characterInit.selection.debug";
const selectionPreviewZ = 13.95;

function roundDebugNumber(value) {
    return Math.round(value * 100) / 100;
}

function debugVector(vector) {
    return {
        x: roundDebugNumber(vector.x),
        y: roundDebugNumber(vector.y),
        z: roundDebugNumber(vector.z)
    };
}

function getSelectionPedPosition(index) {
    const x = (camPos[0] + index * pedDist * sinPedRot) + camDist * sinCamRot;
    const y = (camPos[1] + index * pedDist * cosPedRot) + camDist * cosCamRot;
    return new mp.Vector3(x, y, selectionPreviewZ);
}

function getSelectionCameraFrame(index = currentCharacter) {
    const position = new mp.Vector3(
        camPos[0] + index * pedDist * sinPedRot,
        camPos[1] + index * pedDist * cosPedRot,
        camPos[2]
    );
    const lookAt = new mp.Vector3(
        position.x + camDist * sinCamRot,
        position.y + camDist * cosCamRot,
        camPos[2] + camPosZDelta
    );

    return { position, lookAt, fov: 60 };
}

function sendSelectionDebug(type, payload) {
    try {
        let data = payload || {};
        data.type = type;
        data.dimension = selectionDimension;
        mp.events.callRemote(selectionDebugEvent, JSON.stringify(data));
    }
    catch (e) {
        console.log(`[characterInit] selection debug failed: ${e.message}`);
    }
}

function sendCameraDebug(type, index = currentCharacter) {
    const frame = getSelectionCameraFrame(index);

    sendSelectionDebug(type, {
        index,
        camera: debugVector(frame.position),
        lookAt: debugVector(frame.lookAt),
        fov: frame.fov
    });
}

async function preloadCharacterSelectionScene() {
    if (!mp.game.streaming) return;

    if (typeof mp.game.streaming.clearFocus === "function") mp.game.streaming.clearFocus();
    if (typeof mp.game.streaming.clearHdArea === "function") mp.game.streaming.clearHdArea();
    if (typeof mp.game.streaming.setFocusPosAndVel === "function") {
        mp.game.streaming.setFocusPosAndVel(selectionLookPos.x, selectionLookPos.y, selectionLookPos.z, 0.0, 0.0, 0.0);
    }
    if (typeof mp.game.streaming.setHdArea === "function") {
        mp.game.streaming.setHdArea(selectionLookPos.x, selectionLookPos.y, selectionLookPos.z, selectionLoadRadius);
    }
    if (typeof mp.game.streaming.requestCollisionAtCoord === "function") {
        mp.game.streaming.requestCollisionAtCoord(camPos[0], camPos[1], camPos[2]);
        mp.game.streaming.requestCollisionAtCoord(selectionLookPos.x, selectionLookPos.y, selectionLookPos.z);
    }
    if (typeof mp.game.streaming.loadScene === "function") {
        mp.game.streaming.loadScene(selectionLookPos.x, selectionLookPos.y, selectionLookPos.z);
    }
    if (typeof mp.game.streaming.newLoadSceneStartSphere !== "function"
        || typeof mp.game.streaming.isNewLoadSceneLoaded !== "function"
        || typeof mp.game.waitAsync !== "function") {
        return;
    }

    mp.game.streaming.newLoadSceneStartSphere(selectionLookPos.x, selectionLookPos.y, selectionLookPos.z, selectionLoadRadius, 0);
    const startedAt = Date.now();

    while (!mp.game.streaming.isNewLoadSceneLoaded() && Date.now() - startedAt < selectionLoadTimeout) {
        await mp.game.waitAsync(0);
    }

    if (typeof mp.game.streaming.newLoadSceneStop === "function") mp.game.streaming.newLoadSceneStop();
}


mp.events.add('characterInit.init', async (characters, accountInfo) => {
    selectionDimension = accountInfo && accountInfo.selectionDimension != null ? accountInfo.selectionDimension : mp.players.local.dimension;
    sendSelectionDebug("client.dimension", {
        localDimension: mp.players.local.dimension,
        serverSelectionDimension: selectionDimension
    });
    mp.players.local.setAlpha(255);
    if (typeof mp.players.local.setVisible === "function") mp.players.local.setVisible(true, false);
    if (typeof mp.players.local.setCollision === "function") mp.players.local.setCollision(true, true);
    mp.players.local.position = new mp.Vector3(camPos[0], camPos[1], camPos[2] - 10);
    mp.events.callRemote('time.sync.request');
    await preloadCharacterSelectionScene();
    mp.gui.cursor.show(true, true);
    currentCharacter = 0;
    charClothes = [];
    charInfos = [];
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
        }
        selectMarkers = [];
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
        const frame = getSelectionCameraFrame(0);
        mp.utils.cam.create(frame.position.x, frame.position.y, frame.position.z, frame.lookAt.x, frame.lookAt.y, frame.lookAt.z, frame.fov);
        sendCameraDebug("camera.create", 0);
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
        const frame = getSelectionCameraFrame(currentCharacter);
        mp.utils.cam.tpTo(frame.position.x, frame.position.y, frame.position.z, frame.lookAt.x, frame.lookAt.y, frame.lookAt.z, frame.fov);
        sendCameraDebug("camera.tp", currentCharacter);
        mp.callCEFV(`characterInfo.show = true;`);
    }

    //mp.players.local.setAlpha(0);
    mp.events.call("godmode.set", false);
});

mp.events.add("characterInit.done", () => {
    mp.gui.cursor.show(false, false);
    mp.players.local.setAlpha(255);
    if (typeof mp.players.local.setVisible === "function") mp.players.local.setVisible(true, false);
    if (typeof mp.players.local.setCollision === "function") mp.players.local.setCollision(true, true);
    mp.players.local.freezePosition(false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);
    mp.utils.disablePlayerMoving(false);

    mp.utils.cam.destroy();
    if (mp.game.streaming && typeof mp.game.streaming.clearFocus === "function") mp.game.streaming.clearFocus();
    if (mp.game.streaming && typeof mp.game.streaming.clearHdArea === "function") mp.game.streaming.clearHdArea();

    for (let i = 0; i < selectMarkers.length; i++) {
        selectMarkers[i].destroy();
    }
    selectMarkers = [];

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

let createPeds = function() {
    if (selectMarkers.length !== 0) return;
    creatorTimer = mp.timer.add(async () => {
        for (let i = 0; i < charNum; i++) {
            let previewPos = getSelectionPedPosition(i);
            let x = previewPos.x;
            let y = previewPos.y;
            let z = previewPos.z;

            sendSelectionDebug("marker.place", {
                index: i,
                name: charInfos[i] ? charInfos[i].name : null,
                position: debugVector(previewPos),
                marker: debugVector(new mp.Vector3(x, y, z + 1))
            });

            selectMarkers.push(mp.markers.new(2, new mp.Vector3(x, y, z + 1), 0.2,
            {
                direction: 0,
                rotation: new mp.Vector3(0, 180, 0),
                color: (i === currentCharacter) ? [255,66,247, 255] : [255, 255, 255, 120],
                visible: true,
                dimension: selectionDimension
            }));
            await waitCharacterPreviewFrame();
        }
        creatorTimer = null;
    }, 500);
};

let updateMarkers = function() {
    for (let i = 0; i < selectMarkers.length; i++) {
        selectMarkers[i].destroy();

        let previewPos = getSelectionPedPosition(i);
        let x = previewPos.x;
        let y = previewPos.y;
        let z = previewPos.z;

        selectMarkers[i] = mp.markers.new(2, new mp.Vector3(x, y, z + 1),
            0.2, {
            direction: 0,
            rotation: new mp.Vector3(0, 180, 0),
            color: (i === currentCharacter) ? [255,66,247, 255] : [255, 255, 255, 120],
            visible: true,
            dimension: selectionDimension
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
    const frame = getSelectionCameraFrame(currentCharacter);
    mp.utils.cam.moveTo(
        frame.position.x,
        frame.position.y,
        frame.position.z,
        frame.lookAt.x,
        frame.lookAt.y,
        frame.lookAt.z,
        500);
    sendCameraDebug("camera.move", currentCharacter);
};

let chooseRight = function() {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (currentCharacter >= charNum || currentCharacter >= 2) return;
    currentCharacter++;
    updateMarkers();
    mp.callCEFV(`characterInfo.i = ${currentCharacter};`);
    const frame = getSelectionCameraFrame(currentCharacter);
    mp.utils.cam.moveTo(
        frame.position.x,
        frame.position.y,
        frame.position.z,
        frame.lookAt.x,
        frame.lookAt.y,
        frame.lookAt.z,
        500);
    sendCameraDebug("camera.move", currentCharacter);
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
    let clothes = charClothes[indexPed].clothes;
    let props = charClothes[indexPed].props;
    for (let i = 0; i < clothes.length; i++) {
        mp.players.local.setComponentVariation(clothes[i][0], clothes[i][1], clothes[i][2], 0);
    }
    for (let i = 0; i < props.length; i++) {
        mp.players.local.setPropIndex(props[i][0], props[i][1], props[i][2], false);
    }
};

let setCharTattoos = function(indexPed) {
    if (charInfos.length <= indexPed) return;
    let tattoos = charInfos[indexPed].tattoos;
    tattoos.forEach((tattoo) => {
        mp.players.local.setDecoration(mp.game.joaat(tattoo.collection), mp.game.joaat(tattoo.hashName));
    });
};

let setCharCustom = function (indexPed) {
    if (charInfos.length <= indexPed) return;
    mp.players.local.model = freemodeCharacters[charInfos[indexPed].gender];
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
        mp.players.local.setHeadOverlay(i, charInfos[indexPed].Appearances[i].value,
            charInfos[indexPed].Appearances[i].opacity, colorForOverlayIdx(i, indexPed), 0);

    }
    for (let i = 0; i < 20; i++) {
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
