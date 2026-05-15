"use strict";

let timer;
let notifs;

const INFECTION_BITE_ADD = 5;
const INFECTION_MAX = 100;
const INFECTION_DAMAGE_THRESHOLD = 50;
const INFECTION_DAMAGE_INTERVAL_MS = 60 * 1000;
const INFECTION_DAMAGE = 1;
const INFECTION_DEATH_REDUCTION_PERCENT = 25;
const INFECTION_ZONE_ADD = 1;
const INFECTION_ZONE_INTERVAL_MS = 5 * 1000;
const GAS_MASK_IDS = [166, 142, 130, 46, 38, 36];

module.exports = {
    timers: {},
    zoneTimers: {},
    tableName: null,

    async init() {
        timer = call('timer');
        notifs = call('notifications');
        await this.ensureCharacterColumn();
        inited(__dirname);
    },

    async ensureCharacterColumn() {
        try {
            const characterModel = db.Models && db.Models.Character;
            this.tableName = characterModel && typeof characterModel.getTableName === 'function'
                ? characterModel.getTableName()
                : 'Characters';
            const tableName = typeof this.tableName === 'object' ? this.tableName.tableName : this.tableName;
            const [rows] = await db.sequelize.query(`SHOW COLUMNS FROM \`${tableName}\``);
            const cols = new Set((rows || []).map((row) => String(row.Field || '')));
            if (!cols.has('infection')) {
                await db.sequelize.query(`ALTER TABLE \`${tableName}\` ADD COLUMN infection FLOAT NOT NULL DEFAULT 0`);
            }
        } catch (error) {
            console.error(`[INFECTION] schema ensure failed: ${error.message}`);
        }
    },

    normalize(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.clamp(num, 0, INFECTION_MAX);
    },

    get(player) {
        if (!player || !player.character) return 0;
        return this.normalize(player.character.infection);
    },

    async set(player, value, options = {}) {
        if (!player || !player.character) return 0;
        const infection = this.normalize(value);
        player.character.infection = infection;
        try { await player.character.save(); } catch (error) { console.error(`[INFECTION] save failed: ${error.message}`); }
        this.sync(player);

        if (options.notify && notifs && typeof notifs.warning === 'function') {
            notifs.warning(player, options.notify, 'Заражение');
        }

        return infection;
    },

    sync(player) {
        if (!player || !player.character) return;
        const infection = this.get(player);
        try { player.call('hud.setData', [{ infection }]); } catch {}
        try { player.call('infection.update', [infection]); } catch {}
    },

    addBite(player) {
        if (!player || !player.character || player.godmode) return;
        const before = this.get(player);
        const expected = this.normalize(before + INFECTION_BITE_ADD);
        const after = this.add(player, INFECTION_BITE_ADD, {
            notify: expected > before ? `Укус зомби: заражение ${Math.round(expected)}%` : null,
        });
        if (after > before) {
            try { player.call('infection.symptom', ['bite', after]); } catch {}
        }
    },

    add(player, amount, options = {}) {
        if (!player || !player.character || player.godmode) return 0;
        const before = this.get(player);
        const after = this.normalize(before + (Number(amount) || 0));
        if (after <= before) return before;

        const notify = options.notify || null;
        this.set(player, after, { notify });
        return after;
    },

    hasGasMask(player) {
        try {
            if (!player || !player.inventory || !Array.isArray(player.inventory.items)) return false;
            return player.inventory.items.some((item) => {
                if (!item || item.parentId != null) return false;
                if (GAS_MASK_IDS.includes(Number(item.itemId))) return true;
                if (item.itemId !== 14) return false;
                const params = item.params ? this.getParamsValuesSafe(item) : {};
                return GAS_MASK_IDS.includes(Number(params.variation));
            });
        } catch {}
        return false;
    },

    getParamsValuesSafe(item) {
        const params = {};
        if (!item || !Array.isArray(item.params)) return params;
        item.params.forEach((param) => {
            if (!param) return;
            params[param.key] = param.value;
        });
        return params;
    },

    applyZoneExposure(player, zoneName = 'заражённая зона') {
        if (!player || !player.character) return;
        if (this.hasGasMask(player)) return;
        const before = this.get(player);
        const next = this.add(player, INFECTION_ZONE_ADD);
        if (next > before) {
            try { player.call('infection.symptom', ['zone', next]); } catch {}
        }
        if (next > 0 && Math.round(next) % 10 === 0 && notifs && typeof notifs.warning === 'function') {
            notifs.warning(player, `Нет противогаза: заражение ${Math.round(next)}%`, 'Заражённая зона');
        }
    },

    startZoneExposure(player, isInZoneFn) {
        if (!player || !player.character) return;
        const playerId = player.id;
        const characterId = player.character.id;
        this.stopZoneExposure(player);

        this.zoneTimers[playerId] = timer.addInterval(() => {
            try {
                const rec = mp.players.at(playerId);
                if (!rec || !rec.character || rec.character.id !== characterId) {
                    timer.remove(this.zoneTimers[playerId]);
                    delete this.zoneTimers[playerId];
                    return;
                }
                if (typeof isInZoneFn === 'function' && !isInZoneFn(rec)) return;
                this.applyZoneExposure(rec);
            } catch (error) {
                console.error(`[INFECTION] zone exposure failed: ${error.message}`);
            }
        }, INFECTION_ZONE_INTERVAL_MS);
    },

    stopZoneExposure(player) {
        if (!player) return;
        timer.remove(this.zoneTimers[player.id]);
        delete this.zoneTimers[player.id];
    },

    startTimer(player) {
        if (!player || !player.character) return;
        const playerId = player.id;
        const characterId = player.character.id;
        this.stopTimer(player);

        this.timers[playerId] = timer.addInterval(() => {
            try {
                const rec = mp.players.at(playerId);
                if (!rec || !rec.character || rec.character.id !== characterId) {
                    timer.remove(this.timers[playerId]);
                    delete this.timers[playerId];
                    return;
                }
                this.processDamage(rec);
            } catch (error) {
                console.error(`[INFECTION] timer failed: ${error.message}`);
            }
        }, INFECTION_DAMAGE_INTERVAL_MS);
    },

    stopTimer(player) {
        if (!player) return;
        timer.remove(this.timers[player.id]);
        delete this.timers[player.id];
        this.stopZoneExposure(player);
    },

    processDamage(player) {
        const infection = this.get(player);
        if (infection < INFECTION_DAMAGE_THRESHOLD) return;
        if (player.godmode || player.getVariable('knocked')) return;

        const currentHealth = Number(player.health) || 0;
        const nextHealth = Math.max(0, currentHealth - INFECTION_DAMAGE);
        player.health = nextHealth;
        try { player.call('infection.symptom', ['damage', infection]); } catch {}
        if (nextHealth <= 0 && notifs && typeof notifs.warning === 'function') {
            notifs.warning(player, 'Вы умерли от заражения.', 'Заражение');
        }
    },

    reduceAfterDeath(player) {
        if (!player || !player.character) return;
        const infection = this.get(player);
        if (infection <= 0) return;
        const next = this.normalize(infection * (1 - (INFECTION_DEATH_REDUCTION_PERCENT / 100)));
        this.set(player, next);
    },
};
