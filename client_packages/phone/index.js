"use strict";

let isBinding = false;
let isCall = false;

mp.attachmentMngr.register("takePhone", "prop_npc_phone", 58867, new mp.Vector3(0.06, 0.04, 0.01), new mp.Vector3(-15, 0, -145)); /// Телефон в руке
mp.attachmentMngr.register("callPhone", "prop_npc_phone", 58867, new mp.Vector3(0.01, 0.05, -0.02), new mp.Vector3(-5, -65, 165)); /// Телефон у уха

mp.events.add('phone.load', function (phoneInfo, phoneDialogs, apps) {
    phoneInfo.houses.forEach(house => {
        house.area = mp.game.ui.getLabelText(mp.game.zone.getNameOfZone(house.pos[0], house.pos[1], house.pos[2]));
    });

    phoneInfo.biz.forEach(currentBiz => {
        currentBiz.area = mp.game.ui.getLabelText(mp.game.zone.getNameOfZone(currentBiz.pos[0], currentBiz.pos[1], currentBiz.pos[2]));
    });
    mp.callCEFR('phone.load', [phoneInfo]);
    mp.callCEFR('phone.message.list', [phoneDialogs]);
    apps.forEach(app => {
        mp.callCEFR('phone.app.add', [app, null]);
    });
    bindButtons(phoneInfo.isHave);
});

/// Добавление приложения
/// house
/// biz
/// factionBiz
/// taxi
mp.events.add('phone.app.add', function (appName, info) {
    if (info != null) {
        info.area = mp.game.ui.getLabelText(mp.game.zone.getNameOfZone(info.pos[0], info.pos[1], info.pos[2]));
    }
    mp.callCEFR('phone.app.add', [appName, info]);
});
/// Удаление приложения
mp.events.add('phone.app.remove', function (appName, index) {
    /// index - номер дропнутого дома(для возможности иметь несколько домов)
    mp.callCEFR('phone.app.remove', [appName]);
});

mp.events.add('characterInit.done', function () {
    /// Добавление канала в войсчат
    mp.speechChannel.addChannel("phone");
});

/// Начало разговора на нашем конце
mp.events.add('phone.call.start', function (number) {
    mp.events.callRemote('phone.call.ask', number);
    //playHoldAnimation(false);
    playCallAnimation(true);
});

/// Ответ на наше начало разговора
/// 0 Вызов принят, 1 Нет номера, 2 Занято, 3 Сброс вызова, 4 Не поднял трубку
mp.events.add('phone.call.start.ans', function (ans) {
    //playCallAnimation(false);
    playHoldAnimation(true, 1000);
    /// Ответ на звонок
    mp.callCEFR('phone.call.ans', [ans]);
});

/// Сброс на нашем конце
mp.events.add('phone.call.end', function () {
    mp.events.callRemote('phone.call.end');
    //playCallAnimation(false);
    playHoldAnimation(true);
});

/// Сброс звонка на другом конце
mp.events.add('phone.call.end.in', function () {
    isCall = false;
    mp.callCEFR('phone.call.end', []);
    //playCallAnimation(false);
    playHoldAnimation(true);
});

/// Уведомление о том, что нам звонят
mp.events.add('phone.call.in', function (startedPlayerNumber) {
    isCall = true;
    /// Звонок игроку на телефон
    mp.callCEFR('phone.call.in', [startedPlayerNumber]);
});

/// Когда звонят нам и мы принимаем/отклоняем звонок
mp.events.add('phone.call.in.ans', function (ans) {
    mp.events.callRemote('phone.call.ans', ans);
    if (ans == 1) {
        //playHoldAnimation(false);
        playCallAnimation(true);
    }
});

mp.events.add('phone.call.story.add', function (number, type, date) {
    mp.callCEFR('phone.call.story.add', [number, type, date])
});

mp.events.add("playerDeath", (player) => {
    if (player.remoteId === mp.players.local.remoteId) {
        if (mp.busy.includes('phone')) {
            hidePhone();
        }
    }
});

/// Отправка сообщения
mp.events.add('phone.message.send', function (message, number) {
    mp.events.callRemote('phone.message.send', message, number);
});

