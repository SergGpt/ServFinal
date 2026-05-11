"use strict";

let authCam = null;
let authCamTimer = null;
let authFlyoverStartedAt = 0;
let lastAuthCameraStreamRequest = 0;

const AUTH_CAMERA_STREAM_REQUEST_INTERVAL = 180;
const AUTH_CHAPTER_FADE_MS = 2200;
const AUTH_FLYOVER_CHAPTERS = [
    {
        duration: 120000,
        points: [
            new mp.Vector3(216.0445, 3154.8665, 58.8),
            new mp.Vector3(231.1114, 3303.8716, 53.8),
            new mp.Vector3(192.5752, 3409.8379, 67.0),
            new mp.Vector3(105.7694, 3567.0481, 59.2),
            new mp.Vector3(147.1333, 3705.1941, 65.9),
            new mp.Vector3(-144.5374, 3891.7219, 83.5),
            new mp.Vector3(530.2566, 3507.5793, 55.0)
        ]
    },
    {
        duration: 137000,
        points: [
            new mp.Vector3(1398.8704, 745.3566, 132.0),
            new mp.Vector3(1258.8607, 567.9809, 106.0),
            new mp.Vector3(1099.4325, 403.8053, 123.0),
            new mp.Vector3(937.1478, 525.5155, 151.5),
            new mp.Vector3(494.4601, 40.9830, 110.0),
            new mp.Vector3(434.5064, -81.5190, 97.0),
            new mp.Vector3(327.8577, -329.5411, 75.0),
            new mp.Vector3(303.4270, -451.1534, 68.0)
        ]
    },
    {
        duration: 104000,
        points: [
            new mp.Vector3(745.2211, -2493.5164, 40.0),
            new mp.Vector3(737.8945, -2534.5581, 35.5),
            new mp.Vector3(737.2746, -2601.2014, 33.0),
            new mp.Vector3(741.9315, -2810.2654, 24.0),
            new mp.Vector3(743.7536, -2923.2144, 22.0),
            new mp.Vector3(857.1192, -3163.0862, 37.0)
        ]
    }
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function smoothStep(t) {
    return t * t * (3.0 - 2.0 * t);
}

function interpolateChapterPoint(points, progress) {
    if (points.length === 1) return points[0];

    const scaled = progress * (points.length - 1);
    const index = Math.min(Math.floor(scaled), points.length - 2);
    const localT = smoothStep(scaled - index);
    const from = points[index];
    const to = points[index + 1];

    return new mp.Vector3(
        lerp(from.x, to.x, localT),
        lerp(from.y, to.y, localT),
        lerp(from.z, to.z, localT)
    );
}

function getAuthChapterFrame(elapsed) {
    const chapterDuration = AUTH_FLYOVER_CHAPTERS.reduce((sum, chapter) => sum + chapter.duration + AUTH_CHAPTER_FADE_MS, 0);
    let cycle = elapsed % chapterDuration;

    for (let i = 0; i < AUTH_FLYOVER_CHAPTERS.length; i++) {
        const chapter = AUTH_FLYOVER_CHAPTERS[i];

        if (cycle < chapter.duration) {
            const progress = cycle / chapter.duration;
            const lookProgress = Math.min(progress + 0.025, 1.0);
            const pos = interpolateChapterPoint(chapter.points, progress);
            const look = interpolateChapterPoint(chapter.points, lookProgress);

            return {
                pos,
                look: new mp.Vector3(look.x, look.y, look.z - 6.0),
                fov: 45
            };
        }

        cycle -= chapter.duration;
        if (cycle < AUTH_CHAPTER_FADE_MS) {
            const nextChapter = AUTH_FLYOVER_CHAPTERS[(i + 1) % AUTH_FLYOVER_CHAPTERS.length];
            const pos = nextChapter.points[0];
            const look = nextChapter.points[Math.min(1, nextChapter.points.length - 1)];

            return {
                pos,
                look: new mp.Vector3(look.x, look.y, look.z - 6.0),
                fov: 45
            };
        }

        cycle -= AUTH_CHAPTER_FADE_MS;
    }

    const firstChapter = AUTH_FLYOVER_CHAPTERS[0];
    return {
        pos: firstChapter.points[0],
        look: firstChapter.points[1],
        fov: 45
    };
}

function requestAuthCameraScene(position, lookAt, force = false) {
    if (!mp.game.streaming) return;

    const now = Date.now();
    if (!force && now - lastAuthCameraStreamRequest < AUTH_CAMERA_STREAM_REQUEST_INTERVAL) return;
    lastAuthCameraStreamRequest = now;

    // Максимально безопасный вариант: только одноразовые requests вокруг камеры.
    // Не используем setFocusPosAndVel/setFocusArea/setHdArea и не двигаем игрока,
    // чтобы не оставить persistent streaming override перед выбором персонажа.
    if (typeof mp.game.streaming.requestCollisionAtCoord === "function") {
        mp.game.streaming.requestCollisionAtCoord(position.x, position.y, position.z);
        mp.game.streaming.requestCollisionAtCoord(lookAt.x, lookAt.y, lookAt.z);
    }
    if (typeof mp.game.streaming.requestAdditionalCollisionAtCoord === "function") {
        mp.game.streaming.requestAdditionalCollisionAtCoord(position.x, position.y, position.z);
        mp.game.streaming.requestAdditionalCollisionAtCoord(lookAt.x, lookAt.y, lookAt.z);
    }
    if (typeof mp.game.streaming.loadScene === "function") {
        mp.game.streaming.loadScene(position.x, position.y, position.z);
    }
}

function clearAuthCameraStreamingState() {
    lastAuthCameraStreamRequest = 0;
    if (!mp.game.streaming) return;

    // На случай если старый клиент/прошлая версия уже выставляла focus/HD area,
    // чистим при выходе из auth. В новой логике эти persistent методы не ставятся.
    if (typeof mp.game.streaming.clearFocus === "function") mp.game.streaming.clearFocus();
    if (typeof mp.game.streaming.clearHdArea === "function") mp.game.streaming.clearHdArea();
    if (typeof mp.game.streaming.newLoadSceneStop === "function") mp.game.streaming.newLoadSceneStop();
}

/// Инициализация перед авторизацией
mp.events.add('auth.init', () => {
    const player = mp.players.local;

    mp.gui.cursor.show(true, true);
    player.freezePosition(true);
    mp.game.ui.displayRadar(false);
    mp.game.ui.displayHud(false);

    player.setAlpha(0);
    player.position = new mp.Vector3(-871.583, -3367.291, 93.112);

    if (authCam) {
        mp.game.cam.renderScriptCams(false, false, 0, true, false);
        authCam.destroy();
        authCam = null;
    }

    if (authCamTimer) {
        clearInterval(authCamTimer);
        authCamTimer = null;
    }

    authFlyoverStartedAt = Date.now();
    const firstFrame = getAuthChapterFrame(0);

    authCam = mp.cameras.new("authCam", firstFrame.pos, new mp.Vector3(0,0,0), firstFrame.fov);
    authCam.pointAtCoord(firstFrame.look.x, firstFrame.look.y, firstFrame.look.z);
    authCam.setActive(true);
    requestAuthCameraScene(firstFrame.pos, firstFrame.look, true);
    mp.game.cam.renderScriptCams(true, false, 2000, true, false);

    authCamTimer = setInterval(() => {
        if (!authCam) return;

        const frame = getAuthChapterFrame(Date.now() - authFlyoverStartedAt);

        authCam.setCoord(frame.pos.x, frame.pos.y, frame.pos.z);
        authCam.pointAtCoord(frame.look.x, frame.look.y, frame.look.z);
        if (typeof authCam.setFov === "function") authCam.setFov(frame.fov);
        requestAuthCameraScene(frame.pos, frame.look);
    }, 0);

    mp.callCEFV(`auth.show = true;`);
});

/// Уничтожение камеры после входа (этап выбора персонажа)
mp.events.add('auth.destroy', () => {
    const player = mp.players.local;

    if (authCamTimer) {
        clearInterval(authCamTimer);
        authCamTimer = null;
    }

    if (authCam) {
        mp.game.cam.renderScriptCams(false, false, 1000, true, false);
        authCam.destroy();
        authCam = null;
    }
    clearAuthCameraStreamingState();

    // 🔥 ПОЛНОЕ ВОССТАНОВЛЕНИЕ КАМЕРЫ (3 строки!)
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    mp.game.cam.destroyAllCams(true);
    player.setCoords(
        player.position.x,
        player.position.y,
        player.position.z,
        false, false, false, false
    );

    player.setAlpha(255);
    player.position = new mp.Vector3(-871.583, -3367.291, 93.112);
    player.freezePosition(false);
    mp.gui.cursor.show(false, false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    mp.callCEFV(`character.show = true;`);
});

/// 🔥 Выбор персонажа (когда сервер загружает в мир)
mp.events.add('character.select', () => {
    const player = mp.players.local;

    player.setAlpha(255);
    clearAuthCameraStreamingState();

    // 🔥 ПОЛНОЕ ВОССТАНОВЛЕНИЕ КАМЕРЫ (3 строки!)
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    mp.game.cam.destroyAllCams(true);
    player.setCoords(
        player.position.x,
        player.position.y,
        player.position.z,
        false, false, false, false
    );

    player.freezePosition(false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    console.log("✅ Камера ПЕРФЕКТ! Персонаж ВИДИМ!");
});

/// 🔥 Спавн в мире (если сервер использует это событие)
mp.events.add('playerSpawn', (pos) => {
    const player = mp.players.local;

    player.setAlpha(255);
    clearAuthCameraStreamingState();

    // 🔥 ПОЛНОЕ ВОССТАНОВЛЕНИЕ КАМЕРЫ (3 строки!)
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    mp.game.cam.destroyAllCams(true);
    player.setCoords(
        player.position.x,
        player.position.y,
        player.position.z,
        false, false, false, false
    );

    player.freezePosition(false);
    mp.game.ui.displayRadar(true);
    mp.game.ui.displayHud(true);

    console.log("✅ Спавн - камера 100% СТАНДАРТНАЯ! Персонаж ВИДИМ!");
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
