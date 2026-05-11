"use strict";

let authCam = null;
let authCamStartedAt = 0;
let authFadeState = "in";
const AUTH_PLAYER_HIDDEN_POS = new mp.Vector3(-871.583, -3367.291, 93.112);
const AUTH_NIGHT_HOUR = 1;
const AUTH_NIGHT_MINUTE = 15;
const AUTH_LOOK_AHEAD_PROGRESS = 0.025;
const AUTH_FADE_TRANSITION = 3600;

// Дальний маршрут разбит на сцены. Между сценами камера затемняется и переносится,
// чтобы не лететь через всю карту, горы и дома.
const AUTH_FLYOVER_CHAPTERS = [
    {
        duration: 110000,
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
        duration: 125000,
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
        duration: 95000,
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

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;

    return new mp.Vector3(
        0.5 * ((2.0 * p1.x) + (-p0.x + p2.x) * t + (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 + (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3),
        0.5 * ((2.0 * p1.y) + (-p0.y + p2.y) * t + (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 + (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3),
        0.5 * ((2.0 * p1.z) + (-p0.z + p2.z) * t + (2.0 * p0.z - 5.0 * p1.z + 4.0 * p2.z - p3.z) * t2 + (-p0.z + 3.0 * p1.z - 3.0 * p2.z + p3.z) * t3)
    );
}

function buildRoute(points) {
    const segments = points.slice(0, -1).map((point, index) => ({
        index,
        length: distanceBetween(point, points[index + 1])
    }));

    return {
        points,
        segments,
        distance: segments.reduce((sum, segment) => sum + segment.length, 0.0)
    };
}

const AUTH_FLYOVER_ROUTES = AUTH_FLYOVER_CHAPTERS.map((chapter) => ({
    duration: chapter.duration,
    route: buildRoute(chapter.points)
}));
const AUTH_FLYOVER_CYCLE_DURATION = AUTH_FLYOVER_ROUTES.reduce((sum, chapter) => sum + chapter.duration + AUTH_FADE_TRANSITION, 0);

function getAuthChapterState(elapsed) {
    let cycleTime = elapsed % AUTH_FLYOVER_CYCLE_DURATION;

    for (let i = 0; i < AUTH_FLYOVER_ROUTES.length; i++) {
        const chapter = AUTH_FLYOVER_ROUTES[i];

        if (cycleTime < chapter.duration) {
            return {
                chapterIndex: i,
                progress: cycleTime / chapter.duration,
                transitioning: false
            };
        }

        cycleTime -= chapter.duration;

        if (cycleTime < AUTH_FADE_TRANSITION) {
            return {
                chapterIndex: i,
                nextChapterIndex: (i + 1) % AUTH_FLYOVER_ROUTES.length,
                progress: cycleTime / AUTH_FADE_TRANSITION,
                transitioning: true
            };
        }

        cycleTime -= AUTH_FADE_TRANSITION;
    }

    return { chapterIndex: 0, progress: 0.0, transitioning: false };
}

function getRoutePosition(route, progress) {
    let distance = clamp(progress, 0.0, 1.0) * route.distance;

    for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i];

        if (distance > segment.length && i !== route.segments.length - 1) {
            distance -= segment.length;
            continue;
        }

        const t = segment.length === 0.0 ? 0.0 : clamp(distance / segment.length, 0.0, 1.0);
        const p1Index = segment.index;
        const p0 = route.points[Math.max(p1Index - 1, 0)];
        const p1 = route.points[p1Index];
        const p2 = route.points[p1Index + 1];
        const p3 = route.points[Math.min(p1Index + 2, route.points.length - 1)];

        return catmullRom(p0, p1, p2, p3, t);
    }

    return route.points[route.points.length - 1];
}

function getRouteFrame(chapterIndex, progress) {
    const route = AUTH_FLYOVER_ROUTES[chapterIndex].route;
    const pos = getRoutePosition(route, progress);
    const look = getRoutePosition(route, clamp(progress + AUTH_LOOK_AHEAD_PROGRESS, 0.0, 1.0));

    return {
        pos,
        look: new mp.Vector3(look.x, look.y, look.z - 7.0),
        fov: lerp(42.0, 47.0, Math.sin(progress * Math.PI))
    };
}

function setAuthFade(out) {
    const nextState = out ? "out" : "in";

    if (authFadeState === nextState) return;
    authFadeState = nextState;

    if (out && mp.game.cam && typeof mp.game.cam.doScreenFadeOut === "function") {
        mp.game.cam.doScreenFadeOut(parseInt(AUTH_FADE_TRANSITION / 2));
    } else if (!out && mp.game.cam && typeof mp.game.cam.doScreenFadeIn === "function") {
        mp.game.cam.doScreenFadeIn(parseInt(AUTH_FADE_TRANSITION / 2));
    }
}

function applyAuthNight() {
    if (mp.game.time && typeof mp.game.time.setClockTime === "function") {
        mp.game.time.setClockTime(AUTH_NIGHT_HOUR, AUTH_NIGHT_MINUTE, 0);
    }
}

function restoreServerTime() {
    mp.events.callRemote('time.sync.request');
}
function updateAuthStreamingAnchor(pos, look) {
    const player = mp.players.local;
    const anchor = new mp.Vector3(pos.x, pos.y, pos.z - 8.0);

    // Главный фикс мыла/LOD: локальный персонаж остается невидимым, но физически идет
    // вместе с камерой и заставляет клиент стримить HD-текстуры вокруг пролета.
    player.position = anchor;
    player.setAlpha(0, false);
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

function resetAuthCamera(restoreTime = true) {
    if (authCam) {
        mp.game.cam.renderScriptCams(false, false, 1000, true, false);
        authCam.destroy();
        authCam = null;
    }

    setAuthFade(false);
    clearAuthStreamingAnchor();
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    mp.game.cam.destroyAllCams(true);
    if (restoreTime) restoreServerTime();
}

function startAuthFlyover() {
    const firstFrame = getRouteFrame(0, 0.0);

    authCamStartedAt = Date.now();
    authCam = mp.cameras.new("authCam", firstFrame.pos, new mp.Vector3(0, 0, 0), firstFrame.fov);
    authCam.pointAtCoord(firstFrame.look.x, firstFrame.look.y, firstFrame.look.z);
    authCam.setActive(true);
    updateAuthStreamingAnchor(firstFrame.pos, firstFrame.look);
    mp.game.cam.renderScriptCams(true, false, 2000, true, false);
}

function updateAuthFlyoverFrame() {
    if (!authCam) return;

    applyAuthNight();

    const chapterState = getAuthChapterState(Date.now() - authCamStartedAt);
    const frame = chapterState.transitioning
        ? getRouteFrame(chapterState.progress < 0.5 ? chapterState.chapterIndex : chapterState.nextChapterIndex, chapterState.progress < 0.5 ? 1.0 : 0.0)
        : getRouteFrame(chapterState.chapterIndex, chapterState.progress);

    setAuthFade(chapterState.transitioning && chapterState.progress < 0.55);
    authCam.setCoord(frame.pos.x, frame.pos.y, frame.pos.z);
    authCam.pointAtCoord(frame.look.x, frame.look.y, frame.look.z);
    if (typeof authCam.setFov === "function") authCam.setFov(frame.fov);
    updateAuthStreamingAnchor(frame.pos, frame.look);
}

mp.events.add('render', updateAuthFlyoverFrame);

function prepareHiddenAuthPlayer() {
    const player = mp.players.local;

    player.freezePosition(true);
    player.setAlpha(0, false);
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
    player.setAlpha(showCharacter ? 255 : 0, false);
    if (typeof player.setVisible === "function") player.setVisible(true, false);
    if (typeof player.setCollision === "function") player.setCollision(true, true);
    player.freezePosition(!unfreeze);
}

/// Инициализация перед авторизацией
mp.events.add('auth.init', () => {
    mp.gui.cursor.show(true, true);
    mp.game.ui.displayRadar(false);
    mp.game.ui.displayHud(false);

    resetAuthCamera(false);
    applyAuthNight();
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