var localPlayer = mp.players.local;

/** Browser для редактора */
const browser = mp.browsers.new('package://attachmentsEditor/index.html');
if (browser && mp.browsers.exists(browser)) browser.active = false;

let object = null;
let boneId = 0;
let modelName = '';

mp.keys.bind(0x75, true, () => { // F6
    if (!browser.active) {
        mp.gui.cursor.show(true, true);
        browser.active = true;
    } else {
        onClose();
    }
});

const onClose = () => {
    mp.gui.cursor.show(false, false);
    if (browser && mp.browsers.exists(browser)) browser.active = false;
};

const onClear = () => {
    if (object && mp.objects.exists(object)) object.destroy();
    object = null;
    boneId = 0;
    modelName = '';
};

/** Получаем индекс кости руки (когда в базе 28422) */
function getCorrectBoneIndex(preferredBone) {
    const bone = localPlayer.getBoneIndex(preferredBone);
    if (bone !== -1) return bone;

    // Попробуем несколько альтернатив
    const alternatives = [57005, 60309, 18905, 24818];
    for (let b of alternatives) {
        const idx = localPlayer.getBoneIndex(b);
        if (idx !== -1) return idx;
    }
    return 0;
}

const onApply = (model, bone, positions) => {
    if (!mp.game.streaming.isModelInCdimage(mp.game.joaat(model))) return mp.console.logInfo('Invalid model', true, true);
    if (object) onClear();

    boneId = getCorrectBoneIndex(parseInt(bone));
    if (isNaN(boneId)) return mp.console.logInfo('Invalid bone', true, true);

    object = mp.objects.new(mp.game.joaat(model), new mp.Vector3(localPlayer.position.x, localPlayer.position.y, localPlayer.position.z - 5), {
        rotation: new mp.Vector3(0, 0, 0),
        alpha: 255,
        dimension: localPlayer.dimension
    });
    if (!object) return mp.console.logInfo('Failed to create object', true, true);

    modelName = mp.game.joaat(model);
    positions = JSON.parse(positions);

    setTimeout(() => {
        object.attachTo(
            localPlayer.handle,
            boneId,
            parseFloat(positions.offsetX),
            parseFloat(positions.offsetY),
            parseFloat(positions.offsetZ),
            parseFloat(positions.rotationX),    // X axis
            parseFloat(positions.rotationY),    // Y axis
            parseFloat(positions.rotationZ),    // Z axis
            false,
            true,
            false,
            true,
            1,
            true
        );
    }, 200);
};

const onUpdatePosition = (positions) => {
    if (!object) return;
    positions = JSON.parse(positions);

    object.attachTo(
        localPlayer.handle,
        boneId,
        parseFloat(positions.offsetX),
        parseFloat(positions.offsetY),
        parseFloat(positions.offsetZ),
        parseFloat(positions.rotationX),    // X axis
        parseFloat(positions.rotationY),    // Y axis
        parseFloat(positions.rotationZ),    // Z axis
        false,
        true,
        false,
        true,
        1,
        true
    );
};

const onReset = () => {
    onClear();
};

mp.events.add('cef::attachmentsEditor:updatePosition', onUpdatePosition.bind(this));
mp.events.add('cef::attachmentsEditor:reset', onReset.bind(this));
mp.events.add('cef::attachmentsEditor:apply', onApply.bind(this));
mp.events.add('cef::attachmentsEditor:close', onClose.bind(this));