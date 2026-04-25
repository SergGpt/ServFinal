"use strict";

let sparkInterval = null;
let controlsBlocked = false;

function stopSparks() {
    if (sparkInterval == null) return;
    try {
        clearInterval(sparkInterval);
    } catch (e) {
        try {
            clearTimeout(sparkInterval);
        } catch (_) {}
    }
    sparkInterval = null;
}

mp.events.add({
    "characterInit.done": () => {
        mp.keys.bind(69, true, () => { // E
            if (mp.game.ui.isPauseMenuActive()) return;
            if (mp.players.local.vehicle) return;
            if (!mp.players.local.getVariable('insideRastDump')) return;
            mp.events.callRemote('rast.scrap.collect');
        });
    },
    "rastScrap.collect.fx.start": (durationMs = 5000) => {
        stopSparks();

        const endAt = Date.now() + durationMs;
        sparkInterval = setInterval(() => {
            if (Date.now() >= endAt) return stopSparks();

            const p = mp.players.local;
            if (!p || !p.handle) return;

            const pos = p.position;
            mp.game.streaming.requestNamedPtfxAsset("core");
            if (typeof mp.game.graphics.useParticleFxAssetNextCall === "function") {
                mp.game.graphics.useParticleFxAssetNextCall("core");
            } else if (typeof mp.game.graphics.setPtfxAssetNextCall === "function") {
                mp.game.graphics.setPtfxAssetNextCall("core");
            }
            try {
                if (typeof mp.game.graphics.startParticleFxNonLoopedOnPedBone === "function") {
                    mp.game.graphics.startParticleFxNonLoopedOnPedBone(
                        "ent_amb_elec_crackle",
                        p.handle,
                        0.05,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        57005,
                        0.6,
                        false,
                        false,
                        false
                    );
                } else {
                    mp.game.graphics.startParticleFxNonLoopedAtCoord(
                        "ent_amb_elec_crackle",
                        pos.x + 0.2,
                        pos.y + 0.15,
                        pos.z + 0.8,
                        0.0,
                        0.0,
                        0.0,
                        0.6,
                        false,
                        false,
                        false
                    );
                }
            } catch (e) {}
        }, 250);
    },
    "rastScrap.collect.fx.stop": () => {
        stopSparks();
    },
    "rastScrap.collect.controls": (state) => {
        controlsBlocked = !!state;
    }
});

mp.events.add('render', () => {
    if (!controlsBlocked) return;
    mp.game.controls.disableAllControlActions(0);
});
