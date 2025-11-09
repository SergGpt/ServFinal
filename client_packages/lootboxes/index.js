"use strict";

const CROWBAR_ITEM_ID = 67;
const CROWBAR_HASH = mp.game.joaat('weapon_crowbar');

mp.lootboxes = {
    cratePos: null,
    crateHealth: 0,
    lastHitTime: 0,
    hitDelay: 500,
    promptShown: false,

    isCrowbarInHands() {
        try {
            const player = mp.players.local;
            const handsItem = mp.inventory?.getHandsItem ? mp.inventory.getHandsItem(player) : null;
            if (handsItem && (handsItem.itemId === CROWBAR_ITEM_ID || handsItem.model === 'weapon_crowbar')) {
                return true;
            }

            const handsVar = player.getVariable('hands');
            if (handsVar === CROWBAR_ITEM_ID) return true;

            const currentWeapon = typeof player.weapon === 'number' ? player.weapon : parseInt(player.weapon || 0);
            return currentWeapon === CROWBAR_HASH;
        } catch (e) {
            mp.console.logInfo(`[Lootboxes] isCrowbarInHands error: ${e.message}`);
            return false;
        }
    },

    showPrompt() {
        if (this.promptShown) return;
        this.promptShown = true;
        if (!mp.prompt || !mp.prompt.showByName) return;
        if (this.isCrowbarInHands()) mp.prompt.showByName('lootbox_start_break');
        else mp.prompt.showByName('lootbox_take_crowbar');
    },

    hidePrompt() {
        if (!this.promptShown) return;
        this.promptShown = false;
        if (mp.prompt?.hide) mp.prompt.hide();
    },

    setCrate(pos, health) {
        if (pos && typeof pos.x === 'number') this.cratePos = new mp.Vector3(pos.x, pos.y, pos.z);
        else this.cratePos = pos || null;
        this.crateHealth = health || 0;
        if (pos) this.showPrompt();
        else this.hidePrompt();
    },

    updateHealth(health) {
        this.crateHealth = health || 0;
        if (this.crateHealth <= 0) this.hidePrompt();
        else if (this.cratePos) this.showPrompt();
    },

    tryHit() {
        if (!this.cratePos) return;
        if (!this.isCrowbarInHands()) {
            if (mp.notify?.error) mp.notify.error('Возьмите в руки монтировку', 'Ящики с лутом');
            return;
        }

        if (Date.now() - this.lastHitTime < this.hitDelay) return;
        this.lastHitTime = Date.now();
        mp.events.callRemote('lootboxes.crate.hit');
    },

    drawHealthBar() {
        if (!this.cratePos || this.crateHealth <= 0) return;
        try {
            const graphics = mp.game.graphics;
            const screen = graphics.world3dToScreen2d(this.cratePos);
            if (!screen) return;

            const width = 0.08;
            const height = 0.012;
            const border = 0.001;
            const x = screen.x;
            const y = screen.y - 0.05;
            const fillWidth = width * Math.max(0, Math.min(100, this.crateHealth)) / 100;

            graphics.drawRect(x, y, width + border * 2, height + border * 2, 0, 0, 0, 100);
            graphics.drawRect(x - (width - fillWidth) / 2, y, fillWidth, height, 255, 153, 51, 180);
            graphics.drawText(`${Math.round(this.crateHealth)}%`, [x, y - 0.02], {
                font: 0,
                color: [255, 255, 255, 200],
                scale: [0.25, 0.25],
                outline: false
            });
        } catch (e) {
            mp.console.logInfo(`[Lootboxes] drawHealthBar error: ${e.message}`);
        }
    }
};

mp.events.add({
    "render": () => {
        mp.lootboxes.drawHealthBar();
    },
    "playerStartMeleeCombat": () => {
        if (!mp.lootboxes.cratePos) return;
        mp.lootboxes.tryHit();
    },
    "playerWeaponChanged": () => {
        if (!mp.lootboxes.cratePos) return;
        if (!mp.prompt || !mp.prompt.showByName) return;
        if (mp.lootboxes.isCrowbarInHands()) mp.prompt.showByName('lootbox_start_break');
        else mp.prompt.showByName('lootbox_take_crowbar');
    },
    "lootboxes.crate.inside": (pos, health) => {
        if (!pos) {
            mp.lootboxes.setCrate(null, 0);
            return;
        }
        if (typeof pos === 'string') pos = JSON.parse(pos);
        mp.lootboxes.setCrate(pos, health || 0);
    },
    "lootboxes.crate.health": (health) => {
        mp.lootboxes.updateHealth(health);
    }
});
