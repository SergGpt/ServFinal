"use strict";

let authCam = null;
let authCamTimer = null;

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
    
    const startPos = new mp.Vector3(800.0, -1500.0, 500.0);
    const midPos1 = new mp.Vector3(200.0, 0.0, 450.0);
    const midPos2 = new mp.Vector3(-600.0, 700.0, 400.0);
    const endPos = new mp.Vector3(-1500.0, 1500.0, 350.0);
    const lookAt = new mp.Vector3(0.0, 0.0, 100.0);
    
    let progress = 0.0;
    const speed = 0.00005;
    
    authCam = mp.cameras.new("authCam", startPos, new mp.Vector3(0,0,0), 50);
    authCam.pointAtCoord(lookAt.x, lookAt.y, lookAt.z);
    authCam.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 2000, true, false);
    
    authCamTimer = setInterval(() => {
        if (!authCam) return;
        
        progress += speed;
        if (progress >= 1.0) progress = 0.0;
        
        let x, y, z;
        if (progress < 0.33) {
            const t = progress / 0.33;
            x = startPos.x + (midPos1.x - startPos.x) * t;
            y = startPos.y + (midPos1.y - startPos.y) * t;
            z = startPos.z + (midPos1.z - startPos.z) * t;
        } else if (progress < 0.66) {
            const t = (progress - 0.33) / 0.33;
            x = midPos1.x + (midPos2.x - midPos1.x) * t;
            y = midPos1.y + (midPos2.y - midPos1.y) * t;
            z = midPos1.z + (midPos2.z - midPos1.z) * t;
        } else {
            const t = (progress - 0.66) / 0.34;
            x = midPos2.x + (endPos.x - midPos2.x) * t;
            y = midPos2.y + (endPos.y - midPos2.y) * t;
            z = midPos2.z + (endPos.z - midPos2.z) * t;
        }
        
        z += Math.sin(progress * Math.PI * 2) * 10;
        
        authCam.setCoord(x, y, z);
        authCam.pointAtCoord(lookAt.x, lookAt.y, lookAt.z);
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