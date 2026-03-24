"use strict";

const config = require('./config');

const notifications = call('notifications');
const donate = call('donate');
const money = call('money');
const chat = call('chat');

const CASES = [];
const CASES_BY_ID = new Map();
const RARITY_ORDER = new Map();

const DEFAULT_RATE_LIMIT = {
    windowMs: 1000,
    maxOpens: 5,
};

const RATE_LIMIT = Object.assign({}, DEFAULT_RATE_LIMIT, config.rateLimit || {});

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function weightedRandom(items, totalWeight = null) {
    if (!items.length) return null;
    const total = totalWeight != null ? totalWeight : items.reduce((sum, item) => sum + (item.weight || 0), 0);
    if (total <= 0) return items[0];
    let random = Math.random() * total;
    for (const item of items) {
        const weight = item.weight || 0;
        if (random < weight) return item;
        random -= weight;
    }
    return items[items.length - 1];
}

function randomInt(min, max) {
    if (min >= max) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildDisplayReward(item, rarityInfo) {
    return {
        name: item.name || rarityInfo.name,
        type: item.type,
        rarity: rarityInfo.id,
        rarityName: rarityInfo.name,
        rarityColor: rarityInfo.color,
        icon: item.icon || rarityInfo.icon || null,
    };
}

function normaliseCase(caseConfig) {
    const rarities = caseConfig.rarities.map((rarity, index) => ({
        id: rarity.id,
        name: rarity.name,
        color: rarity.color || '#FFFFFF',
        chance: rarity.chance,
        order: index,
    }));

    const totalChance = rarities.reduce((sum, rarity) => sum + rarity.chance, 0) || 1;
    rarities.forEach((rarity) => {
        rarity.weight = rarity.chance;
        rarity.probability = rarity.chance / totalChance;
        RARITY_ORDER.set(rarity.id, rarity.order);
    });

    const rarityMap = new Map(rarities.map(r => [r.id, r]));

    const pool = caseConfig.pool.map((item, index) => {
        const rarity = rarityMap.get(item.rarity);
        if (!rarity) throw new Error(`[Lootcases] Unknown rarity '${item.rarity}' for item ${item.type} in case ${caseConfig.id}`);
        const min = typeof item.amount === 'object' && item.amount?.min != null ? item.amount.min : (item.amount != null ? item.amount : (item.min || 1));
        const max = typeof item.amount === 'object' && item.amount?.max != null ? item.amount.max : (item.amount != null ? item.amount : (item.max || min));
        return {
            id: `${caseConfig.id}_${index}`,
            weight: item.weight || 1,
            rarity: rarity.id,
            rarityName: rarity.name,
            rarityColor: rarity.color,
            type: item.type,
            name: item.name || rarity.name,
            icon: item.icon || null,
            minAmount: min,
            maxAmount: max,
            uniqueKey: item.uniqueKey || null,
            metadata: item.metadata || null,
        };
    });

    const poolByRarity = new Map();
    for (const item of pool) {
        if (!poolByRarity.has(item.rarity)) poolByRarity.set(item.rarity, []);
        poolByRarity.get(item.rarity).push(item);
    }

    const preview = [];
    for (const [rarityId, items] of poolByRarity.entries()) {
        const rarity = rarityMap.get(rarityId);
        const sorted = items.slice().sort((a, b) => b.weight - a.weight).slice(0, 4);
        sorted.forEach(item => preview.push(buildDisplayReward(item, rarity)));
    }

    const pity = caseConfig.pity ? {
        threshold: parseInt(caseConfig.pity.threshold, 10) || 0,
        minRarity: caseConfig.pity.minRarity,
    } : null;

    const duplicatesPolicy = caseConfig.duplicatesPolicy ? { ...caseConfig.duplicatesPolicy } : null;

    const normalisedCase = {
        id: caseConfig.id,
        name: caseConfig.name,
        priceDon: caseConfig.priceDon,
        icon: caseConfig.icon,
        multiOpenMax: caseConfig.multiOpenMax || 10,
        rarities,
        rarityMap,
        pool,
        poolByRarity,
        pity,
        duplicatesPolicy,
        preview,
    };

    CASES.push(normalisedCase);
    CASES_BY_ID.set(caseConfig.id, normalisedCase);
}

for (const caseConfig of config.cases) {
    normaliseCase(caseConfig);
}

function ensurePlayerState(player) {
    if (!player.lootcases) {
        player.lootcases = {
            inventory: new Map(),
            pity: new Map(),
            requests: new Map(),
            rateLimit: [],
        };
    }
    return player.lootcases;
}

function getCase(caseId) {
    return CASES_BY_ID.get(caseId);
}

function rarityMeetsGuarantee(caseInfo, rarityId) {
    if (!caseInfo.pity || !caseInfo.pity.minRarity) return false;
    const minOrder = RARITY_ORDER.get(caseInfo.pity.minRarity) ?? Infinity;
    const rarityOrder = RARITY_ORDER.get(rarityId) ?? Infinity;
    return rarityOrder >= minOrder;
}

function buildTape(caseInfo, winningReward, length = 20, focusIndex = 9) {
    const tape = [];
    const rarities = caseInfo.rarities.slice();
    while (tape.length < length) {
        const rarity = weightedRandom(rarities);
        const pool = caseInfo.poolByRarity.get(rarity.id) || [];
        if (!pool.length) {
            tape.push(buildDisplayReward({ type: 'empty', name: 'Пусто', icon: caseInfo.icon }, rarity));
            continue;
        }
        const item = weightedRandom(pool);
        tape.push(buildDisplayReward(item, rarity));
    }
    if (focusIndex < 0 || focusIndex >= tape.length) focusIndex = Math.floor(tape.length / 2);
    tape[focusIndex] = buildDisplayReward(winningReward, caseInfo.rarityMap.get(winningReward.rarity));
    return { tape, focusIndex };
}

async function grantReward(player, reward, reason) {
    switch (reward.type) {
        case 'money': {
            const amount = reward.amount;
            await new Promise((resolve) => {
                money.addCash(player, amount, (success) => {
                    if (!success) {
                        notifications.error(player, `Не удалось начислить $${amount}`, 'Кейсы');
                    }
                    resolve();
                }, reason);
            });
            break;
        }
        case 'chips': {
            const chips = clamp(reward.amount, 0, 1000000);
            player.character.casinoChips = (player.character.casinoChips || 0) + chips;
            await player.character.save();
            player.call('casino.chips.changed', [player.character.casinoChips]);
            break;
        }
        case 'donate': {
            const total = (player.account.donate || 0) + reward.amount;
            donate.setDonate(player, total, reason);
            break;
        }
        default:
            notifications.error(player, `Тип награды ${reward.type} пока не поддерживается`, 'Кейсы');
            break;
    }
}

function serialiseCaseForClient(caseInfo) {
    return {
        id: caseInfo.id,
        name: caseInfo.name,
        priceDon: caseInfo.priceDon,
        icon: caseInfo.icon,
        multiOpenMax: caseInfo.multiOpenMax,
        rarities: caseInfo.rarities.map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            chance: r.chance,
            probability: r.probability,
        })),
        pity: caseInfo.pity ? { ...caseInfo.pity } : null,
        duplicatesPolicy: caseInfo.duplicatesPolicy ? { ...caseInfo.duplicatesPolicy } : null,
        preview: caseInfo.preview.slice(0, 12),
    };
}

