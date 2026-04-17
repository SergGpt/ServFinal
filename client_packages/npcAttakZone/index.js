"use strict";

let zoneState = null;
let previewUntil = 0;
const PREVIEW_MS = 20000;
let isInsideZone = false;

function parsePayload(value, fallback = null) {
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value == null ? fallback : value;
}

function drawPolygon(zone, color) {
    if (!zone || !Array.isArray(zone.points) || zone.points.length < 2) return;
    const c = color || [220, 45, 45, 190];
    const points = zone.points;
    const minZ = Number(zone.minZ);
    const maxZ = Number(zone.maxZ);
    const hasHeight = Number.isFinite(minZ) && Number.isFinite(maxZ);

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        mp.game.graphics.drawLine(a.x, a.y, a.z + 0.05, b.x, b.y, b.z + 0.05, c[0], c[1], c[2], c[3]);
        if (hasHeight) {
            mp.game.graphics.drawLine(a.x, a.y, minZ, a.x, a.y, maxZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, minZ, b.x, b.y, minZ, c[0], c[1], c[2], c[3]);
            mp.game.graphics.drawLine(a.x, a.y, maxZ, b.x, b.y, maxZ, c[0], c[1], c[2], c[3]);
        }

        mp.game.graphics.drawMarker(
            1,
            a.x, a.y, a.z - 1,
            0, 0, 0,
            0, 0, 0,
            0.3, 0.3, 0.3,
            255, 100, 50, 220,
            false, true, 2, false, null, null, false
        );
    }
}

function drawDebugText() {
    const text = '~r~NpcAttakZone~w~: игрок внутри зоны';
    mp.game.graphics.drawText(text, [0.5, 0.83], {
        font: 4,
        color: [255, 255, 255, 230],
        scale: [0.45, 0.45],
        outline: true,
        centre: true,
    });
}

mp.events.add({
    'npcattakzone.menu.show.request': () => {
        mp.events.callRemote('npcattakzone.menu.open');
    },

    'npcattakzone.menu.point.fromPlayer': () => {
        const p = mp.players.local.position;
        const payload = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].addPointFromPlayer(${JSON.stringify(payload)})`);
    },

    'npcattakzone.menu.show': (data) => {
        mp.callCEFV(`selectMenu.menus['npcAttakZoneEditor'].init(${JSON.stringify(data || {})})`);
        mp.callCEFV("selectMenu.showByName('npcAttakZoneEditor')");
    },

    'npcattakzone.zone.preview': (zone) => {
        zone = parsePayload(zone, null);
        if (!zone) return;
        zoneState = zone;
        previewUntil = Date.now() + PREVIEW_MS;
    },

    'npcattakzone.zone.sync': (zone) => {
        zoneState = parsePayload(zone, null);
    },

    'npcattakzone.debug.state': (inside) => {
        const nextState = !!inside;
        if (nextState !== isInsideZone) {
            isInsideZone = nextState;
            if (isInsideZone) {
                mp.notify.success('Вы вошли в NpcAttakZone', 'NpcAttakZone');
            } else {
                mp.notify.info('Вы вышли из NpcAttakZone', 'NpcAttakZone');
            }
        }
    },

    render: () => {
        if (!zoneState) return;

        if (Date.now() <= previewUntil) {
            drawPolygon(zoneState, [220, 45, 45, 185]);
        }

        if (isInsideZone) {
            drawDebugText();
        }
    },
});
