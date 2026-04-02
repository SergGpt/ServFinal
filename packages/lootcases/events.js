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
    'lootcases.admin.editor.state.request': async (player) => {
        if (!player.character || player.character.admin < 5) return;
        await lootcases.getAdminEditorData(player);
    },
    'lootcases.admin.editor.reward.add': async (player, payloadRaw) => {
        if (!player.character || player.character.admin < 5) return;
        const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
        try {
            await lootcases.addAdminReward(player, payload);
            await lootcases.getAdminEditorData(player);
        } catch (e) {
            player.call('lootcases.error', [{ message: e.message }]);
        }
    },
    'lootcases.admin.editor.reward.remove': async (player, id) => {
        if (!player.character || player.character.admin < 5) return;
        await lootcases.removeAdminReward(parseInt(id, 10));
        await lootcases.getAdminEditorData(player);
    },
};