function serialiseInventory(player) {
    const state = ensurePlayerState(player);
    const result = [];
    for (const caseInfo of CASES) {
        const entry = state.inventory.get(caseInfo.id);
        result.push({
            caseId: caseInfo.id,
            count: entry ? entry.count : 0,
        });
    }
    return result;
}

function serialiseHistoryEntry(entry) {
    return {
        id: entry.id,
        caseId: entry.caseId,
        caseName: entry.caseName,
        rewardType: entry.rewardType,
        rewardName: entry.rewardName,
        rewardIcon: entry.rewardIcon,
        rarity: entry.rarity,
        rarityName: entry.rarityName,
        rarityColor: entry.rarityColor,
        amount: entry.amount,
        duplicate: entry.duplicate,
        refund: entry.refund,
        createdAt: entry.createdAt ? entry.createdAt.getTime() : Date.now(),
    };
}

async function fetchHistory(player, limit = 20) {
    const entries = await db.Models.LootboxCaseHistory.findAll({
        where: { characterId: player.character.id },
        order: [['id', 'DESC']],
        limit,
    });
    return entries.map(serialiseHistoryEntry);
}

async function loadInventory(player) {
    const state = ensurePlayerState(player);
    state.inventory.clear();
    const rows = await db.Models.LootboxCaseInventory.findAll({ where: { characterId: player.character.id } });
    for (const row of rows) {
        state.inventory.set(row.caseId, { model: row, count: row.count });
    }
}

