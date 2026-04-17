"use strict";

mp.peaceZones = {
    id: null,
};

let addPeaceZoneInfo = {
    x1: null,
    y1: null,
    z1: null,
    x2: null,
    y2: null,
    z2: null
};
let firstMarker = null;
let firstHelpMarkers = [];
let secondMarker = null;
let secondHelpMarkers = [];

let peaceZoneEditor = {
    active: false,
    points: [],
};

function parsePayload(payload, fallback = null) {
    if (payload == null) return fallback;
    if (typeof payload === 'string') {
        try {
            return JSON.parse(payload);
        } catch (e) {
            return fallback;
        }
    }
    return payload;
}

function drawEditorPoints() {
    if (!peaceZoneEditor.active || !Array.isArray(peaceZoneEditor.points) || peaceZoneEditor.points.length === 0) return;
    const color = [30, 200, 255, 220];
    for (let i = 0; i < peaceZoneEditor.points.length; i++) {
        const current = peaceZoneEditor.points[i];
        const next = peaceZoneEditor.points[(i + 1) % peaceZoneEditor.points.length];

        mp.game.graphics.drawLine(current.x, current.y, current.z + 0.1, current.x, current.y, current.z + 1.2, color[0], color[1], color[2], color[3]);
        if (peaceZoneEditor.points.length > 1 && i < peaceZoneEditor.points.length - 1) {
            mp.game.graphics.drawLine(current.x, current.y, current.z + 0.1, next.x, next.y, next.z + 0.1, color[0], color[1], color[2], color[3]);
        }
        if (peaceZoneEditor.points.length > 2 && i === peaceZoneEditor.points.length - 1) {
            const first = peaceZoneEditor.points[0];
            mp.game.graphics.drawLine(current.x, current.y, current.z + 0.1, first.x, first.y, first.z + 0.1, color[0], color[1], color[2], color[3]);
        }

        const worldPos = new mp.Vector3(current.x, current.y, current.z + 1.4);
        const screen = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
        if (!screen) continue;
        mp.game.graphics.drawText(`#${i + 1}`, [screen.x, screen.y], {
            font: 4,
            color: [255, 255, 255, 220],
            scale: [0.3, 0.3],
            outline: true
        });
    }
}

function resetLegacyZoneCreation() {
    addPeaceZoneInfo = {
        x1: null,
        y1: null,
        z1: null,
        x2: null,
        y2: null,
        z2: null
    };

    if (firstMarker != null) firstMarker.destroy();
    for (let i = 0; i < firstHelpMarkers.length; i++) {
        firstHelpMarkers[i].destroy();
    }
    if (secondMarker != null) secondMarker.destroy();
    for (let i = 0; i < secondHelpMarkers.length; i++) {
        secondHelpMarkers[i].destroy();
    }
    firstMarker = null;
    firstHelpMarkers = [];
    secondMarker = null;
    secondHelpMarkers = [];
}

