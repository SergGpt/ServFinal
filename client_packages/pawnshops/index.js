let currentBroker = null;
let currentBrokerTitle = '';
const spawnedBrokers = new Set();

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
            return;
        }
        currentBroker = brokerId;
        currentBrokerTitle = title || 'Скупщик';
        mp.prompt.show(`Нажмите <span>E</span>, чтобы поговорить со скупщиком «${currentBrokerTitle}»`);
    },

    'pawnshops.menu.show': (json) => {
        if (!json) {
            mp.callCEFV(`if (selectMenu.menu && selectMenu.menu.name === 'pawnshop') selectMenu.show = false;`);
            return;
        }

        // Парсим данные на клиенте
        let data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            return mp.console.logInfo(`pawnshops.menu.show parse error: ${e.message}`);
        }

        // Синхронизация актуального брокера и заголовка
        if (data && data.id) currentBroker = data.id;
        if (data && data.title) currentBrokerTitle = data.title;

        mp.prompt.hide();

        // Безопасная сериализация для CEF
        const payload = JSON.stringify(data);

        // Принудительный сброс + чистая инициализация
        mp.callCEFV(`
            (function(){
                try {
                    if (selectMenu.menu && selectMenu.menu.name === 'pawnshop') {
                        selectMenu.show = false;
                    }
                    const menu = selectMenu.menus['pawnshop'];
                    if (menu && typeof menu.reset === 'function') {
                        menu.reset();
                    } else if (window.selectMenu && typeof selectMenu.clear === 'function') {
                        selectMenu.clear();
                    }
                    selectMenu.menus['pawnshop'].init(${payload});
                    selectMenu.showByName('pawnshop');
                } catch (e) {
                    console.error('pawnshop CEF init error:', e && e.message);
                }
            })();
        `);
    },

    'pawnshops.menu.hide': () => {
        mp.callCEFV(`
            if (selectMenu.menu && selectMenu.menu.name === 'pawnshop') {
                selectMenu.show = false;
            }
        `);
        if (currentBroker) {
            mp.prompt.show(`Нажмите <span>E</span>, чтобы поговорить со скупщиком «${currentBrokerTitle}»`);
        }
    }
});

// Клавиша E
mp.keys.bind(0x45, true, () => { // E
    if (!currentBroker) return;
    if (mp.busy.includes()) return;
    mp.events.callRemote('pawnshops.menu.request', currentBroker);
    mp.prompt.hide();
});
