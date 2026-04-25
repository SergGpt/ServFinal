mp.adminLevel = 0;
mp.wallhack = false;
mp.clothesEditor = {
    snapshot: null,
    snapshotTaken: false,
};
mp.clothesEditorCamera = {
    cam: null,
    angle: 30,
    distance: 2.2,
    height: 0.95,
    frameOffset: 0.25,
};

const clothesEditorTypeMap = {
    tops: { kind: 'component', index: 11 },
    pants: { kind: 'component', index: 4 },
    shoes: { kind: 'component', index: 6 },
    bags: { kind: 'component', index: 5 },
    hats: { kind: 'prop', index: 0 },
    glasses: { kind: 'prop', index: 1 },
    ears: { kind: 'prop', index: 2 },
    watches: { kind: 'prop', index: 6 },
    bracelets: { kind: 'prop', index: 7 },
    ties: { kind: 'component', index: 7 },
};

function captureClothesSnapshot() {
    const player = mp.players.local;
    const snapshot = {
        components: {},
        props: {},
    };
    for (let i = 0; i <= 11; i++) {
        let drawable = 0;
        let texture = 0;
        try { drawable = player.getDrawableVariation(i); } catch (e) {}
        try { texture = player.getTextureVariation(i); } catch (e) {}
        snapshot.components[i] = {
            drawable: Number.isFinite(drawable) ? drawable : 0,
            texture: Number.isFinite(texture) ? texture : 0,
        };
    }
    for (let i = 0; i <= 7; i++) {
        let drawable = -1;
        let texture = 0;
        try { drawable = player.getPropIndex(i); } catch (e) {}
        try { texture = player.getPropTextureIndex(i); } catch (e) {}
        snapshot.props[i] = {
            drawable: Number.isFinite(drawable) ? drawable : -1,
            texture: Number.isFinite(texture) ? texture : 0,
        };
    }
    return snapshot;
}

function applyClothesSnapshot(snapshot) {
    if (!snapshot) return;
    const player = mp.players.local;
    Object.keys(snapshot.components).forEach((componentId) => {
        const value = snapshot.components[componentId];
        player.setComponentVariation(parseInt(componentId), value.drawable, value.texture, 0);
    });
    Object.keys(snapshot.props).forEach((propId) => {
        const value = snapshot.props[propId];
        if (value.drawable == null || value.drawable < 0) player.clearProp(parseInt(propId));
        else player.setPropIndex(parseInt(propId), value.drawable, value.texture, true);
    });
}

function updateClothesEditorCamera() {
    const state = mp.clothesEditorCamera;
    if (!state.cam) return;

    const player = mp.players.local;
    const pos = player.position;
    const rad = state.angle * Math.PI / 180.0;

    const camX = pos.x + Math.cos(rad) * state.distance;
    const camY = pos.y + Math.sin(rad) * state.distance;
    const camZ = pos.z + state.height;

    state.cam.setCoord(camX, camY, camZ);

    // Смещение кадра относительно окна (чтобы персонаж не перекрывался UI справа).
    const lookRad = (state.angle + 90) * Math.PI / 180.0;
    const lookX = pos.x + Math.cos(lookRad) * state.frameOffset;
    const lookY = pos.y + Math.sin(lookRad) * state.frameOffset;
    const lookZ = pos.z + 0.7;
    state.cam.pointAtCoord(lookX, lookY, lookZ);
}

function startClothesEditorCamera() {
    const state = mp.clothesEditorCamera;
    if (state.cam) return;

    const player = mp.players.local;
    state.angle = player.getHeading() + 40;
    state.distance = 2.2;
    state.height = 0.95;
    state.frameOffset = 0.25;

    state.cam = mp.cameras.new('clothes.editor.camera', new mp.Vector3(0, 0, 0), new mp.Vector3(0, 0, 0), 48);
    updateClothesEditorCamera();
    state.cam.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 250, true, false);
}

function stopClothesEditorCamera() {
    const state = mp.clothesEditorCamera;
    if (!state.cam) return;

    state.cam.setActive(false);
    mp.game.cam.renderScriptCams(false, false, 250, true, false);
    state.cam.destroy();
    state.cam = null;
}

