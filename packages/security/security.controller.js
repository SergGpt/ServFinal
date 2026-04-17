const { SECURITY_CONFIG } = require('./security.config');
const { SECURITY_STATE, setSecurityState } = require('./security.state');

const zones = new Map();
const npcs = new Map();
const editorDraftByPlayerId = new Map();

let nextNpcId = 1;
let initialized = false;

function log(message) {
    console.log(`[SECURITY] ${message}`);
}

function getDbModel() {
    try {
        if (global.db && global.db.Models) return global.db.Models.SecurityZone;
    } catch {}
    return null;
}

function randomFrom(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[(Math.random() * arr.length) | 0];
}

function distance2d(a, b) {
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    return Math.sqrt(dx * dx + dy * dy);
}

function getDefaultDraft(player) {
    return {
        zoneId: null,
        name: `Security Zone ${Date.now()}`,
        radius: SECURITY_CONFIG.defaultRadius,
        guardCount: SECURITY_CONFIG.stage1Preset.guardCount,
        chiefCount: SECURITY_CONFIG.stage1Preset.chiefCount,
        dimension: Number(player.dimension) || 0,
    };
}

function notify(player, text, type = 'info') {
    if (!player || !mp.players.exists(player)) return;
    try {
        if (type === 'error') player.outputChatBox(`!{#ff6666}[SECURITY] ${text}`);
        else player.outputChatBox(`!{#66ff66}[SECURITY] ${text}`);
    } catch {}
}

function syncEditor(player) {
    if (!player || !mp.players.exists(player)) return;

    const draft = editorDraftByPlayerId.get(player.id) || getDefaultDraft(player);
    editorDraftByPlayerId.set(player.id, draft);

    player.call('security:editor:sync', [JSON.stringify(draft)]);
}

function toRuntimeZone(rawZone) {
    const row = rawZone && typeof rawZone.get === 'function' ? rawZone.get({ plain: true }) : rawZone;
    return {
        id: Number(row.id),
        name: row.name || `Security Zone #${row.id}`,
        x: Number(row.x) || 0,
        y: Number(row.y) || 0,
        z: Number(row.z) || 0,
        dimension: Number(row.dimension) || 0,
        radius: Number(row.radius) || SECURITY_CONFIG.defaultRadius,
        guardCount: Number(row.guardCount) || SECURITY_CONFIG.stage1Preset.guardCount,
        chiefCount: Number(row.chiefCount) || SECURITY_CONFIG.stage1Preset.chiefCount,
        npcIds: [],
    };
}

async function loadZones() {
    const Model = getDbModel();
    if (!Model) {
        log('SecurityZone model not found in db.Models');
        return;
    }

    const rows = await Model.findAll().catch((error) => {
        log(`loadZones error: ${error.message}`);
        return [];
    });

    rows.forEach((row) => {
        const zone = toRuntimeZone(row);
        zones.set(zone.id, zone);
    });

    log(`loaded zones from DB: ${rows.length}`);
}

function destroyNpc(npcId) {
    const npcState = npcs.get(npcId);
    if (!npcState) return;

    try {
        if (npcState.ped && mp.peds.exists(npcState.ped)) {
            npcState.ped.destroy();
        }
    } catch {}

    npcs.delete(npcId);
}

function destroyZoneNpcs(zone) {
    if (!zone || !Array.isArray(zone.npcIds)) return;

    [...zone.npcIds].forEach((npcId) => destroyNpc(npcId));
    zone.npcIds = [];
}

function createNpcForZone(zone, role) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 4 + Math.random() * Math.max(3, Math.min(zone.radius - 3, 15));

    const pos = new mp.Vector3(
        zone.x + Math.cos(angle) * distance,
        zone.y + Math.sin(angle) * distance,
        zone.z,
    );

    const model = role === 'chief'
        ? randomFrom(SECURITY_CONFIG.models.chief)
        : randomFrom(SECURITY_CONFIG.models.guard);
    const weapon = role === 'chief'
        ? SECURITY_CONFIG.weapons.chief
        : SECURITY_CONFIG.weapons.guard;

    const ped = mp.peds.new(mp.joaat(model || 's_m_m_security_01'), pos, {
        dynamic: true,
        invincible: false,
    });

    ped.dimension = zone.dimension;

    const npcId = nextNpcId++;

    ped.setVariable('secZoneId', zone.id);
    ped.setVariable('secRole', role);
    ped.setVariable('secNpcId', npcId);
    ped.setVariable('secState', SECURITY_STATE.IDLE);
    ped.setVariable('secControllerRid', -1);

    try {
        ped.giveWeapon(mp.joaat(weapon), 9999);
        ped.setWeapon(mp.joaat(weapon));
    } catch {}

    try {
        ped.setHealth(SECURITY_CONFIG.npcHealth);
        ped.health = SECURITY_CONFIG.npcHealth;
    } catch {}

    try {
        ped.setBlockingOfNonTemporaryEvents(true);
        ped.setKeepTask(true);
        ped.taskStandStill(10 * 60 * 1000);
    } catch {}

    const npcState = {
        npcId,
        zoneId: zone.id,
        role,
        ped,
        state: SECURITY_STATE.IDLE,
        controllerRid: null,
        controllerVer: 0,
        task: {
            type: 'idle',
            data: null,
            updatedAt: Date.now(),
        },
    };

    setSecurityState(npcState, SECURITY_STATE.IDLE);
    npcs.set(npcId, npcState);
    zone.npcIds.push(npcId);

    return npcState;
}

