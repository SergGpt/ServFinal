"use strict";

let authCam = null;
let authCamTimer = null;
let authCamStartedAt = 0;
const AUTH_PLAYER_HIDDEN_POS = new mp.Vector3(-871.583, -3367.291, 93.112);
const AUTH_FLYOVER_DURATION = 92000;

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

function smoothStep(t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
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

function getRouteFrame(progress) {
    const maxIndex = AUTH_FLYOVER_POINTS.length - 1;
    const scaledProgress = clamp(progress, 0.0, 0.999999) * maxIndex;
    const index = Math.floor(scaledProgress);
    const t = smoothStep(scaledProgress - index);
    const current = AUTH_FLYOVER_POINTS[index];
    const next = AUTH_FLYOVER_POINTS[Math.min(index + 1, maxIndex)];

    return {
        pos: lerpVector(current.pos, next.pos, t),
        look: lerpVector(current.look, next.look, t),
        fov: lerp(current.fov, next.fov, t)
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
    if (typeof player.setVisible === "function") player.setVisible(false, false);
    if (mp.game.streaming && typeof mp.game.streaming.requestCollisionAtCoord === "function") {
        mp.game.streaming.requestCollisionAtCoord(pos.x, pos.y, pos.z);
        mp.game.streaming.requestCollisionAtCoord(look.x, look.y, look.z);
    }
    if (mp.game.streaming && typeof mp.game.streaming.setFocusArea === "function") {
        mp.game.streaming.setFocusArea(pos.x, pos.y, pos.z, 0.0, 0.0, 0.0);
    }
    if (mp.game.streaming && typeof mp.game.streaming.setHdArea === "function") {
        mp.game.streaming.setHdArea(pos.x, pos.y, pos.z, 160.0);
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
    if (authCamTimer) {
        clearInterval(authCamTimer);
        authCamTimer = null;
    }

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

    authCamTimer = setInterval(() => {
        if (!authCam) return;

        const elapsed = (Date.now() - authCamStartedAt) % AUTH_FLYOVER_DURATION;
        const progress = elapsed / AUTH_FLYOVER_DURATION;
        const frame = getRouteFrame(progress);
        const horrorDrift = Math.sin(progress * Math.PI * 16.0) * 1.35;
        const breathing = Math.sin(progress * Math.PI * 4.0) * 0.9;
        const pos = new mp.Vector3(frame.pos.x, frame.pos.y, frame.pos.z + breathing);
        const look = new mp.Vector3(frame.look.x, frame.look.y, frame.look.z + horrorDrift);

        authCam.setCoord(pos.x, pos.y, pos.z);
        authCam.pointAtCoord(look.x, look.y, look.z);
        if (typeof authCam.setFov === "function") {
            authCam.setFov(frame.fov + Math.sin(progress * Math.PI * 8.0) * 1.2);
        }
        updateAuthStreamingAnchor(pos, look);
    }, 33);
}

function prepareHiddenAuthPlayer() {
    const player = mp.players.local;

    player.freezePosition(true);
    player.setAlpha(0);
    if (typeof player.setVisible === "function") player.setVisible(false, false);
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
    if (typeof player.setVisible === "function") player.setVisible(showCharacter, false);
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