/// Получение сообщения
mp.events.add('phone.message.set', function (message, number) {
    mp.notify.info("Новое сообщение", "Телефон");
    mp.callCEFR('phone.message.set', [message, number]);
});

/// Прочтение диалога
mp.events.add('phone.dialog.read', function (dialogNumber) {
    mp.events.callRemote('phone.dialog.read', dialogNumber);
});

/// Добавить контакт
mp.events.add('phone.contact.add', function (name, number) {
    mp.events.callRemote('phone.contact.add', name, number);
});

/// Изменить контакт
mp.events.add('phone.contact.rename', function (number, name) {
    mp.events.callRemote('phone.contact.rename', number, name);
});

/// Удалить контакт
mp.events.add('phone.contact.remove', function (number) {
    mp.events.callRemote('phone.contact.remove', number);
});

/// Изменить мой номер
mp.events.add('phone.contact.mine.update', function (oldNumber, newNumber) {
    mp.callCEFR('phone.contact.mine.update', [oldNumber, newNumber]);
});

/// Передать сообщение об ошибке на телефон
/// 1) Номера не существует
/// 2) Абонент вне зоны действия сети
/// 3) Запись с таким имененем уже существует
/// 4) Запись не найдена
mp.events.add('phone.error', function (number) {
    mp.callCEFR('phone.error', [number]);
});



let bindButtons = (state) => {
    if (state) {
        if (isBinding) return;
        isBinding = true;
        mp.keys.bind(0x26, true, showPhone);        // UP ARROW key
        mp.keys.bind(0x28, true, hidePhone);        // DOWN ARROW key
    }
    else {
        if (!isBinding) return;
        isBinding = false;
        mp.keys.unbind(0x26, true, showPhone);        // UP ARROW key
        mp.keys.unbind(0x28, true, hidePhone);        // DOWN ARROW key
    }
};
mp.events.add("phone.show", (state) => {
    if (state) {
        showPhone();
    }
    else {
        hidePhone();
    }
});

mp.events.add('marketplace.fullscreen.open', () => {
    if (!mp.busy.add('marketplace')) return;
    mp.callCEFR('marketplace.fullscreen.open', []);
    hidePhone();
});

mp.events.add('marketplace.phone.data', (lots, sellOptions) => {
    mp.callCEFR('marketplace.phone.data', [lots, sellOptions]);
});

mp.events.add('marketplace.fullscreen.close', () => {
    mp.busy.remove('marketplace');
});

const parseCustomizationPayload = (rawData) => {
    if (!rawData) return {};
    if (typeof rawData === 'object') return rawData;

    try {
        return JSON.parse(rawData);
    } catch (e) {
        return {};
    }
};

let weaponSkinByHash = {};

const normalizeWeaponHashForSkin = (weaponHash) => {
    weaponHash = parseInt(weaponHash);
    if (isNaN(weaponHash)) return null;
    if (mp.weapons && mp.weapons.hashToValid) weaponHash = mp.weapons.hashToValid(weaponHash);

    return parseInt(weaponHash);
};

const getPreviewWeaponHash = () => {
    const player = mp.players.local;
    const unarmedHash = mp.game.joaat('weapon_unarmed');
    let weaponHash = player.weapon || (mp.weapons && mp.weapons.currentWeapon ? mp.weapons.currentWeapon() : 0);

    if ((!weaponHash || weaponHash === unarmedHash) && mp.weapons && mp.weapons.hashes && mp.weapons.hashes.length) {
        weaponHash = mp.weapons.hashes[0];
    }

    weaponHash = normalizeWeaponHashForSkin(weaponHash);
    if (!weaponHash || weaponHash === normalizeWeaponHashForSkin(unarmedHash)) return null;

    return weaponHash;
};

const applyWeaponSkin = (weaponHash, tintId) => {
    weaponHash = normalizeWeaponHashForSkin(weaponHash);
    tintId = parseInt(tintId);
    if (!weaponHash || isNaN(tintId)) return false;

    mp.game.invoke('0x50969B9B89ED5738', mp.players.local.handle, weaponHash, tintId);
    return true;
};

const reapplySavedWeaponSkin = (weaponHash, delay = 0) => {
    weaponHash = normalizeWeaponHashForSkin(weaponHash);
    if (!weaponHash || weaponSkinByHash[weaponHash] == null) return;

    const apply = () => applyWeaponSkin(weaponHash, weaponSkinByHash[weaponHash]);
    if (delay > 0) setTimeout(apply, delay);
    else apply();
};

