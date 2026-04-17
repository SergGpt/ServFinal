const editor = {
    active: false,
    draft: {
        zoneId: null,
        name: '',
        radius: 100,
        guardCount: 3,
        chiefCount: 1,
        dimension: 0,
    },
};

const presetNames = [
    'Security Zone Alpha',
    'Security Zone Bravo',
    'Security Zone Charlie',
    'Security Zone Delta',
    'Security Zone Echo',
];

const radiusValues = ['50', '75', '100', '125', '150', '200'];
const guardValues = ['1', '2', '3', '4', '5', '6'];
const chiefValues = ['0', '1', '2'];

function clampIndex(values, currentValue) {
    const idx = values.indexOf(String(currentValue));
    return idx >= 0 ? idx : 0;
}

function notify(text, type = 'info') {
    try {
        if (type === 'error') mp.notify.error(text, 'Security');
        else mp.notify.info(text, 'Security');
    } catch {}
}

function sendField(field, value) {
    mp.events.callRemote('security:editor:setField', field, String(value));
}

function buildMenu() {
    const zoneLabel = editor.draft.zoneId ? `#${editor.draft.zoneId}` : 'не создана';
    const header = `Security Zone Editor (${zoneLabel})`;

    const nameIndex = Math.max(0, presetNames.indexOf(editor.draft.name || presetNames[0]));
    const radiusIndex = clampIndex(radiusValues, editor.draft.radius || 100);
    const guardIndex = clampIndex(guardValues, editor.draft.guardCount || 3);
    const chiefIndex = clampIndex(chiefValues, editor.draft.chiefCount || 1);

    mp.callCEFV(`selectMenu.menu = {
        name: "securityZoneEditor",
        header: "${header}",
        items: [
            { text: "Название", values: ${JSON.stringify(presetNames)}, i: ${nameIndex} },
            { text: "Радиус", values: ${JSON.stringify(radiusValues)}, i: ${radiusIndex} },
            { text: "Охрана (guard)", values: ${JSON.stringify(guardValues)}, i: ${guardIndex} },
            { text: "Главный (chief)", values: ${JSON.stringify(chiefValues)}, i: ${chiefIndex} },
            { text: "Создать зону" },
            { text: "Создать NPC в этой зоне" },
            { text: "Удалить NPC зоны" },
            { text: "Сохранить зону" },
            { text: "Закрыть" }
        ],
        i: 0,
        j: 0,
        handler(eventName) {
            var item = this.items[this.i];
            var e = {
                itemName: item.text,
                itemValue: (item.i != null && item.values) ? item.values[item.i] : null,
            };
            if (eventName == 'onItemValueChanged') {
                if (e.itemName == 'Название') mp.trigger('security:editor:client:setName', String(e.itemValue || ''));
                if (e.itemName == 'Радиус') mp.trigger('security:editor:client:setRadius', parseInt(e.itemValue || '100'));
                if (e.itemName == 'Охрана (guard)') mp.trigger('security:editor:client:setGuardCount', parseInt(e.itemValue || '3'));
                if (e.itemName == 'Главный (chief)') mp.trigger('security:editor:client:setChiefCount', parseInt(e.itemValue || '1'));
            }
            if (eventName == 'onItemSelected') {
                if (e.itemName == 'Создать зону') mp.trigger('security:editor:client:createZone');
                if (e.itemName == 'Создать NPC в этой зоне') mp.trigger('security:editor:client:spawnNpc');
                if (e.itemName == 'Удалить NPC зоны') mp.trigger('security:editor:client:deleteNpc');
                if (e.itemName == 'Сохранить зону') mp.trigger('security:editor:client:saveZone');
                if (e.itemName == 'Закрыть') mp.trigger('security:editor:client:close');
            }
            if (eventName == 'onEscapePressed' || eventName == 'onBackspacePressed') {
                mp.trigger('security:editor:client:close');
            }
        }
    }`);

    mp.callCEFV('selectMenu.show = true;');
}

function openEditor() {
    if (editor.active) return;
    editor.active = true;

    try {
        if (!mp.busy.add('security.zone.editor', false)) {
            editor.active = false;
            return;
        }
    } catch {}

    buildMenu();
    notify('Редактор зон охраны открыт.');
}

function closeEditor(silent = false) {
    if (!editor.active) return;

    editor.active = false;
    try { mp.busy.remove('security.zone.editor'); } catch {}
    try { mp.callCEFV('selectMenu.show = false;'); } catch {}

    if (!silent) notify('Редактор зон охраны закрыт.');
}

function refreshMenu() {
    if (!editor.active) return;
    buildMenu();
}

mp.events.add('security:editor:open', openEditor);
mp.events.add('security:editor:close', () => closeEditor(true));

mp.events.add('security:editor:sync', (draftJson) => {
    try {
        const draft = JSON.parse(draftJson || '{}');
        editor.draft = {
            ...editor.draft,
            ...draft,
        };
        refreshMenu();
    } catch {}
});

mp.events.add('security:editor:client:setName', (value) => sendField('name', value));
mp.events.add('security:editor:client:setRadius', (value) => sendField('radius', value));
mp.events.add('security:editor:client:setGuardCount', (value) => sendField('guardCount', value));
mp.events.add('security:editor:client:setChiefCount', (value) => sendField('chiefCount', value));

mp.events.add('security:editor:client:createZone', () => mp.events.callRemote('security:editor:createZone'));
mp.events.add('security:editor:client:spawnNpc', () => mp.events.callRemote('security:editor:spawnNpc'));
mp.events.add('security:editor:client:deleteNpc', () => mp.events.callRemote('security:editor:deleteNpc'));
mp.events.add('security:editor:client:saveZone', () => mp.events.callRemote('security:editor:saveZone'));

mp.events.add('security:editor:client:close', () => {
    mp.events.callRemote('security:editor:close');
    closeEditor();
});
