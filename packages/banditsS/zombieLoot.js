const { ZOMBIE_CONFIG } = require('./zombie.config');
const { createLogger, dist3 } = require('./zombie.utils');

const zlog = createLogger(ZOMBIE_CONFIG.debug, 'ZLOOT');

const BAG_MODEL = ZOMBIE_CONFIG.loot && ZOMBIE_CONFIG.loot.bagModel ? ZOMBIE_CONFIG.loot.bagModel : 'prop_cs_heist_bag_01';
const INTERACT_DISTANCE = ZOMBIE_CONFIG.loot && ZOMBIE_CONFIG.loot.interactDistance ? ZOMBIE_CONFIG.loot.interactDistance : 2.2;
const CANCEL_DISTANCE = ZOMBIE_CONFIG.loot && ZOMBIE_CONFIG.loot.cancelDistance ? ZOMBIE_CONFIG.loot.cancelDistance : 3.5;
const LOOT_DURATION_MS = 3000;
const BAG_LIFETIME_MS = ZOMBIE_CONFIG.timers && ZOMBIE_CONFIG.timers.lootBagLifetimeMs ? ZOMBIE_CONFIG.timers.lootBagLifetimeMs : 5 * 60 * 1000;
const BAG_GROUND_OFFSET_Z = 0.05;
const ZOMBIE_LOOT_ITEM_IDS = (ZOMBIE_CONFIG.loot && Array.isArray(ZOMBIE_CONFIG.loot.itemIds) && ZOMBIE_CONFIG.loot.itemIds.length)
    ? ZOMBIE_CONFIG.loot.itemIds
    : [234, 235, 237, 238, 239, 240, 241, 242, 243, 244];


