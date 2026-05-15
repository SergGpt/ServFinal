"use strict";

let timer;
let notifs;

const INFECTION_BITE_ADD = 5;
const INFECTION_MAX = 100;
const INFECTION_DAMAGE_THRESHOLD = 50;
const INFECTION_DAMAGE_INTERVAL_MS = 60 * 1000;
const INFECTION_DAMAGE = 1;
const INFECTION_DEATH_REDUCTION_PERCENT = 25;

module.exports = {
    timers: {},
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
        const after = this.normalize(before + INFECTION_BITE_ADD);
        this.set(player, after, {
            notify: after > before ? `Укус зомби: заражение ${Math.round(after)}%` : null,
        });
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
