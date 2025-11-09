"use strict";

const TICK_MS = 50;
const INVITE_TIMEOUT = 30000;
const NET_HEIGHT = 1.05;
const GRAVITY = 9.81;
const AIR_RESISTANCE = 0.991;
const BOUNCE_FRICTION = 0.82;
const GROUND_LEVEL_OFFSET = 0.02;

const COURTS = [
    {
        id: 1,
        name: "Vespucci Test Court",
        aSpawn: new mp.Vector3(-1193.0, -1579.5, 4.0),
        bSpawn: new mp.Vector3(-1188.5, -1594.5, 4.0),
        center: new mp.Vector3(-1191.0, -1587.0, 4.0),
        bounds: {
            minX: -1196.5,
            maxX: -1185.5,
            minY: -1598.0,
            maxY: -1576.0,
            netY: -1587.0
        }
    }
];

const NET_MODEL = mp.joaat("prop_tennis_net_01");
const BALL_MODEL = mp.joaat("prop_tennis_ball");

const invites = new Map();
const matches = new Map();

let notifications;
let inviteTimer = null;
let nextMatchId = 1;

const vectorToObject = (vec) => ({ x: vec.x, y: vec.y, z: vec.z });
const clonePosition = (pos) => ({ x: pos.x, y: pos.y, z: pos.z });

function toVector3(obj) {
    return new mp.Vector3(obj.x, obj.y, obj.z);
}

