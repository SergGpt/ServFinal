"use strict";

const localPlayer = mp.players.local;
const KEY_CODES = {
    W: 0x57,
    A: 0x41,
    S: 0x53,
    D: 0x44,
    Q: 0x51,
    E: 0x45,
    SHIFT: 0x10,
};

const cinematicCamera = {
    camera: null,
    mode: 'idle',
    enabled: false,
    followTarget: null,
    followDistance: 6.0,
    followHeight: 2.0,
    faceDistance: 2.5,
    faceHeight: 0.65,
    pathPoints: [],
    pathDuration: 15000,
    pathStart: 0,
    pathLookAt: null,
    droneSpeed: 0.35,
    controls: {
        W: false,
        A: false,
        S: false,
        D: false,
        Q: false,
        E: false,
        SHIFT: false,
    },
    stickPedBehind: true,
};


function notify(message) {
    mp.game.graphics.notify(`~b~[CINEMA]~s~ ${message}`);
}

function getCamDirection(rot) {
    const pitch = rot.x * Math.PI / 180.0;
    const yaw = rot.z * Math.PI / 180.0;

    const cosPitch = Math.cos(pitch);
    return new mp.Vector3(
        -Math.sin(yaw) * cosPitch,
        Math.cos(yaw) * cosPitch,
        Math.sin(pitch),
    );
}

function getRightDirection(rot) {
    const yaw = (rot.z + 90.0) * Math.PI / 180.0;
    return new mp.Vector3(-Math.sin(yaw), Math.cos(yaw), 0.0);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpVector(a, b, t) {
    return new mp.Vector3(
        lerp(a.x, b.x, t),
        lerp(a.y, b.y, t),
        lerp(a.z, b.z, t),
    );
}

function parsePathPoints(pointsJson) {
    try {
        const points = JSON.parse(pointsJson);
        if (!Array.isArray(points) || points.length < 2) return [];

        return points
            .map((p) => {
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return null;
                return new mp.Vector3(p.x, p.y, p.z);
            })
            .filter((p) => p);
    } catch (e) {
        return [];
    }
}

function getSafeGameplayCamCoord() {
    if (mp.game.cam && typeof mp.game.cam.getGameplayCamCoord === 'function') {
        return mp.game.cam.getGameplayCamCoord();
    }

    return new mp.Vector3(
        localPlayer.position.x,
        localPlayer.position.y,
        localPlayer.position.z + 1.0,
    );
}

function getSafeGameplayCamRot() {
    if (mp.game.cam && typeof mp.game.cam.getGameplayCamRot === 'function') {
        return mp.game.cam.getGameplayCamRot(2);
    }

    return localPlayer.getRotation(2);
}

function ensureCamera() {
    if (!cinematicCamera.camera) {
        const gameplayCamPos = getSafeGameplayCamCoord();
        const gameplayCamRot = getSafeGameplayCamRot();
        cinematicCamera.camera = mp.cameras.new('cinematic.camera', gameplayCamPos, gameplayCamRot, 50.0);
    }

    cinematicCamera.camera.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 0, true, false);
    cinematicCamera.enabled = true;
}

function stopCinematicCamera(showNotify = true) {
    cinematicCamera.mode = 'idle';
    cinematicCamera.followTarget = null;
    cinematicCamera.pathPoints = [];

    if (cinematicCamera.camera) {
        cinematicCamera.camera.setActive(false);
        cinematicCamera.camera.destroy(true);
        cinematicCamera.camera = null;
    }

    mp.game.cam.renderScriptCams(false, false, 0, true, false);

    localPlayer.freezePosition(false);
    localPlayer.setVisible(true, false);

    cinematicCamera.enabled = false;
    if (showNotify) notify('Кинокамера выключена');
}

function setPedBehindCamera(cameraPosition, cameraRotation, distance = 2.2) {
    if (!cinematicCamera.stickPedBehind) return;

    const forward = getCamDirection(cameraRotation);
    const pedPosition = new mp.Vector3(
        cameraPosition.x - forward.x * distance,
        cameraPosition.y - forward.y * distance,
        cameraPosition.z - 1.0,
    );

    localPlayer.position = pedPosition;
    localPlayer.setHeading(cameraRotation.z + 180.0);
    localPlayer.freezePosition(true);
    localPlayer.setVisible(false, false);
}