async function loadPity(player) {
    const state = ensurePlayerState(player);
    state.pity.clear();
    const rows = await db.Models.LootboxCasePity.findAll({ where: { characterId: player.character.id } });
    for (const row of rows) {
        state.pity.set(row.caseId, { model: row, streak: row.streak });
    }
}

function getRateBucket(player) {
    const state = ensurePlayerState(player);
    const now = Date.now();
    state.rateLimit = state.rateLimit.filter((timestamp) => now - timestamp < RATE_LIMIT.windowMs);
    return state.rateLimit;
}

function registerOperation(player) {
    const bucket = getRateBucket(player);
    bucket.push(Date.now());
}

function checkRateLimit(player) {
    const bucket = getRateBucket(player);
    return bucket.length < RATE_LIMIT.maxOpens;
}

function getInventoryEntry(player, caseId) {
    const state = ensurePlayerState(player);
    if (!state.inventory.has(caseId)) {
        state.inventory.set(caseId, { model: null, count: 0 });
    }
    return state.inventory.get(caseId);
}

async function updateInventory(player, caseId, newCount, transaction) {
    const entry = getInventoryEntry(player, caseId);
    if (!entry.model) {
        entry.model = await db.Models.LootboxCaseInventory.create({
            characterId: player.character.id,
            caseId,
            count: newCount,
        }, { transaction });
    } else {
        entry.model.count = newCount;
        await entry.model.save({ transaction });
    }
    entry.count = newCount;
}

async function getPityEntry(player, caseId, transaction) {
    const state = ensurePlayerState(player);
    if (state.pity.has(caseId)) return state.pity.get(caseId);
    const [model] = await db.Models.LootboxCasePity.findOrCreate({
        where: { characterId: player.character.id, caseId },
        defaults: { streak: 0 },
        transaction,
    });
    const entry = { model, streak: model.streak };
    state.pity.set(caseId, entry);
    return entry;
}

function makeReward(caseInfo, rarity, item) {
    const amount = randomInt(item.minAmount, item.maxAmount);
    return {
        type: item.type,
        amount,
        name: item.name,
        icon: item.icon,
        rarity: rarity.id,
        rarityName: rarity.name,
        rarityColor: rarity.color,
        uniqueKey: item.uniqueKey || null,
    };
}

async function rollReward(player, caseInfo, transaction) {
    const pityEntry = await getPityEntry(player, caseInfo.id, transaction);
    const fails = pityEntry.streak || 0;
    let forcedRarity = null;
    if (caseInfo.pity && caseInfo.pity.threshold && caseInfo.pity.minRarity) {
        if (fails + 1 >= caseInfo.pity.threshold) {
            forcedRarity = caseInfo.rarityMap.get(caseInfo.pity.minRarity);
        }
    }

    let rarity;
    if (forcedRarity) {
        rarity = forcedRarity;
    } else {
        rarity = weightedRandom(caseInfo.rarities);
    }

    const pool = caseInfo.poolByRarity.get(rarity.id) || [];
    if (!pool.length) throw new Error(`[Lootcases] No rewards for rarity ${rarity.id} in case ${caseInfo.id}`);
    const item = weightedRandom(pool);
    const reward = makeReward(caseInfo, rarity, item);
    const meets = rarityMeetsGuarantee(caseInfo, rarity.id);

    pityEntry.streak = meets ? 0 : fails + 1;
    pityEntry.model.streak = pityEntry.streak;
    await pityEntry.model.save({ transaction });

    return reward;
}

