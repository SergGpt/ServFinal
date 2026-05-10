let currentParkingId;
let blipsInfo = [];
let blips = [];

mp.events.add('parkings.menu.show', (parkingId) => {
    currentParkingId = parkingId;
    mp.callCEFV(`selectMenu.menu = cloneObj(selectMenu.menus["parkingMenu"])`);
    mp.callCEFV(`selectMenu.show = true`);
});

mp.events.add('parkings.menu.close', () => {
    mp.callCEFV(`selectMenu.show = false`);
});

mp.events.add('parkings.vehicle.get', () => {
    mp.events.callRemote('parkings.vehicle.get', currentParkingId);
});

mp.events.add('parkings.blips.init', (data) => {
    if (blipsInfo.length > 0) return;
    blipsInfo = Array.isArray(data) ? data : [];
    blipsInfo.forEach((blip) => {
        createBlip(blip);
    });
});

mp.events.add('parkings.blips.private.set', (id) => {
    let oldIndex = blips.findIndex(x => x && x.data && x.data.id == id);
    if (oldIndex == -1) return;

    let old = blips[oldIndex];
    replaceBlip(oldIndex, old, true);
});

mp.events.add('parkings.blips.private.clear', () => {
    let oldIndex = blips.findIndex(x => x && x.isPrivate && x.data);
    if (oldIndex == -1) return;

    let old = blips[oldIndex];
    replaceBlip(oldIndex, old, false);
});

function replaceBlip(oldIndex, old, isPrivate) {
    if (!old || !old.data) return;

    let blip = createBlip(old.data, isPrivate);
    blips.splice(oldIndex, 1);
    if (old && old.destroy) old.destroy();

    return blip;
}

function createBlip(data, isPrivate = false) {
    if (!data) return null;

    let options = {
        name: "Подземная парковка",
        shortRange: true
    };
    if (isPrivate) options.color = 74;

    let blip = mp.blips.new(267, new mp.Vector3(data.x, data.y, data.z), options);
    blip.data = data;
    blip.isPrivate = isPrivate;
    blips.push(blip);

    return blip;
}
