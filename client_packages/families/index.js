const TABLET_BUSY_NAME = 'familiesTablet';
const CREATION_BUSY_NAME = 'familiesCreation';

let tabletOpen = false;
let creationOpen = false;

function escapeForBrowser(value) {
    if (value === undefined || value === null) return 'undefined';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
        return `\`${value
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\$/g, '\\$')
            .replace(/<\//g, '<\\/')}\``;
    }
    return JSON.stringify(value)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/<\//g, '<\\/');
}

function sendToBrowser(functionName, ...args) {
    const serialized = args.map(arg => escapeForBrowser(arg));
    const call = `${functionName}(${serialized.join(', ')});`;
    mp.callCEFV(call);
}

function closeTablet() {
    if (!tabletOpen) return;
    tabletOpen = false;
    mp.busy.remove(TABLET_BUSY_NAME);
    sendToBrowser('familiesUI.closeTablet');
}

function closeCreation() {
    if (!creationOpen) return;
    creationOpen = false;
    mp.busy.remove(CREATION_BUSY_NAME);
    sendToBrowser('familiesUI.closeCreation');
}

mp.events.add({
    'families.tablet.open': (payload) => {
        if (!mp.busy.add(TABLET_BUSY_NAME, true)) return;
        tabletOpen = true;
        sendToBrowser('familiesUI.openTablet', payload);
    },
    'families.tablet.refresh': (payload) => {
        if (!tabletOpen) return;
        sendToBrowser('familiesUI.refreshTablet', payload);
    },
    'families.tablet.close': closeTablet,
    'families.tablet.hide': closeTablet,
    'families.tablet.forceClose': closeTablet,
    'families.creation.open': (payload) => {
        if (!mp.busy.add(CREATION_BUSY_NAME, true)) return;
        creationOpen = true;
        sendToBrowser('familiesUI.openCreation', payload);
    },
    'families.creation.close': closeCreation,
    'families.creation.hide': closeCreation,
    'families.creation.forceClose': closeCreation,
    'families.creation.npc': (data) => {
        const list = Array.isArray(data) ? data : [data];
        list.forEach((entry) => mp.events.call('NPC.create', entry));
    },
});

mp.keys.bind(0x4F, false, () => { // O key (key up)
    if (mp.game.ui.isPauseMenuActive()) return;
    if (mp.busy.includes()) return;
    mp.events.callRemote('families.tablet.request');
});

mp.keys.bind(0x45, true, () => { // E key
    if (!mp.players.local.getVariable('familiesCreation')) return;
    if (mp.busy.includes()) return;
    mp.events.callRemote('families.creation.request');
});

mp.events.add('families.tablet.forceClose', closeTablet);
mp.events.add('families.creation.forceClose', closeCreation);