function spawnStage1Preset(zone) {
    if (!zone) return;

    destroyZoneNpcs(zone);

    const guardCount = SECURITY_CONFIG.stage1Preset.guardCount;
    const chiefCount = SECURITY_CONFIG.stage1Preset.chiefCount;

    for (let i = 0; i < guardCount; i += 1) {
        createNpcForZone(zone, 'guard');
    }

    for (let i = 0; i < chiefCount; i += 1) {
        createNpcForZone(zone, 'chief');
    }
}

function createZoneFromPlayerPosition(player, draft) {
    if (!player || !mp.players.exists(player)) return null;

    const maxZoneId = zones.size ? Math.max(...Array.from(zones.keys())) : 0;

    const zone = {
        id: maxZoneId + 1,
        name: String(draft.name || '').trim() || `Security Zone ${Date.now()}`,
        x: Number(player.position.x),
        y: Number(player.position.y),
        z: Number(player.position.z),
        dimension: Number(player.dimension) || 0,
        radius: Math.max(10, Number(draft.radius) || SECURITY_CONFIG.defaultRadius),
        guardCount: Math.max(0, parseInt(draft.guardCount, 10) || SECURITY_CONFIG.stage1Preset.guardCount),
        chiefCount: Math.max(0, parseInt(draft.chiefCount, 10) || SECURITY_CONFIG.stage1Preset.chiefCount),
        npcIds: [],
    };

    zones.set(zone.id, zone);

    return zone;
}

async function saveZoneToDb(zone) {
    const Model = getDbModel();
    if (!Model) throw new Error('SecurityZone model unavailable in db.Models');

    const payload = {
        name: zone.name,
        x: zone.x,
        y: zone.y,
        z: zone.z,
        dimension: zone.dimension,
        radius: zone.radius,
        guardCount: zone.guardCount,
        chiefCount: zone.chiefCount,
    };

    if (!zone.dbId) {
        const row = await Model.create(payload);
        zone.dbId = Number(row.id);
        zone.id = Number(row.id);
        zones.set(zone.id, zone);
        return;
    }

    await Model.update(payload, {
        where: { id: zone.dbId },
    });
}

function findNearestZone(player) {
    let nearest = null;
    let nearestDistance = Number.MAX_VALUE;

    zones.forEach((zone) => {
        if (zone.dimension !== Number(player.dimension || 0)) return;

        const d = distance2d(player.position, zone);
        if (d < nearestDistance) {
            nearest = zone;
            nearestDistance = d;
        }
    });

    return nearest;
}

