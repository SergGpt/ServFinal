"use strict";

let sparkInterval = null;
let attachmentRegistered = false;

function registerGrinderAttachment() {
    if (attachmentRegistered || !mp.attachmentMngr) return;
    mp.attachmentMngr.register(
        "rastGrinder",
        "sf_prop_grinder_01a",
        57005,
        new mp.Vector3(0.12, 0.02, 0.0),
        new mp.Vector3(90, 0, 0),
        0,
        true
    );
    attachmentRegistered = true;
}

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
        registerGrinderAttachment();
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
            mp.game.graphics.startParticleFxNonLoopedAtCoord(
                "ent_amb_sparking_wires",
                pos.x + 0.2,
                pos.y + 0.15,
                pos.z + 0.8,
                0.0,
                0.0,
                0.0,
                0.5,
                false,
                false,
                false
            );
        }, 250);
    },
    "rastScrap.collect.fx.stop": () => {
        stopSparks();
    }
});
