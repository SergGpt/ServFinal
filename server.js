'use strict';

const CONFIG = {
    model: 'u_m_y_zombie_01',
    maxHealth: 300,
    attackDamage: 12,
    attackRange: 2.1,
    attackIntervalMs: 1200,
    controllerReassignMs: 2000,
    aiTickMs: 350,
    cleanupDelayMs: 5000,
    spawnTickMs: 2000,
    zombieCap: 60,
    controllerMaxDistance: 260,
    zones: [
        {
            name: 'LS_DOCKS',
            center: new mp.Vector3(1270.11, -3204.76, 5.91),
            radius: 140,
            maxZombies: 18
        },
        {
            name: 'SANDY',
            center: new mp.Vector3(1837.5, 3908.6, 33.2),
            radius: 120,
            maxZombies: 12
        }
    ]
};

const ZombieState = Object.freeze({
    IDLE: 'idle',
    PURSUE: 'pursue',
    ATTACK: 'attack',
    DEAD: 'dead',
    REMOVING: 'removing'
});

class ZombieManager {
    constructor() {
        this.nextId = 1;
        this.zombies = new Map();
        this.spawnTimer = setInterval(() => this.tickSpawns(), CONFIG.spawnTickMs);
        this.aiTimer = setInterval(() => this.tickStateMachine(), CONFIG.aiTickMs);
        this.controllerTimer = setInterval(() => this.tickControllers(), CONFIG.controllerReassignMs);

        mp.events.add('playerQuit', (player) => this.handlePlayerQuit(player));
        mp.events.add('playerDeath', (player) => this.handlePlayerDeath(player));
        mp.events.add('z:reportPedDamage', (player, zombieId, damage) => this.onDamageReported(player, zombieId, damage));

        mp.events.add('z:debugSpawn', (player) => {
            this.spawnZombie(player.position, player.dimension || 0);
        });
    }

    spawnZombie(position, dimension = 0) {
        if (this.zombies.size >= CONFIG.zombieCap) return null;

        const ped = mp.peds.new(
            mp.joaat(CONFIG.model),
            new mp.Vector3(position.x, position.y, position.z),
            0,
            dimension
        );

        const zombie = {
            id: this.nextId++,
            ped,
            health: CONFIG.maxHealth,
            state: ZombieState.IDLE,
            controller: null,
            target: null,
            slotIndex: 0,
            slotCount: 1,
            zoneName: this.resolveZoneName(position),
            nextAttackAt: 0,
            removeTimer: null
        };

        this.zombies.set(zombie.id, zombie);

        ped.setVariable('zombieId', zombie.id);
        ped.setVariable('zState', zombie.state);
        ped.setVariable('zHealth', zombie.health);
        ped.setVariable('zTarget', -1);
        ped.setVariable('zController', -1);
        ped.setVariable('zSlotIndex', 0);
        ped.setVariable('zSlotCount', 1);
        ped.setVariable('zNoFlee', true);

        this.assignController(zombie);
        return zombie;
    }

    destroyZombie(zombieId) {
        const zombie = this.zombies.get(zombieId);
        if (!zombie) return;

        zombie.state = ZombieState.REMOVING;
        this.syncZombieState(zombie);

        if (zombie.removeTimer) {
            clearTimeout(zombie.removeTimer);
            zombie.removeTimer = null;
        }

        if (zombie.ped && zombie.ped.destroy) {
            zombie.ped.destroy();
        }

        this.zombies.delete(zombieId);
    }

    assignController(zombie) {
        const nearest = this.findNearestController(zombie.ped.position, zombie.ped.dimension);
        zombie.controller = nearest;

        zombie.ped.controller = nearest || null;
        zombie.ped.setVariable('zController', nearest ? nearest.id : -1);
    }

    reassignController(zombie) {
        const oldController = zombie.controller;
        const nearest = this.findNearestController(zombie.ped.position, zombie.ped.dimension);

        if (oldController && nearest && oldController.id === nearest.id) return;

        zombie.controller = nearest;
        zombie.ped.controller = nearest || null;
        zombie.ped.setVariable('zController', nearest ? nearest.id : -1);

        if (zombie.state !== ZombieState.DEAD && zombie.state !== ZombieState.REMOVING) {
            zombie.state = ZombieState.PURSUE;
            this.syncZombieState(zombie);
        }
    }

    tickControllers() {
        this.zombies.forEach((zombie) => {
            if (zombie.state === ZombieState.DEAD || zombie.state === ZombieState.REMOVING) return;
            if (!zombie.controller || !zombie.controller.character) {
                this.reassignController(zombie);
                return;
            }

            if (zombie.controller.dimension !== zombie.ped.dimension) {
                this.reassignController(zombie);
                return;
            }

            const dist = this.distance3d(zombie.controller.position, zombie.ped.position);
            if (dist > CONFIG.controllerMaxDistance) {
                this.reassignController(zombie);
            }
        });
    }

    tickSpawns() {
        CONFIG.zones.forEach((zone) => {
            const inZone = Array.from(this.zombies.values()).filter((z) => z.zoneName === zone.name && z.state !== ZombieState.REMOVING).length;
            const need = Math.max(0, zone.maxZombies - inZone);

            if (!need) return;

            for (let i = 0; i < need && this.zombies.size < CONFIG.zombieCap; i += 1) {
                const spawnPos = this.randomPointInCircle(zone.center, zone.radius);
                this.spawnZombie(spawnPos, 0);
            }
        });
    }