mp.events.add({
    "peaceZones.inside": (id) => {
        mp.peaceZones.id = id;
    },
    "peaceZones.removed": (id) => {
        if (mp.peaceZones.id === id) {
            mp.peaceZones.id = null;
        }
    },
    "peaceZones.menu.show": () => {
        peaceZoneEditor.active = true;
        peaceZoneEditor.points = [];
        mp.callCEFV(`selectMenu.menus['peaceZoneEditor'].init({ points: [] })`);
        mp.callCEFV("selectMenu.showByName('peaceZoneEditor')");
    },
    "peaceZones.menu.saved": () => {
        peaceZoneEditor.active = false;
        peaceZoneEditor.points = [];
    },
    "peaceZones.menu.point.fromPlayer": () => {
        const p = mp.players.local.position;
        const payload = {
            x: Number(p.x.toFixed(3)),
            y: Number(p.y.toFixed(3)),
            z: Number(p.z.toFixed(3)),
        };
        mp.callCEFV(`selectMenu.menus['peaceZoneEditor'].addPointFromPlayer(${JSON.stringify(payload)})`);
    },
    "peaceZones.menu.local.sync": (pointsPayload) => {
        const points = parsePayload(pointsPayload, []);
        peaceZoneEditor.points = Array.isArray(points) ? points : [];
    },
    "render": () => {
        let canHitTree = mp.woodman.treePos && mp.woodman.isAxInHands();
        if (mp.peaceZones.id != null && !canHitTree && !mp.factions.isStateFaction(mp.players.local.getVariable('factionId'))) {
            mp.game.controls.disableControlAction(0, 24, true);
            mp.game.controls.disableControlAction(0, 25, true);
            mp.game.controls.disableControlAction(0, 140, true);
            mp.game.controls.disableControlAction(0, 257, true);

            mp.game.graphics.drawText("Ты в зоне", [0.5, 0.87], {
                font: 4,
                color: [100, 255, 100, 230],
                scale: [0.6, 0.6],
                outline: true,
                centre: true,
            });
        }
        drawEditorPoints();
    },
    "peaceZones.add": () => {
        if (addPeaceZoneInfo.x1 == null) {
            addPeaceZoneInfo.x1 = mp.players.local.position.x;
            addPeaceZoneInfo.y1 = mp.players.local.position.y;
            addPeaceZoneInfo.z1 = mp.players.local.position.z;

            let firstMarkerPos = new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z);
            firstMarker = mp.markers.new(0, firstMarkerPos, 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: mp.players.local.dimension
                });

            let firstHelpMarkersPos = [
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z + 1),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z - 1),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y + 1, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y - 1, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x + 1, mp.players.local.position.y, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x - 1, mp.players.local.position.y, mp.players.local.position.z),
            ];

            for (let i = 0; i < firstHelpMarkersPos.length; i++) {
                firstHelpMarkers.push(mp.markers.new(0, firstHelpMarkersPos[i], 1,
                    {
                        direction: new mp.Vector3(0, 0, 0),
                        rotation: new mp.Vector3(0, 0, 0),
                        color: [0, 255, 255, 255],
                        visible: true,
                        dimension: mp.players.local.dimension
                    }));
            }

            mp.notify.info("Введите команду еще раз, что бы добавить точку, где зона будет кончаться", "Создание PeaceZone");
        }
        else if (addPeaceZoneInfo.x2 == null) {
            addPeaceZoneInfo.x2 = mp.players.local.position.x;
            addPeaceZoneInfo.y2 = mp.players.local.position.y;
            addPeaceZoneInfo.z2 = mp.players.local.position.z;

            let secondMarkerPos = new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z);
            secondMarker = mp.markers.new(0, secondMarkerPos, 1,
                {
                    direction: new mp.Vector3(0, 0, 0),
                    rotation: new mp.Vector3(0, 0, 0),
                    color: [0, 255, 0, 255],
                    visible: true,
                    dimension: mp.players.local.dimension
                });

            let secondHelpMarkersPos = [
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z + 1),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z - 1),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y + 1, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x, mp.players.local.position.y - 1, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x + 1, mp.players.local.position.y, mp.players.local.position.z),
                new mp.Vector3(mp.players.local.position.x - 1, mp.players.local.position.y, mp.players.local.position.z),
            ];

            for (let i = 0; i < secondHelpMarkersPos.length; i++) {
                secondHelpMarkers.push(mp.markers.new(0, secondHelpMarkersPos[i], 1,
                    {
                        direction: new mp.Vector3(0, 0, 0),
                        rotation: new mp.Vector3(0, 0, 0),
                        color: [0, 255, 255, 255],
                        visible: true,
                        dimension: mp.players.local.dimension
                    }));
            }

            mp.notify.info("Введите команду еще раз, что бы закончить создание зеленой зоны", "Создание PeaceZone");
        }
        else {
            mp.events.callRemote("peaceZones.add", JSON.stringify({
                x: Math.min(addPeaceZoneInfo.x1, addPeaceZoneInfo.x2),
                y: Math.min(addPeaceZoneInfo.y1, addPeaceZoneInfo.y2),
                z: Math.min(addPeaceZoneInfo.z1, addPeaceZoneInfo.z2),
                dx: Math.max(addPeaceZoneInfo.x1, addPeaceZoneInfo.x2) - Math.min(addPeaceZoneInfo.x1, addPeaceZoneInfo.x2),
                dy: Math.max(addPeaceZoneInfo.y1, addPeaceZoneInfo.y2) - Math.min(addPeaceZoneInfo.y1, addPeaceZoneInfo.y2),
                dz: Math.max(addPeaceZoneInfo.z1, addPeaceZoneInfo.z2) - Math.min(addPeaceZoneInfo.z1, addPeaceZoneInfo.z2)
            }));
            mp.notify.info("Зеленая зона создана", "Создание PeaceZone");
            resetLegacyZoneCreation();
        }

    },
    "peaceZones.addClose": () => {
        resetLegacyZoneCreation();

        mp.notify.info("Создание зеленой зоны отменено", "Создание PeaceZone");
    },
    "peaceZones.remove": () => {
        mp.events.callRemote("peaceZones.remove", JSON.stringify(mp.peaceZones.id));
    },
});