async function applyDuplicatesPolicy(player, caseInfo, reward, transaction) {
    if (!caseInfo.duplicatesPolicy || !reward.uniqueKey) return { duplicate: false, refund: 0 };

    const [, created] = await db.Models.LootboxCaseUnlock.findOrCreate({
        where: { characterId: player.character.id, uniqueKey: reward.uniqueKey },
        defaults: { caseId: caseInfo.id },
        transaction,
    });

    if (created) return { duplicate: false, refund: 0 };

    const percentageTable = caseInfo.duplicatesPolicy.percentageByRarity || {};
    const percent = percentageTable[reward.rarity] || caseInfo.duplicatesPolicy.percentage || 0;
    if (!percent) return { duplicate: true, refund: 0 };
    const refund = Math.max(0, Math.round(caseInfo.priceDon * percent / 100));
    return { duplicate: true, refund };
}

async function persistHistory(player, caseInfo, reward, duplicateInfo, transaction) {
    const history = await db.Models.LootboxCaseHistory.create({
        characterId: player.character.id,
        caseId: caseInfo.id,
        caseName: caseInfo.name,
        rewardType: reward.type,
        rewardName: reward.name,
        rewardIcon: reward.icon,
        rarity: reward.rarity,
        rarityName: reward.rarityName,
        rarityColor: reward.rarityColor,
        amount: reward.amount,
        duplicate: duplicateInfo.duplicate,
        refund: duplicateInfo.refund || 0,
    }, { transaction });
    return serialiseHistoryEntry(history);
}

async function storeRequest(player, caseInfo, requestId, response, transaction) {
    await db.Models.LootboxCaseRequest.create({
        characterId: player.character.id,
        caseId: caseInfo.id,
        requestId,
        response,
    }, { transaction });
}

async function findRequest(requestId) {
    if (!requestId) return null;
    return db.Models.LootboxCaseRequest.findOne({ where: { requestId } });
}

function summariseResults(results) {
    const raritySummary = {};
    let refund = 0;
    for (const result of results) {
        const key = result.reward.rarity;
        if (!raritySummary[key]) {
            raritySummary[key] = {
                id: key,
                name: result.reward.rarityName,
                color: result.reward.rarityColor,
                count: 0,
            };
        }
        raritySummary[key].count += 1;
        refund += result.duplicate.refund || 0;
    }
    return { raritySummary, refund };
}