mp.events.add({
    'admin.set': (level) => {
        mp.adminLevel = level;
    },
    'slap': () => {
        var veh = mp.players.local.vehicle;
        (veh) ? veh.setVelocity(0, 0, 10) : mp.players.local.setVelocity(0, 0, 10);
    },
    'entityStreamIn': (entity) => {
        if (entity.type != 'player') return;
        if (entity == mp.players.local) return;
        let isVanished = entity.getVariable('isVanished') || false;
        entity.setAlpha(isVanished ? 0 : 255);
    },
    'render': () => {
        if (mp.clothesEditorCamera.cam) updateClothesEditorCamera();
        let isVanished = mp.players.local.getVariable('isVanished') || false;
        if (isVanished) {
            mp.game.graphics.drawText("INVISIBILITY ON", [0.93, 0.12], {
                font: 0,
                color: [3, 152, 252, 200],
                scale: [0.37, 0.37],
                outline: true
            });
        }
        if (mp.wallhack) {
            mp.game.graphics.drawText("WALLHACK ON", [0.93, 0.16], {
                font: 0,
                color: [3, 152, 252, 200],
                scale: [0.37, 0.37],
                outline: true
            });

            mp.players.forEachInStreamRange(entity => {
                if (entity === mp.players.local) return;
                mp.game.graphics.drawText(`${entity.name} (${entity.remoteId}) \nHP: ${entity.getHealth()} | ARM: ${entity.getArmour()}`,
                    [entity.position.x, entity.position.y, entity.position.z + 1], {
                    font: 0,
                    color: [255, 255, 255, 255],
                    scale: [0.23, 0.23],
                    outline: true
                });
            });

            mp.vehicles.forEachInStreamRange(entity => {
                mp.game.graphics.drawText(`VEH #${entity.remoteId}`,
                    [entity.position.x, entity.position.y, entity.position.z], {
                        font: 0,
                        color: [255, 232, 189, 255],
                        scale: [0.18, 0.18],
                        outline: true
                    });
            });
        }
    },
    'characterInit.done': () => {
        mp.keys.bind(0x72, true, () => { // F3
            if (!mp.adminLevel) return;
            mp.wallhack = !mp.wallhack;
        });
    },
    'admin.stats.show': (data) => {
        data = JSON.parse(data);
        mp.callCEFV(`modal.modals["admin_stats"].header = '${data.name}'`);
        let content = '';
        let stats = {
            'Основное': {
                'Пол': `${data.gender ? 'женский' : 'мужской'}`,
                'Наличные': `$${data.cash}`,
                'Банк. счет': `$${data.bank}`,
                'Отыграно минут': `${data.minutes}`,
                'Номер телефона': `${data.phone ? data.phone : 'нет'}`,
                'Сытость': `${data.satiety}`,
                'Жажда': `${data.thirst}`,
                'Законопослушность': `${data.law}`,
                'Преступлений': `${data.crimes}`,
                'Розыск': `${data.wanted}`,
                'Причина розыска': `${data.wantedCause ? data.wantedCause : 'нет'}`,
            },
            'Лицензии': {
                'Легковые т/с': `${data.carLicense ? 'есть' : 'нет'}`,
                'Пассажирские т/с': `${data.passengerLicense ? 'есть' : 'нет'}`,
                'Мотоциклы': `${data.bikeLicense ? 'есть' : 'нет'}`,
                'Грузовые т/с': `${data.truckLicense ? 'есть' : 'нет'}`,
                'Воздушные т/с': `${data.airLicense ? 'есть' : 'нет'}`,
                'Водные т/с': `${data.boatLicense ? 'есть' : 'нет'}`,
                'Оружие': `${data.gunLicenseDate ? `до ${data.gunLicenseDate}` : 'нет'}`,
            },
            'Наказания': {
                'Количество варнов': `${data.warnNumber}`,
                'Дата окончания варна': `${data.warnDate ? data.warnDate : 'нет'}`,
                'Время ареста': `${data.arrestTime}`,
                'Тип ареста': `${data.arrestType}`,
            },
        }

        for (let category in stats) {
            content += `<h3>${category}</h3>`;
            let section = stats[category];
            for (let key in section) {
                content += `${key}: <b>${section[key]}</b><br>`;
            }
        }

        mp.callCEFV(`modal.modals["admin_stats"].content = \`${content}\``);
        mp.callCEFV('modal.showByName("admin_stats")')
    },

    // --------- Команда для одежды ---------
    'cloth': (comp, drawable, texture) => {
        comp = parseInt(comp);
        drawable = parseInt(drawable);
        texture = parseInt(texture);

        mp.players.local.setComponentVariation(comp, drawable, texture, 0);

        mp.game.graphics.notify(`~g~Cloth set: comp ${comp}, drawable ${drawable}, texture ${texture}`);
    },
    'clothes.editor.open': (rawData) => {
        mp.events.call('busy.add', 'clothes.editor', true);
        startClothesEditorCamera();
        if (!mp.clothesEditor.snapshotTaken) {
            mp.clothesEditor.snapshot = captureClothesSnapshot();
            mp.clothesEditor.snapshotTaken = true;
        }
        const safeData = rawData || '{}';
        mp.callCEFV(`(function(){ if (window.clothesAdminEditor && window.clothesAdminEditor.open) window.clothesAdminEditor.open(${safeData}); })();`);
        if (!rawData) mp.events.callRemote('clothes.editor.fetch', JSON.stringify({ sex: 1, type: 'tops', page: 1, search: '' }));
    },
    'clothes.editor.rows': (rawData) => {
        mp.callCEFV(`window.clothesAdminEditor && window.clothesAdminEditor.setData(${rawData});`);
    },
    'clothes.editor.preview': (rawData) => {
        let data;
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            return;
        }
        const typeSettings = clothesEditorTypeMap[data.type];
        if (!typeSettings) return;

        const drawable = parseInt(data.variation) || 0;
        const texture = parseInt(data.texture) || 0;

        if (typeSettings.kind === 'component') {
            mp.players.local.setComponentVariation(typeSettings.index, drawable, texture, 0);
            if (data.type === 'tops') {
                mp.players.local.setComponentVariation(3, parseInt(data.torso) || 0, parseInt(data.tTexture) || 0, 0);
                mp.players.local.setComponentVariation(8, parseInt(data.undershirt) || 0, parseInt(data.uTexture) || 0, 0);
            }
            return;
        }

        if (drawable < 0) mp.players.local.clearProp(typeSettings.index);
        else mp.players.local.setPropIndex(typeSettings.index, drawable, texture, true);
    },
    'clothes.editor.requestData': (rawQuery) => {
        mp.events.callRemote('clothes.editor.fetch', rawQuery || '{}');
    },
    'clothes.editor.reload': (rawQuery) => {
        mp.events.callRemote('clothes.editor.reload', rawQuery || '{}');
    },
    'clothes.editor.save': (rawPayload) => {
        mp.events.callRemote('clothes.editor.save', rawPayload);
    },
    'clothes.editor.delete': (rawPayload) => {
        mp.events.callRemote('clothes.editor.delete', rawPayload);
    },
    'clothes.editor.restore': () => {
        applyClothesSnapshot(mp.clothesEditor.snapshot);
    },
    'clothes.editor.close': () => {
        mp.events.call('busy.remove', 'clothes.editor');
        stopClothesEditorCamera();
        applyClothesSnapshot(mp.clothesEditor.snapshot);
        mp.clothesEditor.snapshot = null;
        mp.clothesEditor.snapshotTaken = false;
    },
    'clothes.editor.camera.step': (rawDirection) => {
        if (!mp.clothesEditorCamera.cam) return;
        const state = mp.clothesEditorCamera;
        const direction = `${rawDirection || ''}`;

        // left/right: сдвиг кадра, а не орбита вокруг персонажа
        if (direction === 'left') state.frameOffset = Math.min(1.2, state.frameOffset + 0.08);
        if (direction === 'right') state.frameOffset = Math.max(-1.2, state.frameOffset - 0.08);
        if (direction === 'up') state.height = Math.min(1.7, state.height + 0.08);
        if (direction === 'down') state.height = Math.max(0.2, state.height - 0.08);
        if (direction === 'zoom_in') state.distance = Math.max(1.2, state.distance - 0.15);
        if (direction === 'zoom_out') state.distance = Math.min(4.5, state.distance + 0.15);
        if (direction === 'reset') {
            const player = mp.players.local;
            state.angle = player.getHeading() + 40;
            state.distance = 2.2;
            state.height = 0.95;
            state.frameOffset = 0.25;
        }
        updateClothesEditorCamera();
    },
    'clothes.editor.player.rotate': (rawDelta) => {
        const delta = parseFloat(rawDelta);
        if (!Number.isFinite(delta)) return;
        const player = mp.players.local;
        player.setHeading(player.getHeading() + delta);
        updateClothesEditorCamera();
    }
});

mp.events.addDataHandler('isVanished', (entity) => {
    let isVanished = entity.getVariable('isVanished');
    if (entity != mp.players.local) entity.setAlpha(isVanished ? 0 : 255);
});
