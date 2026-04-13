"use strict";

function dist3(a, b) {
    const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

class GuardControllerManager {
    constructor(config, helpers) {
        this.config = config;
        this.helpers = helpers;
    }

    pickController(post, insidePlayers, now) {
        const currentOwnerId = post.streamOwnerId;
        const currentOwner = this.helpers.getPlayerById(currentOwnerId);
        const inCriticalState = post.state === "attack" || post.state === "warning";

        if (inCriticalState && currentOwner) return currentOwnerId;

        if (currentOwner && insidePlayers.some((p) => p.id === currentOwner.id)) {
            if (now - (post.lastControllerSwitchAt || 0) < Number(this.config.controllerSwitchCooldownMs || 2500)) {
                return currentOwnerId;
            }
        }

        let best = null;
        let bestScore = -Infinity;
        const center = this.helpers.getPostCenter(post);
        for (const player of insidePlayers) {
            const seenAt = Number(post.playerSeenAt.get(player.id)) || now;
            const stabilitySec = Math.min(5, Math.max(0, (now - seenAt) / 1000));
            const distScore = 100 - dist3(player.position, center);
            const score = distScore + stabilitySec * 4;
            if (score > bestScore) {
                bestScore = score;
                best = player;
            }
        }

        if (!best) return null;
        if (!currentOwner) return best.id;

        const curDist = dist3(currentOwner.position, center);
        const nextDist = dist3(best.position, center);
        const significantBetter = (curDist - nextDist) >= Number(this.config.controllerSwitchDistanceDelta || 12.0);
        const currentInvalid = !insidePlayers.some((p) => p.id === currentOwner.id);

        if (!currentInvalid && !significantBetter) return currentOwnerId;
        if (now - (post.lastControllerSwitchAt || 0) < Number(this.config.controllerSwitchCooldownMs || 2500)) return currentOwnerId;

        return best.id;
    }
}

module.exports = { GuardControllerManager };