    tickStateMachine() {
        const livingZombies = [];

        this.zombies.forEach((zombie) => {
            if (zombie.state === ZombieState.DEAD || zombie.state === ZombieState.REMOVING) return;

            const target = this.findNearestTarget(zombie);
            zombie.target = target;
            zombie.ped.setVariable('zTarget', target ? target.id : -1);

            if (!target) {
                if (zombie.state !== ZombieState.IDLE) {
                    zombie.state = ZombieState.IDLE;
                    this.syncZombieState(zombie);
                }
                return;
            }

            livingZombies.push(zombie);

            const dist = this.distance3d(zombie.ped.position, target.position);
            const nextState = dist <= CONFIG.attackRange ? ZombieState.ATTACK : ZombieState.PURSUE;

            if (nextState !== zombie.state) {
                zombie.state = nextState;
                this.syncZombieState(zombie);
            }

            if (zombie.state === ZombieState.ATTACK) {
                this.processAttack(zombie, target);
            }
        });

        this.recalculateSlots(livingZombies);
    }

    processAttack(zombie, target) {
        const now = Date.now();
        if (now < zombie.nextAttackAt) return;

        zombie.nextAttackAt = now + CONFIG.attackIntervalMs;

        const damage = Math.min(CONFIG.attackDamage, Math.max(1, target.health - 1));
        target.health = Math.max(1, target.health - damage);
        target.call('z:attacked', [zombie.id, damage]);
    }

    onDamageReported(player, zombieId, rawDamage) {
        const zombie = this.zombies.get(Number(zombieId));
        if (!zombie) return;
        if (zombie.state === ZombieState.DEAD || zombie.state === ZombieState.REMOVING) return;
        if (!player || !player.character) return;

        if (player.dimension !== zombie.ped.dimension) return;
        const dist = this.distance3d(player.position, zombie.ped.position);
        if (dist > 140) return;

        const damage = Math.max(1, Math.min(150, Number(rawDamage) || 0));
        zombie.health = Math.max(0, zombie.health - damage);
        zombie.ped.setVariable('zHealth', zombie.health);

        if (zombie.health <= 0) {
            this.markZombieDead(zombie, player);
            return;
        }

        zombie.target = player;
        zombie.state = ZombieState.PURSUE;
        this.syncZombieState(zombie);
    }

    markZombieDead(zombie, killer) {
        zombie.state = ZombieState.DEAD;
        zombie.target = null;
        zombie.ped.setVariable('zTarget', -1);
        this.syncZombieState(zombie);

        if (killer && killer.call) {
            killer.call('z:killConfirmed', [zombie.id]);
        }

        mp.players.call('z:dead', [zombie.id]);

        zombie.removeTimer = setTimeout(() => {
            this.destroyZombie(zombie.id);
        }, CONFIG.cleanupDelayMs);
    }

    handlePlayerQuit(player) {
        this.zombies.forEach((zombie) => {
            if (zombie.controller && zombie.controller.id === player.id) {
                this.reassignController(zombie);
            }
            if (zombie.target && zombie.target.id === player.id) {
                zombie.target = null;
                zombie.ped.setVariable('zTarget', -1);
                zombie.state = ZombieState.IDLE;
                this.syncZombieState(zombie);
            }
        });
    }

    handlePlayerDeath(player) {
        this.zombies.forEach((zombie) => {
            if (zombie.target && zombie.target.id === player.id) {
                zombie.target = null;
                zombie.ped.setVariable('zTarget', -1);
                zombie.state = ZombieState.PURSUE;
                this.syncZombieState(zombie);
            }
        });
    }

    recalculateSlots(zombies) {
        const grouped = new Map();

        zombies.forEach((zombie) => {
            if (!zombie.target) return;
            const key = zombie.target.id;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(zombie);
        });

        grouped.forEach((list) => {
            list.sort((a, b) => a.id - b.id);
            const slotCount = list.length;

            list.forEach((zombie, index) => {
                if (zombie.slotCount === slotCount && zombie.slotIndex === index) return;
                zombie.slotCount = slotCount;
                zombie.slotIndex = index;
                zombie.ped.setVariable('zSlotCount', slotCount);
                zombie.ped.setVariable('zSlotIndex', index);
            });
        });
    }

    findNearestController(position, dimension) {
        let best = null;
        let bestDist = Number.MAX_SAFE_INTEGER;

        mp.players.forEach((player) => {
            if (!player || !player.character) return;
            if (player.dimension !== dimension) return;

            const dist = this.distance3d(position, player.position);
            if (dist < bestDist) {
                best = player;
                bestDist = dist;
            }
        });

        return best;
    }

    findNearestTarget(zombie) {
        let best = null;
        let bestDist = Number.MAX_SAFE_INTEGER;

        mp.players.forEach((player) => {
            if (!player || !player.character) return;
            if (player.dimension !== zombie.ped.dimension) return;
            if (player.health <= 0) return;

            const dist = this.distance3d(zombie.ped.position, player.position);
            if (dist < bestDist) {
                best = player;
                bestDist = dist;
            }
        });

        return best;
    }

    randomPointInCircle(center, radius) {
        const angle = Math.random() * Math.PI * 2;
        const length = Math.sqrt(Math.random()) * radius;
        return new mp.Vector3(
            center.x + Math.cos(angle) * length,
            center.y + Math.sin(angle) * length,
            center.z
        );
    }

    resolveZoneName(position) {
        const zone = CONFIG.zones.find((z) => this.distance2d(position, z.center) <= z.radius);
        return zone ? zone.name : 'MANUAL';
    }

    syncZombieState(zombie) {
        zombie.ped.setVariable('zState', zombie.state);
    }

    distance2d(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    distance3d(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = (a.z || 0) - (b.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}

global.zombieManager = new ZombieManager();