function registerEvents() {
    mp.events.add('security:editor:open', (player) => {
        if (!player || !mp.players.exists(player)) return;
        editorDraftByPlayerId.set(player.id, getDefaultDraft(player));
        player.call('security:editor:open');
        syncEditor(player);
    });

    mp.events.add('playerQuit', (player) => {
        editorDraftByPlayerId.delete(player.id);
    });

    mp.events.add('security:editor:setField', (player, fieldName, valueRaw) => {
        if (!player || !mp.players.exists(player)) return;

        const draft = editorDraftByPlayerId.get(player.id) || getDefaultDraft(player);
        const value = typeof valueRaw === 'string' ? valueRaw.trim() : valueRaw;

        if (fieldName === 'name') {
            draft.name = String(value || '').slice(0, 64);
        } else if (fieldName === 'radius') {
            draft.radius = Math.max(10, Math.min(300, Number(value) || SECURITY_CONFIG.defaultRadius));
        } else if (fieldName === 'guardCount') {
            draft.guardCount = Math.max(0, Math.min(10, parseInt(value, 10) || SECURITY_CONFIG.stage1Preset.guardCount));
        } else if (fieldName === 'chiefCount') {
            draft.chiefCount = Math.max(0, Math.min(5, parseInt(value, 10) || SECURITY_CONFIG.stage1Preset.chiefCount));
        }

        editorDraftByPlayerId.set(player.id, draft);
        syncEditor(player);
    });

    mp.events.add('security:editor:createZone', (player) => {
        if (!player || !mp.players.exists(player)) return;

        const draft = editorDraftByPlayerId.get(player.id) || getDefaultDraft(player);
        let zone = draft.zoneId ? zones.get(Number(draft.zoneId)) : null;

        if (!zone) {
            zone = createZoneFromPlayerPosition(player, draft);
            if (!zone) return;
            notify(player, `Зона создана в runtime (#${zone.id}).`);
        } else {
            zone.name = String(draft.name || '').trim() || zone.name;
            zone.radius = Math.max(10, Number(draft.radius) || zone.radius);
            zone.dimension = Number(player.dimension) || zone.dimension;
            notify(player, `Параметры зоны #${zone.id} обновлены.`);
        }

        draft.zoneId = zone.id;
        editorDraftByPlayerId.set(player.id, draft);
        syncEditor(player);
    });

    mp.events.add('security:editor:spawnNpc', (player) => {
        if (!player || !mp.players.exists(player)) return;

        const draft = editorDraftByPlayerId.get(player.id);
        if (!draft || !draft.zoneId) {
            notify(player, 'Сначала нажмите "Создать зону".', 'error');
            return;
        }

        const zone = zones.get(Number(draft.zoneId));
        if (!zone) {
            notify(player, 'Зона не найдена в runtime.', 'error');
            return;
        }

        spawnStage1Preset(zone);
        notify(player, `NPC созданы: 3 guard + 1 chief (zone #${zone.id}).`);
    });

    mp.events.add('security:editor:deleteNpc', (player) => {
        if (!player || !mp.players.exists(player)) return;

        const draft = editorDraftByPlayerId.get(player.id);
        if (!draft || !draft.zoneId) {
            notify(player, 'Сначала создайте зону.', 'error');
            return;
        }

        const zone = zones.get(Number(draft.zoneId));
        if (!zone) {
            notify(player, 'Зона не найдена в runtime.', 'error');
            return;
        }

        destroyZoneNpcs(zone);
        notify(player, `NPC зоны #${zone.id} удалены.`);
    });

    mp.events.add('security:editor:saveZone', async (player) => {
        if (!player || !mp.players.exists(player)) return;

        const draft = editorDraftByPlayerId.get(player.id);
        if (!draft || !draft.zoneId) {
            notify(player, 'Сначала создайте зону.', 'error');
            return;
        }

        const zone = zones.get(Number(draft.zoneId));
        if (!zone) {
            notify(player, 'Зона не найдена в runtime.', 'error');
            return;
        }

        zone.name = String(draft.name || '').trim() || zone.name;
        zone.radius = Math.max(10, Number(draft.radius) || zone.radius);
        zone.guardCount = Math.max(0, parseInt(draft.guardCount, 10) || zone.guardCount);
        zone.chiefCount = Math.max(0, parseInt(draft.chiefCount, 10) || zone.chiefCount);
        zone.dimension = Number(player.dimension) || zone.dimension;

        try {
            await saveZoneToDb(zone);
            draft.zoneId = zone.id;
            editorDraftByPlayerId.set(player.id, draft);
            syncEditor(player);
            notify(player, `Зона #${zone.id} сохранена в security_zones.`);
        } catch (error) {
            notify(player, `Ошибка сохранения: ${error.message}`, 'error');
        }
    });

    mp.events.add('security:editor:close', (player) => {
        if (!player || !mp.players.exists(player)) return;
        player.call('security:editor:close');
    });

    mp.events.add('security:respawn:nearest', (player) => {
        if (!player || !mp.players.exists(player)) return;

        const zone = findNearestZone(player);
        if (!zone) {
            notify(player, 'Не найдено ни одной security-зоны в текущем dimension.', 'error');
            return;
        }

        spawnStage1Preset(zone);
        notify(player, `NPC пересозданы для зоны #${zone.id}.`);
    });
}

async function initSecurityController() {
    if (initialized) return;

    await loadZones();
    registerEvents();

    initialized = true;
    log(`controller initialized, runtime zones=${zones.size}`);
}

module.exports = {
    initSecurityController,
    state: {
        zones,
        npcs,
        editorDraftByPlayerId,
    },
};