function createZombieLootManager() {
    const lootBags = new Map(); // id -> state
    const lootsByZombieId = new Map(); // zid -> lootId
    let nextLootId = 1;
    let inventoryRef = null;
    let notifsRef = null;

    function getInventory() {
        if (inventoryRef) return inventoryRef;
        try { inventoryRef = call('inventory'); } catch {}
        return inventoryRef;
    }

    function getNotifs() {
        if (notifsRef) return notifsRef;
        try { notifsRef = call('notifications'); } catch {}
        return notifsRef;
    }

    function notifyError(player, text) {
        if (!player || !mp.players.exists(player)) return;
        const notifs = getNotifs();
        if (notifs && typeof notifs.error === 'function') {
            notifs.error(player, text, 'Лут');
            return;
        }
        try { player.outputChatBox(`!{#ff6666}[Лут] ${text}`); } catch {}
    }


    function pickRandomItemId() {
        return ZOMBIE_LOOT_ITEM_IDS[(Math.random() * ZOMBIE_LOOT_ITEM_IDS.length) | 0];
    }

    function toClientData(loot) {
        if (!loot || !loot.object || !mp.objects.exists(loot.object)) return null;
        return {
            id: loot.id,
            dimension: loot.dimension,
            objectId: loot.object.id,
            model: BAG_MODEL,
        };
    }

    function emitCreateForAll(loot) {
        const data = toClientData(loot);
        if (!data) return;
        mp.players.forEach((player) => {
            try { player.call('zloot:create', [data]); } catch {}
        });
    }

    function emitRemoveForAll(lootId) {
        mp.players.forEach((player) => {
            try { player.call('zloot:remove', [lootId]); } catch {}
        });
    }

    function cleanupLoot(loot, reason = 'unknown') {
        if (!loot) return;
        try {
            if (loot.object && mp.objects.exists(loot.object)) loot.object.destroy();
        } catch {}

        lootsByZombieId.delete(loot.zombieId);
        lootBags.delete(loot.id);

        emitRemoveForAll(loot.id);
        zlog(`loot remove lootId=${loot.id} reason=${reason}`);
    }

    function cancelLooting(loot, reason = 'cancel', silent = false) {
        if (!loot || !loot.isBusy) return;

        const looterId = loot.looterId;
        loot.isBusy = false;
        loot.looterId = null;
        loot.lootStartedAt = 0;

        const looter = typeof looterId === 'number' ? mp.players.at(looterId) : null;
        if (looter && mp.players.exists(looter)) {
            try { looter.call('zloot:cancel', [loot.id, reason]); } catch {}
            if (!silent) notifyError(looter, 'Обыск сумки отменен.');
        }

        zlog(`cancel bag id=${loot.id} reason=${reason}`);
    }

    function createLootBag(zombieId, pos, dimension = 0) {
        if (!pos) return null;

        const existingLootId = lootsByZombieId.get(zombieId);
        if (existingLootId) {
            const existing = lootBags.get(existingLootId);
            if (existing) return existing;
        }

        const lootId = nextLootId++;
        const safeGroundZ = Number(pos.z) + BAG_GROUND_OFFSET_Z;
        const objectPos = new mp.Vector3(pos.x, pos.y, safeGroundZ);
        let object = null;

        try {
            object = mp.objects.new(mp.joaat(BAG_MODEL), objectPos, {
                dimension,
            });
        } catch (e) {
            zlog(`create-fail zid=${zombieId} lootId=${lootId} reason=${e.message}`);
            return null;
        }

        if (!object || !mp.objects.exists(object)) {
            zlog(`create-fail zid=${zombieId} lootId=${lootId} reason=object-not-created`);
            return null;
        }

        let varsOk = true;
        try { object.setVariable('zLootBagId', lootId); } catch { varsOk = false; }
        try { object.setVariable('lootId', lootId); } catch { varsOk = false; }
        try { object.setVariable('isZombieLootBag', true); } catch { varsOk = false; }
        try { object.setVariable('zombieId', zombieId); } catch { varsOk = false; }

        const finalPos = object && object.position ? object.position : objectPos;

        const loot = {
            id: lootId,
            zombieId,
            object,
            dimension,
            isLooted: false,
            isBusy: false,
            looterId: null,
            createdAt: Date.now(),
            lootStartedAt: 0,
        };

        lootBags.set(lootId, loot);
        lootsByZombieId.set(zombieId, lootId);

        emitCreateForAll(loot);
        zlog(`loot create lootId=${loot.id} obj=${object.id} pos=${finalPos.x.toFixed(2)},${finalPos.y.toFixed(2)},${finalPos.z.toFixed(2)} dim=${dimension} vars=${varsOk ? 'ok' : 'fail'}`);

        return loot;
    }

    function getLootObjectPos(loot) {
        if (!loot) return null;
        try {
            if (loot.object && mp.objects.exists(loot.object) && loot.object.position) {
                const p = loot.object.position;
                return { x: p.x, y: p.y, z: p.z };
            }
        } catch {}
        return null;
    }

    function isPlayerAlive(player) {
        if (!player || !mp.players.exists(player)) return false;
        const hp = Number(player.health) || 0;
        return hp > 0;
    }

    function tryStartLoot(player, lootIdRaw) {
        const lootId = parseInt(lootIdRaw, 10);
        if (!player || !mp.players.exists(player) || !Number.isFinite(lootId)) return;

        const loot = lootBags.get(lootId);
        if (!loot) return;
        if (loot.isLooted) return;
        if (loot.isBusy) {
            notifyError(player, 'Эту сумку уже обыскивают.');
            return;
        }

        if (!isPlayerAlive(player)) {
            notifyError(player, 'Нельзя обыскивать сумку в таком состоянии.');
            return;
        }

        if (player.dimension !== loot.dimension) return;

        const lootPos = getLootObjectPos(loot);
        if (!lootPos) return;

        const distance = dist3(player.position, lootPos);
        if (distance > INTERACT_DISTANCE) {
            zlog(`loot tryStart lootId=${loot.id} dist=${distance.toFixed(2)} rejected=too-far`);
            notifyError(player, 'Подойдите ближе к сумке.');
            return;
        }

        zlog(`loot tryStart lootId=${loot.id} dist=${distance.toFixed(2)} ok`);

        loot.isBusy = true;
        loot.looterId = player.id;
        loot.lootStartedAt = Date.now();

        try { player.call('zloot:start', [loot.id, LOOT_DURATION_MS]); } catch {}
        zlog(`start bag id=${loot.id} by=${player.id}`);
    }

    function finishLoot(player, lootIdRaw) {
        const lootId = parseInt(lootIdRaw, 10);
        if (!player || !mp.players.exists(player) || !Number.isFinite(lootId)) return;

        const loot = lootBags.get(lootId);
        if (!loot || loot.isLooted || !loot.isBusy) return;
        if (loot.looterId !== player.id) return;

        if (!isPlayerAlive(player)) {
            cancelLooting(loot, 'dead', true);
            return;
        }

        if (player.dimension !== loot.dimension) {
            cancelLooting(loot, 'dimension-change', true);
            return;
        }

        const lootPos = getLootObjectPos(loot);
        if (!lootPos) {
            return;
        }

        const distance = dist3(player.position, lootPos);
        if (distance > CANCEL_DISTANCE) {
            cancelLooting(loot, 'too-far', true);
            return;
        }

        if (Date.now() - loot.lootStartedAt < LOOT_DURATION_MS - 150) {
            cancelLooting(loot, 'too-early', true);
            return;
        }

        const itemId = pickRandomItemId();
        const inventory = getInventory();
        if (!inventory || typeof inventory.cantAdd !== 'function' || typeof inventory.addItem !== 'function') {
            notifyError(player, 'Система инвентаря недоступна.');
            cancelLooting(loot, 'inventory-unavailable', true);
            return;
        }

        const cantAdd = inventory.cantAdd(player, itemId, {});
        if (cantAdd) {
            notifyError(player, cantAdd);
            cancelLooting(loot, 'inventory-full', true);
            return;
        }

        inventory.addItem(player, itemId, {}, (e) => {
            if (e) {
                notifyError(player, e);
                cancelLooting(loot, 'inventory-add-failed', true);
                return;
            }

            loot.isLooted = true;
            loot.isBusy = false;
            loot.looterId = null;
            loot.lootStartedAt = 0;
            try { player.call('zloot:success', [loot.id, itemId]); } catch {}
            cleanupLoot(loot, `looted-by-${player.id}`);
        });
    }

    function cancelByPlayer(player, reason = 'player-cancel') {
        if (!player || !mp.players.exists(player)) return;

        lootBags.forEach((loot) => {
            if (!loot || !loot.isBusy || loot.looterId !== player.id) return;
            cancelLooting(loot, reason, true);
        });
    }

    function removeLootByZombie(zid, reason = 'zombie-removed') {
        const lootId = lootsByZombieId.get(zid);
        if (!lootId) return;
        const loot = lootBags.get(lootId);
        if (!loot) return;
        cleanupLoot(loot, reason);
    }

    function syncLootsForPlayer(player) {
        if (!player || !mp.players.exists(player)) return;
        try { player.call('zloot:reset'); } catch {}
        lootBags.forEach((loot) => {
            const data = toClientData(loot);
            if (!data) return;
            try { player.call('zloot:create', [data]); } catch {}
        });
    }

    function registerEvents() {
        mp.events.add('zloot:tryStart', (player, lootId) => {
            try { tryStartLoot(player, lootId); } catch {}
        });

        mp.events.add('zloot:finish', (player, lootId) => {
            try { finishLoot(player, lootId); } catch {}
        });

        mp.events.add('zloot:cancel', (player, lootId, reasonRaw) => {
            try {
                const reason = typeof reasonRaw === 'string' ? reasonRaw : 'client-cancel';
                const loot = lootBags.get(parseInt(lootId, 10));
                if (!loot || !loot.isBusy || loot.looterId !== player.id) return;
                cancelLooting(loot, reason, true);
            } catch {}
        });

        mp.events.add('playerQuit', (player) => {
            try { cancelByPlayer(player, 'player-quit'); } catch {}
        });

        mp.events.add('playerDeath', (player) => {
            try { cancelByPlayer(player, 'player-dead'); } catch {}
        });

        mp.events.add('playerJoin', (player) => {
            setTimeout(() => {
                try { syncLootsForPlayer(player); } catch {}
            }, 1500);
        });
    }

    function registerLoops() {
        setInterval(() => {
            const now = Date.now();
            lootBags.forEach((loot) => {
                if (!loot || loot.isLooted) return;

                if (loot.isBusy) {
                    const looter = mp.players.at(loot.looterId);
                    if (!looter || !mp.players.exists(looter)) {
                        cancelLooting(loot, 'looter-missing', true);
                        return;
                    }

                    if (!isPlayerAlive(looter)) {
                        cancelLooting(loot, 'looter-dead', true);
                        return;
                    }

                    if (looter.dimension !== loot.dimension) {
                        cancelLooting(loot, 'dimension-change', true);
                        return;
                    }

                    const lootPos = getLootObjectPos(loot);
                    if (!lootPos) {
                        cancelLooting(loot, 'no-loot-world-pos', true);
                        return;
                    }

                    const distance = dist3(looter.position, lootPos);
                    if (distance > CANCEL_DISTANCE) {
                        cancelLooting(loot, 'looter-too-far', true);
                    }
                    return;
                }

                if (now - loot.createdAt >= BAG_LIFETIME_MS) {
                    cleanupLoot(loot, 'lifetime-expired');
                }
            });
        }, 500);
    }

    return {
        createLootBag,
        removeLootByZombie,
        registerEvents,
        registerLoops,
    };
}

module.exports = {
    createZombieLootManager,
    ZOMBIE_LOOT_ITEM_IDS,
};