function startFollowPlayer(remoteId, distance = 6.0, height = 2.0) {
    const id = Number(remoteId);
    const target = mp.players.atRemoteId(id);

    if (!target) {
        notify(`Игрок с id ${id} не найден в стриме`);
        return;
    }

    ensureCamera();
    cinematicCamera.mode = 'follow';
    cinematicCamera.followTarget = target;
    cinematicCamera.followDistance = Math.max(1.5, Number(distance) || 6.0);
    cinematicCamera.followHeight = Math.max(0.0, Number(height) || 2.0);

    notify(`Слежка за игроком #${id} запущена`);
}

function startFaceView(distance = 2.5, height = 0.65) {
    ensureCamera();
    cinematicCamera.mode = 'face';
    cinematicCamera.faceDistance = Math.min(4.0, Math.max(2.0, Number(distance) || 2.5));
    cinematicCamera.faceHeight = Number(height) || 0.65;

    notify('Камера на лицо персонажа активирована');
}

function startDroneMode() {
    ensureCamera();
    cinematicCamera.mode = 'drone';

    if (cinematicCamera.camera) {
        const pos = cinematicCamera.camera.getCoord();
        cinematicCamera.camera.setCoord(pos.x, pos.y, pos.z + 0.8);
    }

    notify('Режим дрона активирован (WASD + Q/E, Shift ускорение)');
}

function startPathFly(pointsJson, durationMs = 15000, lookAtJson = '') {
    const points = parsePathPoints(pointsJson);
    if (points.length < 2) {
        notify('Ошибка маршрута: нужно минимум 2 точки [x,y,z]');
        return;
    }

    ensureCamera();
    cinematicCamera.mode = 'path';
    cinematicCamera.pathPoints = points;
    cinematicCamera.pathDuration = Math.max(2000, Number(durationMs) || 15000);
    cinematicCamera.pathStart = Date.now();

    try {
        if (lookAtJson) {
            const lookAt = JSON.parse(lookAtJson);
            if (lookAt && typeof lookAt.x === 'number' && typeof lookAt.y === 'number' && typeof lookAt.z === 'number') {
                cinematicCamera.pathLookAt = new mp.Vector3(lookAt.x, lookAt.y, lookAt.z);
            }
        }
    } catch (e) {
        cinematicCamera.pathLookAt = null;
    }

    cinematicCamera.camera.setCoord(points[0].x, points[0].y, points[0].z);
    notify('Пролет по координатам запущен');
}

function updateFollow() {
    const target = cinematicCamera.followTarget;
    if (!target || !mp.players.exists(target)) {
        notify('Цель слежки пропала из стрима');
        stopCinematicCamera(false);
        return;
    }

    const headingRad = (target.getHeading() || 0) * Math.PI / 180.0;
    const behind = new mp.Vector3(-Math.sin(headingRad), Math.cos(headingRad), 0.0);

    const camPos = new mp.Vector3(
        target.position.x + behind.x * cinematicCamera.followDistance,
        target.position.y + behind.y * cinematicCamera.followDistance,
        target.position.z + cinematicCamera.followHeight,
    );

    cinematicCamera.camera.setCoord(camPos.x, camPos.y, camPos.z);
    cinematicCamera.camera.pointAtCoord(target.position.x, target.position.y, target.position.z + 0.8);

    const camRot = cinematicCamera.camera.getRot(2);
    setPedBehindCamera(camPos, camRot);
}

function updateFaceView() {
    const forward = getCamDirection(localPlayer.getRotation(2));
    const headTarget = new mp.Vector3(
        localPlayer.position.x,
        localPlayer.position.y,
        localPlayer.position.z + 0.65,
    );

    const camPos = new mp.Vector3(
        headTarget.x + forward.x * cinematicCamera.faceDistance,
        headTarget.y + forward.y * cinematicCamera.faceDistance,
        headTarget.z + cinematicCamera.faceHeight,
    );

    cinematicCamera.camera.setCoord(camPos.x, camPos.y, camPos.z);
    cinematicCamera.camera.pointAtCoord(headTarget.x, headTarget.y, headTarget.z);

    const camRot = cinematicCamera.camera.getRot(2);
    setPedBehindCamera(camPos, camRot);
}