function distanceBetween(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function normalise(vec) {
    const length = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
    if (length <= 0.0001) return { x: 0, y: 0, z: 0 };
    return { x: vec.x / length, y: vec.y / length, z: vec.z / length };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function findNearestCourt(position, maxDist = 60) {
    let result = null;
    let best = maxDist;
    COURTS.forEach(court => {
        const dist = distanceBetween(vectorToObject(position), vectorToObject(court.center));
        if (dist < best) {
            best = dist;
            result = court;
        }
    });
    return result;
}

function isCourtBusy(courtId) {
    for (const match of matches.values()) {
        if (!match.finished && match.court.id === courtId) return true;
    }
    return false;
}

function cleanInvites() {
    const now = Date.now();
    invites.forEach((invite, targetId) => {
        const target = mp.players.at(targetId);
        const from = mp.players.at(invite.fromId);
        if (!target || !mp.players.exists(target) || !target.character || (from && !mp.players.exists(from))) {
            invites.delete(targetId);
            return;
        }
        if (invite.expires <= now) {
            invites.delete(targetId);
            notifications.info(target, "Приглашение на теннис истекло", "Теннис");
            if (from && mp.players.exists(from)) {
                notifications.info(from, `${target.character.name} не ответил на приглашение`, "Теннис");
            }
        }
    });
}

class Match {
    constructor(court, playerA, playerB) {
        this.id = nextMatchId++;
        this.court = court;
        this.players = {
            a: playerA,
            b: playerB
        };
        this.dimension = 15000 + this.id;
        this.points = { a: 0, b: 0 };
        this.advantage = null;
        this.serverSide = 'a';
        this.finished = false;
        this.playerStates = new Map();
        this.ball = {
            pos: vectorToObject(court.center),
            prevPos: vectorToObject(court.center),
            vel: { x: 0, y: 0, z: 0 },
            inPlay: false,
            lastHit: null,
            lastHitTime: 0,
            lastBounceSide: null,
            bounceCount: 0
        };
        this.ballObj = null;
        this.netObj = null;
        this.interval = null;
    }

    getPlayer(side) {
        const player = this.players[side];
        return mp.players.exists(player) ? player : null;
    }

    otherSide(side) {
        return side === 'a' ? 'b' : 'a';
    }

    start() {
        matches.set(this.id, this);

        ['a', 'b'].forEach(side => {
            const player = this.players[side];
            if (!mp.players.exists(player)) return;
            this.playerStates.set(player.id, {
                position: clonePosition(player.position),
                heading: player.heading,
                dimension: player.dimension
            });

            const spawn = side === 'a' ? this.court.aSpawn : this.court.bSpawn;
            const opponentSpawn = side === 'a' ? this.court.bSpawn : this.court.aSpawn;
            const dx = opponentSpawn.x - spawn.x;
            const dy = opponentSpawn.y - spawn.y;
            const heading = Math.atan2(dx, dy) * 180 / Math.PI;

            player.removeAllWeapons();
            player.position = new mp.Vector3(spawn.x, spawn.y, spawn.z);
            player.dimension = this.dimension;
            player.heading = heading < 0 ? heading + 360 : heading;
            player.tennisMatch = this;
            player.tennisSide = side;
        });

        this.spawnNet();
        this.spawnBall();
        this.resetForServe();
        this.broadcastMatchStart();
        const server = this.getPlayer(this.serverSide);
        const serverName = server?.character?.name || (this.serverSide === 'a' ? 'Игрок A' : 'Игрок B');
        this.broadcastScore(`Матч начался! Подаёт ${serverName}.`);

        this.interval = setInterval(() => {
            try {
                this.update();
            } catch (e) {
                console.log('[TENNIS] Tick error', e);
                this.finish(null, 'Ошибка матча');
            }
        }, TICK_MS);
    }

    spawnNet() {
        const position = new mp.Vector3(this.court.center.x, this.court.bounds.netY, this.court.center.z);
        this.netObj = mp.objects.new(NET_MODEL, position, {
            dimension: this.dimension
        });
    }

    spawnBall() {
        const position = new mp.Vector3(this.court.center.x, this.court.center.y, this.court.center.z + 1.0);
        this.ballObj = mp.objects.new(BALL_MODEL, position, {
            dimension: this.dimension
        });
    }

    updateBallObject() {
        if (mp.objects.exists(this.ballObj)) {
            this.ballObj.position = new mp.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z);
        }
    }

    broadcast(event, payload) {
        ['a', 'b'].forEach(side => {
            const player = this.players[side];
            if (mp.players.exists(player)) {
                player.call(event, [JSON.stringify(payload)]);
            }
        });
    }

    broadcastMatchStart() {
        ['a', 'b'].forEach(side => {
            const player = this.players[side];
            if (!mp.players.exists(player)) return;
            const payload = {
                matchId: this.id,
                side: side,
                court: {
                    id: this.court.id,
                    name: this.court.name,
                    bounds: this.court.bounds,
                    center: vectorToObject(this.court.center)
                },
                opponent: this.getPlayer(this.otherSide(side))?.character?.name || "Игрок",
                serverSide: this.serverSide,
                points: this.points
            };
            player.call('tennis.match.start', [JSON.stringify(payload)]);
        });
    }

    broadcastScore(reason, winnerSide = null) {
        const payload = {
            matchId: this.id,
            reason,
            serverSide: this.serverSide,
            points: this.points,
            players: {
                a: this.getPlayer('a')?.character?.name || 'Игрок A',
                b: this.getPlayer('b')?.character?.name || 'Игрок B'
            },
            advantage: this.advantage,
            finished: winnerSide != null,
            winnerSide
        };
        this.broadcast('tennis.score.update', payload);
    }

    sendPointNotifications(winnerSide, reason) {
        const winner = this.getPlayer(winnerSide);
        const loser = this.getPlayer(this.otherSide(winnerSide));
        if (winner) notifications.success(winner, `Очко за вами (${reason})`, 'Теннис');
        if (loser) notifications.warning(loser, `Очко сопернику (${reason})`, 'Теннис');
    }

    update() {
        if (this.finished) return;
        if (!this.ball.inPlay) {
            this.updateBallObject();
            return;
        }

        this.ball.vel.x *= AIR_RESISTANCE;
        this.ball.vel.y *= AIR_RESISTANCE;

        const dt = TICK_MS / 1000;
        const prev = { ...this.ball.pos };
        this.ball.prevPos = prev;

        this.ball.vel.z -= GRAVITY * dt;
        this.ball.pos.x += this.ball.vel.x * dt;
        this.ball.pos.y += this.ball.vel.y * dt;
        this.ball.pos.z += this.ball.vel.z * dt;

        if (this.checkNet(prev)) return;
        if (this.checkOut()) return;

        const groundLevel = this.court.center.z + GROUND_LEVEL_OFFSET;
        if (this.ball.pos.z <= groundLevel) {
            if (this.ball.vel.z < 0) {
                this.ball.pos.z = groundLevel;
                this.ball.vel.z = -this.ball.vel.z * 0.55;
                this.ball.vel.x *= BOUNCE_FRICTION;
                this.ball.vel.y *= BOUNCE_FRICTION;
                this.handleBounce();
                if (this.finished) return;
            } else {
                this.ball.pos.z = groundLevel;
            }
        }

        this.updateBallObject();

        if (Math.abs(this.ball.vel.x) < 0.05) this.ball.vel.x = 0;
        if (Math.abs(this.ball.vel.y) < 0.05) this.ball.vel.y = 0;
        if (Math.abs(this.ball.vel.z) < 0.05 && this.ball.pos.z <= groundLevel + 0.05) {
            const side = this.ball.lastBounceSide || (this.ball.pos.y >= this.court.bounds.netY ? 'a' : 'b');
            this.registerPoint(this.otherSide(side), 'Мяч остановился');
        }
    }

    handleBounce() {
        if (this.finished) return;
        const side = this.ball.pos.y >= this.court.bounds.netY ? 'a' : 'b';
        if (this.ball.lastBounceSide === side) {
            this.ball.bounceCount += 1;
        } else {
            this.ball.lastBounceSide = side;
            this.ball.bounceCount = 1;
        }

        if (this.ball.lastHit === side && this.ball.bounceCount === 1) {
            this.registerPoint(this.otherSide(side), 'Мяч приземлился на вашей стороне');
            return;
        }

        if (this.ball.bounceCount > 1) {
            this.registerPoint(this.otherSide(side), 'Двойной отскок');
        }
    }

    checkNet(prev) {
        const netY = this.court.bounds.netY;
        const from = prev.y - netY;
        const to = this.ball.pos.y - netY;
        if (from === 0 && to === 0) return false;
        if ((from > 0 && to < 0) || (from < 0 && to > 0) || from === 0 || to === 0) {
            if (this.ball.pos.z < this.court.center.z + NET_HEIGHT) {
                const winner = this.otherSide(this.ball.lastHit || this.serverSide);
                this.registerPoint(winner, 'Соперник попал в сетку');
                return true;
            }
        }
        return false;
    }

    checkOut() {
        const { minX, maxX, minY, maxY } = this.court.bounds;
        if (this.ball.pos.x < minX || this.ball.pos.x > maxX || this.ball.pos.y < minY || this.ball.pos.y > maxY) {
            const winner = this.otherSide(this.ball.lastHit || this.serverSide);
            this.registerPoint(winner, 'Аут');
            return true;
        }
        return false;
    }

    getServePosition(player, side) {
        const origin = vectorToObject(player.position);
        const offsetY = side === 'a' ? -0.75 : 0.75;
        return {
            x: origin.x,
            y: origin.y + offsetY,
            z: this.court.center.z + 1.05
        };
    }

    strike(player, side, charge, aimX, aimY, aimZ) {
        const power = clamp(Number(charge) || 0, 0.15, 1.4);
        let aim = normalise({ x: aimX, y: aimY, z: aimZ });
        if (Math.abs(aim.x) < 0.001 && Math.abs(aim.y) < 0.001) {
            aim = { x: 0, y: side === 'a' ? -1 : 1, z: 0 };
        }
        aim.y = Math.abs(aim.y) * (side === 'a' ? -1 : 1);

        const isServe = !this.ball.inPlay;
        const baseSpeed = isServe ? 14 : 17;
        const speed = baseSpeed + power * 8.5;
        const vertical = isServe ? 6 + power * 3 : 5 + power * 4.5;

        if (isServe) {
            const servePos = this.getServePosition(player, side);
            this.ball.pos = servePos;
        }

        this.ball.inPlay = true;
        this.ball.lastHit = side;
        this.ball.lastHitTime = Date.now();
        this.ball.lastBounceSide = null;
        this.ball.bounceCount = 0;
        this.ball.vel = {
            x: aim.x * speed,
            y: aim.y * speed,
            z: vertical
        };
        this.updateBallObject();
    }

    serve(player, side, charge, aimX, aimY, aimZ) {
        this.strike(player, side, charge, aimX, aimY, aimZ);
    }

    handleSwing(player, charge, aimX, aimY, aimZ) {
        if (this.finished) return;
        const side = player.tennisSide;
        if (!side) return;

        const now = Date.now();
        if (this.ball.lastHit === side && now - this.ball.lastHitTime < 350) return;

        if (!this.ball.inPlay) {
            if (side !== this.serverSide) {
                notifications.warning(player, 'Сейчас подаёт соперник', 'Теннис');
                return;
            }
            this.serve(player, side, charge, aimX, aimY, aimZ);
            return;
        }

        const playerPos = vectorToObject(player.position);
        const dist = distanceBetween(playerPos, this.ball.pos);
        if (dist > 4.5) {
            notifications.warning(player, 'Мяч слишком далеко', 'Теннис');
            return;
        }

        const ballSide = this.ball.pos.y >= this.court.bounds.netY ? 'a' : 'b';
        if (ballSide !== side && (this.ball.pos.z - this.court.center.z) < 0.6) {
            notifications.warning(player, 'Дождитесь пока мяч перелетит сетку', 'Теннис');
            return;
        }

        this.strike(player, side, charge, aimX, aimY, aimZ);
    }

    registerPoint(winnerSide, reason) {
        if (this.finished) return;
        this.sendPointNotifications(winnerSide, reason);

        const loserSide = this.otherSide(winnerSide);
        this.points[winnerSide] += 1;

        if (this.points[winnerSide] >= 4 && this.points[winnerSide] - this.points[loserSide] >= 2) {
            this.finish(winnerSide, reason);
            return;
        }

        if (this.points[winnerSide] >= 3 && this.points[loserSide] >= 3) {
            if (this.points[winnerSide] === this.points[loserSide]) {
                this.advantage = null;
            } else if (this.points[winnerSide] > this.points[loserSide]) {
                this.advantage = winnerSide;
            } else {
                this.advantage = loserSide;
            }
        } else if (this.points[winnerSide] <= 3 && this.points[loserSide] <= 3) {
            this.advantage = null;
        }

        this.resetForServe();
        this.broadcastScore(reason);
    }

    resetForServe() {
        this.ball.inPlay = false;
        this.ball.vel = { x: 0, y: 0, z: 0 };
        this.ball.lastHit = null;
        this.ball.lastBounceSide = null;
        this.ball.bounceCount = 0;
        const server = this.getPlayer(this.serverSide);
        if (server) {
            const servePos = this.getServePosition(server, this.serverSide);
            this.ball.pos = servePos;
        } else {
            const spawn = this.serverSide === 'a' ? this.court.aSpawn : this.court.bSpawn;
            this.ball.pos = {
                x: spawn.x,
                y: spawn.y,
                z: this.court.center.z + 1.05
            };
        }
        this.updateBallObject();
        this.broadcast('tennis.state.update', {
            matchId: this.id,
            serverSide: this.serverSide
        });
    }

    finish(winnerSide, reason) {
        if (this.finished) return;
        this.finished = true;

        const winner = winnerSide ? this.getPlayer(winnerSide) : null;
        const loser = winnerSide ? this.getPlayer(this.otherSide(winnerSide)) : null;

        if (winner) notifications.success(winner, `Вы выиграли матч (${reason})`, 'Теннис');
        if (loser) notifications.error(loser, `Вы проиграли матч (${reason})`, 'Теннис');

        this.broadcastScore(reason, winnerSide);
        this.broadcast('tennis.match.end', {
            matchId: this.id,
            winnerSide,
            reason
        });

        this.cleanup();
    }

    stopByPlayer(player) {
        const side = player.tennisSide;
        const winnerSide = this.otherSide(side);
        this.finish(winnerSide, `${player.character?.name || 'Игрок'} покинул матч`);
    }

    onPlayerQuit(player) {
        if (this.finished) return;
        const side = player.tennisSide;
        const winnerSide = this.otherSide(side);
        this.finish(winnerSide, `${player.character?.name || 'Игрок'} покинул игру`);
    }

    cleanup() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        if (mp.objects.exists(this.ballObj)) {
            this.ballObj.destroy();
        }
        if (mp.objects.exists(this.netObj)) {
            this.netObj.destroy();
        }

        ['a', 'b'].forEach(side => {
            const player = this.players[side];
            if (!mp.players.exists(player)) return;
            const state = this.playerStates.get(player.id);
            if (state) {
                player.dimension = state.dimension;
                player.position = toVector3(state.position);
                player.heading = state.heading;
            }
            player.tennisMatch = null;
            player.tennisSide = null;
            player.call('tennis.match.cleanup');
        });

        matches.delete(this.id);
    }
}