module.exports = {
    init() {
        console.log(`[Lootcases] Loaded ${CASES.length} кейсов`);
    },
    async onCharacterInit(player) {
        ensurePlayerState(player);
        await Promise.all([
            loadInventory(player),
            loadPity(player),
        ]);
    },
    onPlayerQuit(player) {
        if (player && player.lootcases) delete player.lootcases;
    },
    async handleMenuRequest(player) {
        if (!player?.character || !player?.account) return;
        await Promise.all([
            loadInventory(player),
            loadPity(player),
        ]);
        const payload = {
            cases: CASES.map(serialiseCaseForClient),
            inventory: serialiseInventory(player),
            history: await fetchHistory(player),
            donate: player.account.donate,
        };
        player.call('lootcases.state', [payload]);
    },
    async sendInventory(player) {
        player.call('lootcases.inventory', [{
            inventory: serialiseInventory(player),
            donate: player.account.donate,
        }]);
    },
    async sendHistory(player) {
        player.call('lootcases.history', [{ history: await fetchHistory(player) }]);
    },
    async buyCase(player, caseId, quantity) {
        try {
            if (!player?.character || !player?.account) return;
            quantity = parseInt(quantity, 10);
            if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Некорректное количество');
            const caseInfo = getCase(caseId);
            if (!caseInfo) throw new Error('Кейс не найден');
            const totalPrice = caseInfo.priceDon * quantity;
            if ((player.account.donate || 0) < totalPrice) throw new Error('Недостаточно донат-валюты');

            await db.sequelize.transaction(async (transaction) => {
                const entry = getInventoryEntry(player, caseInfo.id);
                const newCount = entry.count + quantity;
                await updateInventory(player, caseInfo.id, newCount, transaction);

                const affected = await db.Models.Account.update({
                    donate: db.sequelize.literal(`donate - ${totalPrice}`),
                }, {
                    where: { id: player.account.id, donate: { [Op.gte]: totalPrice } },
                    transaction,
                });
                if (!affected || !affected[0]) throw new Error('Недостаточно средств');
                entry.count = newCount;
            });

            await player.account.reload();
            mp.events.call('player.donate.changed', player);
            notifications.success(player, `Вы приобрели ${quantity}x ${caseInfo.name}`, 'Кейсы');
            await this.sendInventory(player);
        } catch (e) {
            notifications.error(player, e.message || 'Не удалось купить кейс', 'Кейсы');
        }
    },
    async openCases(player, caseId, quantity, requestId) {
        try {
            if (!player?.character || !player?.account) return;
            quantity = parseInt(quantity, 10);
            if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Некорректное количество');
            const caseInfo = getCase(caseId);
            if (!caseInfo) throw new Error('Кейс не найден');
            if (quantity > caseInfo.multiOpenMax) throw new Error(`Можно открыть не более ${caseInfo.multiOpenMax}`);
            if (!checkRateLimit(player)) throw new Error('Слишком часто. Подождите немного');
            registerOperation(player);

            const existing = await findRequest(requestId);
            if (existing) {
                player.call('lootcases.open.result', [existing.response]);
                return;
            }

            const entry = getInventoryEntry(player, caseInfo.id);
            if (!entry || entry.count < quantity) throw new Error('Недостаточно кейсов');

            const results = [];
            const historyEntries = [];
            let responsePayload = null;

            await db.sequelize.transaction(async (transaction) => {
                const newCount = entry.count - quantity;
                await updateInventory(player, caseInfo.id, newCount, transaction);
                entry.count = newCount;

                for (let i = 0; i < quantity; i++) {
                    const reward = await rollReward(player, caseInfo, transaction);
                    const duplicate = await applyDuplicatesPolicy(player, caseInfo, reward, transaction);
                    const history = await persistHistory(player, caseInfo, reward, duplicate, transaction);
                    historyEntries.push(history);
                    results.push({ reward, duplicate });
                }

                const summary = summariseResults(results);
                responsePayload = {
                    caseId: caseInfo.id,
                    quantity,
                    results: results.map(({ reward, duplicate }) => ({ reward, duplicate })),
                    summary,
                    history: historyEntries,
                    inventory: serialiseInventory(player),
                    donate: player.account.donate,
                };

                if (quantity === 1) {
                    const animation = buildTape(caseInfo, results[0].reward);
                    responsePayload.animation = animation;
                }

                if (requestId) {
                    await storeRequest(player, caseInfo, requestId, responsePayload, transaction);
                }
            });

            let totalRefund = 0;
            for (const { reward, duplicate } of results) {
                if (!duplicate.duplicate) {
                    await grantReward(player, reward, `Кейс ${caseInfo.name}`);
                } else {
                    totalRefund += duplicate.refund || 0;
                }
            }

            if (totalRefund > 0) {
                const total = (player.account.donate || 0) + totalRefund;
                donate.setDonate(player, total, `Возврат за дубликаты ${caseInfo.name}`);
            }

            if (responsePayload) {
                responsePayload.donate = player.account.donate;
                player.call('lootcases.open.result', [responsePayload]);
            }

            if (quantity > 1) {
                const summary = summariseResults(results);
                notifications.success(player, `Открыто ${quantity}x ${caseInfo.name}`, 'Кейсы');
                if (summary.refund) {
                    notifications.info(player, `Возвращено ${summary.refund} TC за дубликаты`, 'Кейсы');
                }
            } else {
                const reward = results[0].reward;
                if (!results[0].duplicate.duplicate) {
                    notifications.success(player, `Вы получили ${reward.name} (${reward.rarityName})`, 'Кейсы');
                } else {
                    notifications.info(player, `Дубликат конвертирован`, 'Кейсы');
                }
            }

            await this.sendInventory(player);
            await this.sendHistory(player);
        } catch (e) {
            notifications.error(player, e.message || 'Не удалось открыть кейс', 'Кейсы');
            player.call('lootcases.error', [{ message: e.message }]);
        }
    },
    async share(player, historyId) {
        try {
            historyId = parseInt(historyId, 10);
            if (!Number.isFinite(historyId)) throw new Error('Неверный идентификатор');
            const entry = await db.Models.LootboxCaseHistory.findOne({
                where: { id: historyId, characterId: player.character.id },
            });
            if (!entry) throw new Error('Запись не найдена');

            const message = `[Кейсы] ${player.name} получил ${entry.rewardName} (${entry.rarityName}) из ${entry.caseName}!`;
            chat.broadcast(message);
        } catch (e) {
            notifications.error(player, e.message || 'Не удалось поделиться', 'Кейсы');
        }
    },
};