mp.events.add('phone.customization.weapon.preview', (rawData) => {
    const data = parseCustomizationPayload(rawData);
    const tintId = parseInt(data.tintId);
    if (isNaN(tintId)) return;

    const weaponHash = getPreviewWeaponHash();
    if (!weaponHash) {
        mp.notify.warning('В инвентаре нет оружия для скина', 'Кастомизация');
        return;
    }

    weaponSkinByHash[weaponHash] = tintId;
    applyWeaponSkin(weaponHash, tintId);
    mp.events.callRemote('phone.customization.weapon.save', weaponHash, tintId);
    mp.notify.info(`Скин оружия сохранён: ${tintId}`, 'Кастомизация');
});

mp.events.add('phone.customization.weapon.skins.load', (rawData) => {
    const skins = parseCustomizationPayload(rawData);
    weaponSkinByHash = {};

    if (!Array.isArray(skins)) return;

    skins.forEach((skin) => {
        const weaponHash = normalizeWeaponHashForSkin(skin.weaponHash);
        const tintId = parseInt(skin.tintId);
        if (!weaponHash || isNaN(tintId)) return;

        weaponSkinByHash[weaponHash] = tintId;
        applyWeaponSkin(weaponHash, tintId);
    });
});

mp.events.add('phone.customization.weapon.skin.saved', (weaponHash, tintId) => {
    weaponHash = normalizeWeaponHashForSkin(weaponHash);
    tintId = parseInt(tintId);
    if (!weaponHash || isNaN(tintId)) return;

    weaponSkinByHash[weaponHash] = tintId;
    applyWeaponSkin(weaponHash, tintId);
});

mp.events.add('playerWeaponChanged', (weaponHash) => {
    reapplySavedWeaponSkin(weaponHash);
});

mp.events.add('weapons.giveWeapon', (weaponHash) => {
    reapplySavedWeaponSkin(weaponHash, 100);
    reapplySavedWeaponSkin(weaponHash, 500);
});

let showPhone = () => {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (mp.busy.includes()) return;
    let player = mp.players.local;
    if (player.getVariable("knocked")) return;
    if (!player.getHealth()) return;
    isCall = false;

    if (!mp.busy.add('phone')) return;
    mp.callCEFR('phone.show', [true]);
    playCallAnimation(false);
    playHoldAnimation(true);
};

let hidePhone = () => {
    if (mp.game.ui.isPauseMenuActive()) return;
    if (!isCall) {
        if (!mp.busy.includes('phone')) return;
    }
    isCall = false;

    mp.callCEFR('phone.show', [false]);
    mp.busy.remove('phone');
    playHoldAnimation(false);
    playCallAnimation(false);
    if (!mp.players.local.vehicle) {
        mp.events.callRemote('animations.stop');
    }
};

function playHoldAnimation(state, timeout) { /// Анимация держания телефона
    if (mp.players.local.vehicle) return;
    if (mp.players.local.getVariable('seatInfo')) return;
    if (mp.orangePicker.isInside() || mp.orangePicker.isPicking()) return;

    if (state) {
        if (!timeout) timeout = 0;
        mp.timer.add(()=> {
            mp.attachmentMngr.removeLocal("callPhone");
            mp.events.callRemote('animations.play', 'amb@code_human_wander_texting@male@base', 'static', 1, 49);
            mp.attachmentMngr.addLocal("takePhone");
        }, timeout);
    }
    else {
        mp.attachmentMngr.removeLocal("takePhone");
    }
}

function playCallAnimation(state) { /// Анимация разговора
    if (mp.players.local.vehicle) return;
    if (mp.players.local.getVariable('seatInfo')) return;
    if (mp.orangePicker.isInside() || mp.orangePicker.isPicking()) return;

    if (state) {
        mp.attachmentMngr.removeLocal("takePhone");
        mp.events.callRemote('animations.play', 'amb@code_human_wander_mobile@male@base', 'static', 1, 49);
        mp.attachmentMngr.addLocal("callPhone");
    }
    else {
        mp.attachmentMngr.removeLocal("callPhone");
    }
}