module.exports = {
    COURTS,
    init(deps) {
        notifications = deps.notifications;
        if (!inviteTimer) inviteTimer = setInterval(cleanInvites, 5000);
    },
    handleInvite(player, targetId) {
        if (!player.character) return;
        const id = parseInt(targetId, 10);
        if (isNaN(id)) {
            notifications.error(player, 'Укажите ID игрока', 'Теннис');
            return;
        }
        const target = mp.players.at(id);
        if (!target || !mp.players.exists(target) || !target.character) {
            notifications.error(player, 'Игрок не найден', 'Теннис');
            return;
        }
        if (target === player) {
            notifications.error(player, 'Нельзя пригласить себя', 'Теннис');
            return;
        }
        if (player.tennisMatch || target.tennisMatch) {
            notifications.error(player, 'Кто-то из вас уже играет', 'Теннис');
            return;
        }
        const court = findNearestCourt(player.position);
        if (!court) {
            notifications.error(player, 'Рядом нет свободного корта', 'Теннис');
            return;
        }
        if (isCourtBusy(court.id)) {
            notifications.warning(player, 'Корт уже занят', 'Теннис');
            return;
        }
        invites.set(target.id, {
            fromId: player.id,
            courtId: court.id,
            expires: Date.now() + INVITE_TIMEOUT
        });
        notifications.success(player, `Приглашение отправлено ${target.character.name}`, 'Теннис');
        notifications.info(target, `${player.character.name} приглашает вас сыграть в теннис. Используйте /tennis accept`, 'Теннис');
    },
    handleAccept(player) {
        if (!player.character) return;
        if (player.tennisMatch) {
            notifications.error(player, 'Вы уже играете', 'Теннис');
            return;
        }
        const invite = invites.get(player.id);
        if (!invite) {
            notifications.error(player, 'У вас нет приглашений', 'Теннис');
            return;
        }
        const from = mp.players.at(invite.fromId);
        if (!from || !mp.players.exists(from) || !from.character) {
            invites.delete(player.id);
            notifications.error(player, 'Пригласивший игрок недоступен', 'Теннис');
            return;
        }
        if (from.tennisMatch) {
            invites.delete(player.id);
            notifications.error(player, 'Игрок уже начал матч', 'Теннис');
            return;
        }
        const court = COURTS.find(c => c.id === invite.courtId);
        if (!court) {
            invites.delete(player.id);
            notifications.error(player, 'Корт недоступен', 'Теннис');
            return;
        }
        if (isCourtBusy(court.id)) {
            invites.delete(player.id);
            notifications.error(player, 'Корт уже занят', 'Теннис');
            return;
        }
        invites.delete(player.id);
        const match = new Match(court, from, player);
        match.start();
    },
    handleLeave(player) {
        const match = player.tennisMatch;
        if (!match) {
            notifications.error(player, 'Вы не участвуете в матче', 'Теннис');
            return;
        }
        match.stopByPlayer(player);
    },
    handleSwing(player, charge, aimX, aimY, aimZ) {
        const match = player.tennisMatch;
        if (!match) return;
        match.handleSwing(player, charge, aimX, aimY, aimZ);
    },
    onPlayerQuit(player) {
        invites.forEach((invite, targetId) => {
            if (invite.fromId === player.id || targetId === player.id) invites.delete(targetId);
        });
        const match = player.tennisMatch;
        if (match) match.onPlayerQuit(player);
    }
};
