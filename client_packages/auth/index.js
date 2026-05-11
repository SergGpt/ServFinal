"use strict";

let authCam = null;
let authCamStartedAt = 0;
const AUTH_PLAYER_HIDDEN_POS = new mp.Vector3(-871.583, -3367.291, 93.112);
const AUTH_FLYOVER_ONE_WAY_DURATION = 92000;

// Низкий маршрут над городом: камера летит по точкам игрока, но держится чуть выше,
// чтобы было видно завалы/улицы, а не только карту с высоты самолета.
const AUTH_FLYOVER_POINTS = [
    { pos: new mp.Vector3(1494.0880, 833.3210, 107.7), look: new mp.Vector3(1435.0, 770.0, 88.0), fov: 43 },
    { pos: new mp.Vector3(1388.5922, 668.4344, 110.0), look: new mp.Vector3(1336.7, 624.7, 84.5), fov: 41 },
    { pos: new mp.Vector3(1336.6957, 624.6813, 104.5), look: new mp.Vector3(1248.0, 518.0, 86.0), fov: 40 },
    { pos: new mp.Vector3(1178.5856, 426.8748, 119.0), look: new mp.Vector3(1030.0, 245.0, 74.0), fov: 42 },
    { pos: new mp.Vector3(693.3889, -159.7398, 91.0), look: new mp.Vector3(560.0, -300.0, 58.0), fov: 44 },
    { pos: new mp.Vector3(429.7899, -509.0263, 77.5), look: new mp.Vector3(240.0, -515.0, 52.0), fov: 46 },
    { pos: new mp.Vector3(55.0998, -508.2061, 75.0), look: new mp.Vector3(-120.0, -510.0, 45.0), fov: 45 },
    { pos: new mp.Vector3(-291.7155, -511.7834, 63.0), look: new mp.Vector3(-470.0, -513.0, 43.0), fov: 43 },
    { pos: new mp.Vector3(-688.5580, -514.4521, 68.0), look: new mp.Vector3(-760.0, -585.0, 46.0), fov: 41 }
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distanceBetween(a, b) {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;

    return Math.sqrt(x * x + y * y + z * z);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpVector(a, b, t) {
    return new mp.Vector3(
        lerp(a.x, b.x, t),
        lerp(a.y, b.y, t),
        lerp(a.z, b.z, t)
    );
}

const AUTH_FLYOVER_SEGMENTS = AUTH_FLYOVER_POINTS.slice(0, -1).map((point, index) => ({
    from: point,
    to: AUTH_FLYOVER_POINTS[index + 1],
    length: distanceBetween(point.pos, AUTH_FLYOVER_POINTS[index + 1].pos)
}));
const AUTH_FLYOVER_DISTANCE = AUTH_FLYOVER_SEGMENTS.reduce((sum, segment) => sum + segment.length, 0.0);

function getPingPongProgress(elapsed) {
    const cycleDuration = AUTH_FLYOVER_ONE_WAY_DURATION * 2;
    const cycleProgress = (elapsed % cycleDuration) / AUTH_FLYOVER_ONE_WAY_DURATION;

    return cycleProgress <= 1.0 ? cycleProgress : 2.0 - cycleProgress;
}

function getRouteFrame(progress) {
    let distance = clamp(progress, 0.0, 1.0) * AUTH_FLYOVER_DISTANCE;

    for (let i = 0; i < AUTH_FLYOVER_SEGMENTS.length; i++) {
        const segment = AUTH_FLYOVER_SEGMENTS[i];

        if (distance > segment.length && i !== AUTH_FLYOVER_SEGMENTS.length - 1) {
            distance -= segment.length;
            continue;
        }

        const t = segment.length === 0.0 ? 0.0 : clamp(distance / segment.length, 0.0, 1.0);

        return {
            pos: lerpVector(segment.from.pos, segment.to.pos, t),
            look: lerpVector(segment.from.look, segment.to.look, t),
            fov: lerp(segment.from.fov, segment.to.fov, t)
        };
    }

    const lastPoint = AUTH_FLYOVER_POINTS[AUTH_FLYOVER_POINTS.length - 1];
    return {
        pos: lastPoint.pos,
        look: lastPoint.look,
        fov: lastPoint.fov
    };
}

function updateAuthStreamingAnchor(pos, look) {
    const player = mp.players.local;
    const anchor = new mp.Vector3(pos.x, pos.y, pos.z - 8.0);

    // Главный фикс мыла/LOD: локальный персонаж остается невидимым, но физически идет
    // вместе с камерой и заставляет клиент стримить HD-текстуры вокруг пролета.
    player.position = anchor;
    player.setAlpha(0);
    player.freezePosition(true);

    if (typeof player.setCollision === "function") player.setCollision(false, false);
    if (mp.game.streaming && typeof mp.game.streaming.requestCollisionAtCoord === "function") {
        mp.game.streaming.requestCollisionAtCoord(pos.x, pos.y, pos.z);
        mp.game.streaming.requestCollisionAtCoord(look.x, look.y, look.z);
    }
}

function clearAuthStreamingAnchor() {
    const player = mp.players.local;

    if (mp.game.streaming && typeof mp.game.streaming.clearFocus === "function") mp.game.streaming.clearFocus();
    if (mp.game.streaming && typeof mp.game.streaming.clearHdArea === "function") mp.game.streaming.clearHdArea();
    if (typeof player.setVisible === "function") player.setVisible(true, false);
    if (typeof player.setCollision === "function") player.setCollision(true, true);
}

function resetAuthCamera() {
    if (authCam) {
        mp.game.cam.renderScriptCams(false, false, 1000, true, false);
        authCam.destroy();
        authCam = null;
    }

    clearAuthStreamingAnchor();
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    mp.game.cam.destroyAllCams(true);
}

function startAuthFlyover() {
    const firstFrame = getRouteFrame(0.0);

    authCamStartedAt = Date.now();
    authCam = mp.cameras.new("authCam", firstFrame.pos, new mp.Vector3(0, 0, 0), firstFrame.fov);
    authCam.pointAtCoord(firstFrame.look.x, firstFrame.look.y, firstFrame.look.z);
    authCam.setActive(true);
    updateAuthStreamingAnchor(firstFrame.pos, firstFrame.look);
    mp.game.cam.renderScriptCams(true, false, 2000, true, false);
}

function updateAuthFlyoverFrame() {
    if (!authCam) return;

    const progress = getPingPongProgress(Date.now() - authCamStartedAt);
    const frame = getRouteFrame(progress);

    authCam.setCoord(frame.pos.x, frame.pos.y, frame.pos.z);
    authCam.pointAtCoord(frame.look.x, frame.look.y, frame.look.z);
    if (typeof authCam.setFov === "function") authCam.setFov(frame.fov);
    updateAuthStreamingAnchor(frame.pos, frame.look);
}

mp.events.add('render', updateAuthFlyoverFrame);

function prepareHiddenAuthPlayer() {
    const player = mp.players.local;

    player.freezePosition(true);
    player.setAlpha(0);
    if (typeof player.setCollision === "function") player.setCollision(false, false);
}

function restoreAuthPlayer(showCharacter, unfreeze, restorePosition) {
    const player = mp.players.local;
    const hasRestorePosition = restorePosition
        && typeof restorePosition.x === "number"
        && typeof restorePosition.y === "number"
        && typeof restorePosition.z === "number";
    const targetPosition = hasRestorePosition ? restorePosition : player.position;

    player.setCoords(
        targetPosition.x,
        targetPosition.y,
        targetPosition.z,
        false, false, false, false
    );
    player.setAlpha(showCharacter ? 255 : 0);
    if (typeof player.setVisible === "function") player.setVisible(true, false);
    if (typeof player.setCollision === "function") player.setCollision(true, true);
    player.freezePosition(!unfreeze);
}

/// Инициализация перед авторизацией
mp.events.add('auth.init', () => {
    mp.gui.cursor.show(true, true);
    mp.game.ui.displayRadar(false);
    mp.game.ui.displayHud(false);

    resetAuthCamera();
    prepareHiddenAuthPlayer();
    startAuthFlyover();

    mp.callCEFV(`auth.show = true;`);
});

/// Уничтожение камеры после входа (этап выбора персонажа)
mp.events.add('auth.destroy', () => {
    resetAuthCamera();
    restoreAuthPlayer(true, true, AUTH_PLAYER_HIDDEN_POS);

    mp.gui.cursor.show(false, false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    mp.callCEFV(`character.show = true;`);
});

/// 🔥 Выбор персонажа (когда сервер загружает в мир)
mp.events.add('character.select', () => {
    resetAuthCamera();
    restoreAuthPlayer(true, true);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    console.log("✅ Камера авторизации выключена, персонаж видим!");
});

/// 🔥 Спавн в мире (если сервер использует это событие)
mp.events.add('playerSpawn', (pos) => {
    resetAuthCamera();
    restoreAuthPlayer(true, true, pos);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    console.log("✅ Спавн - камера авторизации полностью восстановлена!");
});

/// Вход в аккаунт
mp.events.add('auth.login', (data) => {
    mp.events.callRemote('auth.login', data);
});

/// Результат входа в аккаунт
mp.events.add('auth.login.result', (result, data) => {
    if (result == 7 && data)
        mp.callCEFV(`characterInfo.coins = ${data.donate}`);
    mp.callCEFV(`auth.showLoginResult(${result});`);
});

/// Регистрация аккаунта
mp.events.add('auth.register', (data) => {
    mp.events.callRemote('auth.register', data);
});

/// Результат регистрации аккаунта
mp.events.add('auth.register.result', (result, data) => {
    mp.callCEFV(`auth.showRegisterResult(${result});`);
});

/// Результат восстановления аккаунта
mp.events.add('auth.recovery.result', (result) => {
    mp.callCEFV(`auth.showRecoveryResult(${result});`);
});

/// Запрос на отправку кода подтверждения почты
mp.events.add('auth.email.confirm', (state) => {
    mp.events.callRemote('auth.email.confirm', state == 1);
    state == 0 && mp.callCEFV(`auth.show = false;`);
});

/// Запрос на проверку кода из письма
mp.events.add('auth.email.confirm.code', (code) => {
    mp.events.callRemote('auth.email.confirm.code', code);
});

/// Ответ проверки почты
mp.events.add('auth.email.confirm.result', (result) => {
    mp.callCEFV(`auth.showEmailConfirmResult(${result});`);
});