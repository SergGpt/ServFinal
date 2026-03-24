function createLogger(enabled, tag = 'ZCTRL') {
    const importantRe = /(error|exception|fatal|spawn failed|switch failed|destroy error)/i;
    return (msg) => {
        if (!enabled && !importantRe.test(String(msg || ''))) return;
        console.log(`[${tag}] ${msg}`);
    };
}

function dist2d(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function dist3(a, b) {
    try {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch {
        return 99999;
    }
}

function getPlayerById(mpRef, rid) {
    if (typeof rid !== 'number') return null;
    let found = null;
    try {
        mpRef.players.forEach((p) => {
            if (!found && p.id === rid) found = p;
        });
    } catch {}
    return found;
}

function isPlayerInZone(player, zone) {
    try {
        if (zone && typeof zone.dimension === 'number' && player.dimension !== zone.dimension) return false;
        return dist2d(player.position.x, player.position.y, zone.x, zone.y) <= zone.radius;
    } catch {
        return false;
    }
}

function playersInZone(mpRef, zone) {
    const list = [];
    try {
        mpRef.players.forEach((p) => {
            if (isPlayerInZone(p, zone)) list.push(p);
        });
    } catch {}
    return list;
}

function isPlayerValidTarget(mpRef, player, zone, opts = {}) {
    if (!player || !mpRef.players.exists(player)) return false;
    if ((Number(player.health) || 0) <= 0) return false;
    if (zone && !isPlayerInZone(player, zone)) return false;
    if (typeof opts.dimension === 'number' && player.dimension !== opts.dimension) return false;
    if (opts.maxDistance && opts.fromPos) {
        if (dist3(opts.fromPos, player.position) > opts.maxDistance) return false;
    }
    return true;
}

function chooseNearestTarget(mpRef, zone, fromPos, opts = {}) {
    const list = playersInZone(mpRef, zone).filter((p) => isPlayerValidTarget(mpRef, p, zone, opts));
    if (!list.length) return null;

    let best = null;
    let bestDist = Infinity;
    list.forEach((p) => {
        const d = dist3(fromPos, p.position);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    });

    return best;
}

module.exports = {
    createLogger,
    dist2d,
    dist3,
    getPlayerById,
    isPlayerInZone,
    playersInZone,
    isPlayerValidTarget,
    chooseNearestTarget,
};
