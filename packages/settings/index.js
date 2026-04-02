"use strict";

let mood = call('mood');
let walking = call('walking');

module.exports = {
    // Кол-во походок
    walkingCount: 7,
    // Кол-во эмоций
    moodCount: 7,

    apply(player, modified = null) {
        if (!modified) return;

        if (modified.walking != null) walking.set(player, modified.walking);
        if (modified.mood != null) mood.set(player, modified.mood);
    }
};