function updatePath() {
    const points = cinematicCamera.pathPoints;
    if (!points || points.length < 2) {
        stopCinematicCamera(false);
        return;
    }

    const elapsed = Date.now() - cinematicCamera.pathStart;
    const progress = Math.min(1.0, elapsed / cinematicCamera.pathDuration);

    const segmentCount = points.length - 1;
    const segmentProgress = progress * segmentCount;
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(segmentProgress));
    const t = segmentProgress - segmentIndex;

    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    const camPos = lerpVector(from, to, t);

    cinematicCamera.camera.setCoord(camPos.x, camPos.y, camPos.z);
    if (cinematicCamera.pathLookAt) {
        cinematicCamera.camera.pointAtCoord(
            cinematicCamera.pathLookAt.x,
            cinematicCamera.pathLookAt.y,
            cinematicCamera.pathLookAt.z,
        );
    } else {
        cinematicCamera.camera.pointAtCoord(to.x, to.y, to.z);
    }

    const camRot = cinematicCamera.camera.getRot(2);
    setPedBehindCamera(camPos, camRot);

    if (progress >= 1.0) {
        notify('Пролет завершен');
        stopCinematicCamera(false);
    }
}

function updateDrone() {
    const camPos = cinematicCamera.camera.getCoord();
    const camRot = cinematicCamera.camera.getRot(2);

    const forward = getCamDirection(camRot);
    const right = getRightDirection(camRot);

    let speed = cinematicCamera.droneSpeed;
    if (cinematicCamera.controls.SHIFT) speed *= 2.5;

    let x = camPos.x;
    let y = camPos.y;
    let z = camPos.z;

    if (cinematicCamera.controls.W) {
        x += forward.x * speed;
        y += forward.y * speed;
        z += forward.z * speed;
    }
    if (cinematicCamera.controls.S) {
        x -= forward.x * speed;
        y -= forward.y * speed;
        z -= forward.z * speed;
    }
    if (cinematicCamera.controls.A) {
        x -= right.x * speed;
        y -= right.y * speed;
    }
    if (cinematicCamera.controls.D) {
        x += right.x * speed;
        y += right.y * speed;
    }
    if (cinematicCamera.controls.Q) z += speed;
    if (cinematicCamera.controls.E) z -= speed;

    cinematicCamera.camera.setCoord(x, y, z);

    const gameplayRot = getSafeGameplayCamRot();
    cinematicCamera.camera.setRot(gameplayRot.x, gameplayRot.y, gameplayRot.z, 2);

    const finalRot = cinematicCamera.camera.getRot(2);
    setPedBehindCamera(new mp.Vector3(x, y, z), finalRot);
}

function setControl(control, state) {
    cinematicCamera.controls[control] = state;
}

Object.keys(KEY_CODES).forEach((control) => {
    mp.keys.bind(KEY_CODES[control], true, () => setControl(control, true));
    mp.keys.bind(KEY_CODES[control], false, () => setControl(control, false));
});

mp.events.add('render', () => {
    if (!cinematicCamera.enabled || !cinematicCamera.camera) return;

    switch (cinematicCamera.mode) {
        case 'follow':
            updateFollow();
            break;
        case 'face':
            updateFaceView();
            break;
        case 'path':
            updatePath();
            break;
        case 'drone':
            updateDrone();
            break;
        default:
            break;
    }
});


mp.events.add({
    'dev.camera.stop': () => stopCinematicCamera(),
    'dev.camera.followPlayer': (remoteId, distance, height) => startFollowPlayer(remoteId, distance, height),
    'dev.camera.flyPath': (pointsJson, durationMs, lookAtJson) => startPathFly(pointsJson, durationMs, lookAtJson),
    'dev.camera.drone': () => startDroneMode(),
    'dev.camera.face': (distance, height) => startFaceView(distance, height),
    'dev.camera.stickPed': (state) => {
        cinematicCamera.stickPedBehind = !!state;
        notify(`Привязка ped за камерой: ${cinematicCamera.stickPedBehind ? 'ON' : 'OFF'}`);
    },
    'dev.camera.help': () => {
        mp.events.call('chat.message.push', '!{#4ec9ff}[CAM] Команды: /camdrone, /camstop, /camface [dist] [height], /camfollow [id] [dist] [height], /camstickped [0/1], /campath [durationMs] [pointsJson] [lookAtJson]');
        mp.events.call('chat.message.push', '!{#4ec9ff}[CAM] Управление дроном: W/A/S/D + Q/E, Shift ускорение.');
        mp.events.call('chat.message.push', '!{#4ec9ff}[CAM] Пример path: /campath 12000 [{"x":0,"y":0,"z":80},{"x":20,"y":20,"z":90}]');
    },
});
