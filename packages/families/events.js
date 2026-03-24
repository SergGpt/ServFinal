let families;

function getFamilies() {
    if (!families) families = require('./index');
    return families;
}

function safeExecute(player, context, handler) {
    const fam = getFamilies();
    try {
        const result = handler(fam);
        if (result && typeof result.then === 'function') {
            result.catch((err) => fam.handleError(player, context, err));
        }
    } catch (err) {
        fam.handleError(player, context, err);
    }
}

module.exports = {
    init: () => {
        try {
            getFamilies().init();
        } catch (err) {
            console.error('[FAMILIES] init error:', err);
        }
    },
    'characterInit.done': async (player) => {
        safeExecute(player, 'characterInit.done', async (fam) => {
            await fam.loadPlayerFamily(player);
            fam.sendCreationNpc(player);
        });
    },
    playerJoin: (player) => {
        safeExecute(player, 'playerJoin', (fam) => fam.sendCreationNpc(player));
    },
    playerQuit: (player) => {
        if (player) {
            player.family = null;
            player.familyMember = null;
        }
    },
    'families.tablet.request': (player) => {
        safeExecute(player, 'families.tablet.request', (fam) => fam.openTablet(player));
    },
    'families.tablet.refresh': async (player) => {
        safeExecute(player, 'families.tablet.refresh', (fam) => fam.refreshTablet(player));
    },
    'families.creation.request': (player) => {
        safeExecute(player, 'families.creation.request', (fam) => {
            if (!player || !player.character) return;
            if (!player.getVariable('familiesCreation')) {
                fam.notify(player, 'error', 'Подойдите к стойке оформления');
                return;
            }
            fam.openCreation(player);
        });
    },
    'families.creation.create': (player, data) => {
        safeExecute(player, 'families.creation.create', (fam) => fam.createFamily(player, data));
    },
    'families.text.save': (player, fields) => {
        safeExecute(player, 'families.text.save', (fam) => fam.updateTexts(player, fields));
    },
    'families.logo.save': (player, url) => {
        safeExecute(player, 'families.logo.save', (fam) => fam.updateLogo(player, url));
    },
    'families.rank.create': (player, data) => {
        safeExecute(player, 'families.rank.create', (fam) => fam.createRank(player, data));
    },
    'families.rank.update': (player, rankId, data) => {
        safeExecute(player, 'families.rank.update', (fam) => fam.updateRank(player, rankId, data));
    },
    'families.rank.delete': (player, rankId) => {
        safeExecute(player, 'families.rank.delete', (fam) => fam.deleteRank(player, rankId));
    },
    'families.invite.send': (player, targetId) => {
        safeExecute(player, 'families.invite.send', (fam) => fam.invitePlayer(player, targetId));
    },
    'families.invite.accept': (player, inviteId) => {
        safeExecute(player, 'families.invite.accept', (fam) => fam.acceptInvite(player, inviteId));
    },
    'families.invite.decline': (player, inviteId) => {
        safeExecute(player, 'families.invite.decline', (fam) => fam.declineInvite(player, inviteId));
    },
    'families.invite.cancel': (player, inviteId) => {
        safeExecute(player, 'families.invite.cancel', (fam) => fam.cancelInvite(player, inviteId));
    },
    'families.member.kick': (player, characterId) => {
        safeExecute(player, 'families.member.kick', (fam) => fam.kickMember(player, characterId));
    },
    'families.member.rank': (player, characterId, direction, rankId) => {
        safeExecute(player, 'families.member.rank', (fam) => fam.setMemberRank(player, characterId, direction, rankId));
    },
    'families.disband': (player) => {
        safeExecute(player, 'families.disband', (fam) => fam.disbandFamily(player));
    },
};
