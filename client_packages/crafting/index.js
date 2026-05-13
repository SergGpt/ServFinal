"use strict";

mp.crafting = {
    inside: false,
    type: null,

    setInside(flag, type) {
        this.inside = flag;
        this.type = flag ? type : null;
        if (!flag) this.close();
    },

    open(data) {
        mp.gui.cursor.show(true, true);
        mp.busy.add('crafting', true);
        mp.callCEFR('crafting.open', [data]);
    },

    close() {
        mp.gui.cursor.show(false, false);
        mp.busy.remove('crafting');
        mp.callCEFR('crafting.close', []);
    },

    progress(durationMs) {
        mp.callCEFR('crafting.progress', [durationMs]);
    },

    done(recipeId) {
        mp.callCEFR('crafting.done', [recipeId]);
    }
};

mp.keys.bind(69, true, () => {
    if (!mp.crafting.inside) return;
    if (mp.busy.includes('crafting')) return;
    mp.events.callRemote('crafting.open');
});

mp.events.add('crafting.enter', (flag, type) => mp.crafting.setInside(flag, type));
mp.events.add('crafting.open', (data) => mp.crafting.open(data));
mp.events.add('crafting.close', () => mp.crafting.close());
mp.events.add('crafting.progress', (durationMs) => mp.crafting.progress(durationMs));
mp.events.add('crafting.done', (recipeId) => mp.crafting.done(recipeId));
