const lootcases = call('lootcases');

module.exports = {
    init: async () => {
        lootcases.init();
        inited(__dirname);
    },
    'characterInit.done': async (player) => {
        await lootcases.onCharacterInit(player);
    },
    'playerQuit': (player) => {
        lootcases.onPlayerQuit(player);
    },
    'lootcases.menu.requestState': async (player) => {
        await lootcases.handleMenuRequest(player);
    },
    'lootcases.buy': async (player, caseId, quantity) => {
        await lootcases.buyCase(player, caseId, quantity);
    },
    'lootcases.open': async (player, caseId, quantity, requestId) => {
        await lootcases.openCases(player, caseId, quantity, requestId);
    },
    'lootcases.share': async (player, historyId) => {
        await lootcases.share(player, historyId);
    },
};
