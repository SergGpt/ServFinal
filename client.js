'use strict';

const ZombieState = Object.freeze({
    IDLE: 'idle',
    PURSUE: 'pursue',
    ATTACK: 'attack',
    DEAD: 'dead',
    REMOVING: 'removing'
});

const DAMAGE_BY_WEAPON = {
    [mp.game.joaat('WEAPON_UNARMED')]: 7,
    [mp.game.joaat('WEAPON_PISTOL')]: 35,
    [mp.game.joaat('WEAPON_SNSPISTOL')]: 30,
    [mp.game.joaat('WEAPON_COMBATPISTOL')]: 36,
    [mp.game.joaat('WEAPON_PUMPSHOTGUN')]: 80,
    [mp.game.joaat('WEAPON_ASSAULTRIFLE')]: 42,
    [mp.game.joaat('WEAPON_CARBINERIFLE')]: 40,
    [mp.game.joaat('WEAPON_HEAVYSNIPER')]: 120
};

const localZombies = new Map();
const aiCooldown = new Map();

function getZombieIdFromEntity(entity) {
    if (!entity || !entity.getVariable) return null;
    const id = entity.getVariable('zombieId');
    if (id === undefined || id === null) return null;
    return Number(id);
}

function isController(zombieEntity) {
    const controllerId = Number(zombieEntity.getVariable('zController'));
    return controllerId === mp.players.local.remoteId;
}

function getTargetPlayer(zombieEntity) {
    const targetId = Number(zombieEntity.getVariable('zTarget'));
    if (targetId < 0) return null;

    const target = mp.players.atRemoteId(targetId);
    if (!target || !target.handle) return null;
    return target;
}

function getRingOffset(slotIndex, slotCount) {
    const count = Math.max(slotCount, 1);
    const layer = Math.floor(slotIndex / 6);
    const layerSlot = slotIndex % 6;
    const angle = (Math.PI * 2 * (layerSlot / Math.min(6, count))) + (layer * 0.35);
    const radius = 1.8 + (layer * 1.2);

    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
    };
}

function stopCombatFlee(pedHandle) {
    mp.game.ped.setPedFleeAttributes(pedHandle, 0, false);
    mp.game.ped.setPedCombatAttributes(pedHandle, 17, true); // Always fight
    mp.game.ped.setPedCombatAttributes(pedHandle, 5, true);  // Can fight armed peds
    mp.game.ped.setPedCombatAbility(pedHandle, 2);
    mp.game.ped.setPedCombatMovement(pedHandle, 2);
}

function taskPursue(zombieEntity, targetPlayer) {
    const slotIndex = Number(zombieEntity.getVariable('zSlotIndex')) || 0;
    const slotCount = Number(zombieEntity.getVariable('zSlotCount')) || 1;
    const offset = getRingOffset(slotIndex, slotCount);

    mp.game.ai.taskFollowToOffsetOfEntity(
        zombieEntity.handle,
        targetPlayer.handle,
        offset.x,
        offset.y,
        0,
        2.0,
        -1,
        1.0,
        true
    );

    mp.game.ai.taskLookAtEntity(zombieEntity.handle, targetPlayer.handle, 750, 2048, 3);
}

function taskAttack(zombieEntity, targetPlayer, zombieId) {
    const now = Date.now();
    const nextAllowed = aiCooldown.get(zombieId) || 0;
    if (now < nextAllowed) return;

    aiCooldown.set(zombieId, now + 900);

    mp.game.ai.taskTurnPedToFaceEntity(zombieEntity.handle, targetPlayer.handle, 350);
    mp.game.streaming.requestAnimDict('melee@unarmed@streamed_core');
    mp.game.ai.taskPlayAnim(
        zombieEntity.handle,
        'melee@unarmed@streamed_core',
        'ground_attack_0_psycho',
        8.0,
        -8.0,
        700,
        0,
        0,
        false,
        false,
        false
    );
}

function updateZombieAI(zombieEntity) {
    const zombieId = getZombieIdFromEntity(zombieEntity);
    if (!zombieId) return;

    const state = zombieEntity.getVariable('zState');
    if (state === ZombieState.DEAD || state === ZombieState.REMOVING) return;

    stopCombatFlee(zombieEntity.handle);

    if (!isController(zombieEntity)) return;

    const targetPlayer = getTargetPlayer(zombieEntity);
    if (!targetPlayer) {
        if (state === ZombieState.IDLE) {
            mp.game.ai.clearPedTasks(zombieEntity.handle);
        }
        return;
    }

    if (state === ZombieState.PURSUE) {
        taskPursue(zombieEntity, targetPlayer);
        return;
    }

    if (state === ZombieState.ATTACK) {
        taskAttack(zombieEntity, targetPlayer, zombieId);
    }
}

function reportLocalDamage(zombieEntity) {
    const zombieId = getZombieIdFromEntity(zombieEntity);
    if (!zombieId) return;

    if (!mp.game.weapon.hasPedGotWeapon(mp.players.local.handle, 0, false)) return;

    const localHandle = mp.players.local.handle;
    const pedHandle = zombieEntity.handle;

    if (!mp.game.entity.hasEntityBeenDamagedByEntity(pedHandle, localHandle, true)) return;

    const weaponHash = mp.game.weapon.getSelectedPedWeapon(localHandle);
    const damage = DAMAGE_BY_WEAPON[weaponHash] || 20;

    mp.events.callRemote('z:reportPedDamage', zombieId, damage);
    mp.game.weapon.clearEntityLastDamageEntity(pedHandle);
}

function cleanupZombie(entity) {
    const zombieId = getZombieIdFromEntity(entity);
    if (!zombieId) return;

    aiCooldown.delete(zombieId);
    localZombies.delete(zombieId);
}

mp.events.add('entityStreamIn', (entity) => {
    if (entity.type !== 'ped') return;

    const zombieId = getZombieIdFromEntity(entity);
    if (!zombieId) return;

    localZombies.set(zombieId, entity);
    stopCombatFlee(entity.handle);
});

mp.events.add('entityStreamOut', (entity) => {
    if (entity.type !== 'ped') return;
    cleanupZombie(entity);
});

mp.events.add('entityDestroy', (entity) => {
    if (entity.type !== 'ped') return;
    cleanupZombie(entity);
});

mp.events.add('z:dead', (zombieId) => {
    const zombie = localZombies.get(Number(zombieId));
    if (!zombie || !zombie.handle) return;

    mp.game.ai.clearPedTasksImmediately(zombie.handle);
    mp.game.ped.setPedCanRagdoll(zombie.handle, true);
    mp.game.ped.setPedToRagdoll(zombie.handle, 5000, 5000, 0, false, false, false);

    aiCooldown.delete(Number(zombieId));
});

mp.events.add('z:attacked', (zombieId, damage) => {
    if (!damage || damage <= 0) return;

    mp.game.graphics.notify(`~r~Zombie #${zombieId} hit you: ${damage}`);
});

setInterval(() => {
    localZombies.forEach((zombieEntity) => {
        if (!zombieEntity || !zombieEntity.handle) return;

        updateZombieAI(zombieEntity);
        reportLocalDamage(zombieEntity);
    });
}, 250);

