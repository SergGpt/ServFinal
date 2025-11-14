let currentBroker = null;
let currentBrokerTitle = '';
const spawnedBrokers = new Set();
let isMenuOpen = false;
let isProcessing = false;

function setProcessing(state) {
    const value = state === true || state === 'true' || state === 1;
    isProcessing = value;
    mp.callCEFV(`pawnshop.setProcessing(${value});`);
}

function showPromptIfNeeded() {
    if (!currentBroker) return;
    mp.prompt.show(`Нажмите <span>E</span>, чтобы поговорить со скупщиком «${currentBrokerTitle}»`);
}

function closePawnshopMenu() {
    if (isMenuOpen) {
        mp.busy.remove('pawnshop');
        isMenuOpen = false;
    }
    setProcessing(false);
    mp.callCEFV('pawnshop.close();');
    showPromptIfNeeded();
}

function openPawnshopMenu(data) {
    try {
        const payload = JSON.stringify(data);
        mp.callCEFV(`pawnshop.open(${payload});`);
    } catch (e) {
        mp.console.logInfo(`pawnshops.menu.show serialization error: ${e.message}`);
        return;
    }
    if (!isMenuOpen) {
        mp.busy.add('pawnshop', true);
        isMenuOpen = true;
    }
    setProcessing(false);
}

mp.events.add({
    'pawnshops.init': (json) => {
        if (!json) return;
        let data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            return mp.console.logInfo(`pawnshops.init parse error: ${e.message}`);
        }
        data.forEach((entry) => {
            if (!entry || !entry.id || !entry.ped) return;
            if (spawnedBrokers.has(entry.id)) return;
            spawnedBrokers.add(entry.id);
            mp.events.call('NPC.create', {
                model: entry.ped.model,
                position: entry.ped.position,
                heading: entry.ped.heading,
                marker: entry.ped.marker,
                blip: entry.ped.blip,
            });
        });
    },
    'pawnshops.prompt': (brokerId, title) => {
        if (!brokerId) {
            currentBroker = null;
            currentBrokerTitle = '';
            mp.prompt.hide();
            closePawnshopMenu();
            return;
        }
        currentBroker = brokerId;
        currentBrokerTitle = title || 'Скупщик';
        showPromptIfNeeded();
    },
    'pawnshops.menu.show': (json) => {
        if (!json) {
            closePawnshopMenu();
            return;
        }

        let data;
        try {
            data = typeof json === 'string' ? JSON.parse(json) : json;
        } catch (e) {
            mp.console.logInfo(`pawnshops.menu.show parse error: ${e.message}`);
            closePawnshopMenu();
            return;
        }

        if (data && data.id) currentBroker = data.id;
        if (data && data.title) currentBrokerTitle = data.title;

        mp.prompt.hide();
        openPawnshopMenu(data || {});
    },
    'pawnshops.menu.hide': () => {
        closePawnshopMenu();
    },
    'pawnshops.menu.processing': (state) => {
        setProcessing(state);
    }
});

mp.events.add('pawnshops.ui.close', () => {
    closePawnshopMenu();
});

mp.events.add('pawnshops.ui.sell.item', (itemId) => {
    if (!currentBroker || itemId == null) return;
    if (isProcessing) return;
    setProcessing(true);
    mp.events.callRemote('pawnshops.sell.item', currentBroker, itemId);
});

mp.events.add('pawnshops.ui.sell.one', () => {
    if (!currentBroker) return;
    if (isProcessing) return;
    setProcessing(true);
    mp.events.callRemote('pawnshops.sell.one', currentBroker);
});

mp.events.add('pawnshops.ui.sell.all', () => {
    if (!currentBroker) return;
    if (isProcessing) return;
    setProcessing(true);
    mp.events.callRemote('pawnshops.sell.all', currentBroker);
});

mp.keys.bind(0x45, true, () => { // E
    if (!currentBroker) return;
    if (mp.busy.includes()) return;
    mp.events.callRemote('pawnshops.menu.request', currentBroker);
    mp.prompt.hide();
});
