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

function normalizeZonePoints(pointsRaw) {
    if (!Array.isArray(pointsRaw)) return [];
    return pointsRaw
        .map((p) => ({
            x: Number(p && p.x),
            y: Number(p && p.y),
            z: Number(p && p.z),
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

function isPointInPolygon2d(x, y, points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = Number(points[i].x);
        const yi = Number(points[i].y);
        const xj = Number(points[j].x);
        const yj = Number(points[j].y);

        const yiAbove = yi > y;
        const yjAbove = yj > y;
        const intersect = (yiAbove !== yjAbove)
            && (x < (((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9)) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

function randomPointInPolygon(points, fallback = { x: 0, y: 0, z: 0, radius: 10 }) {
    const norm = normalizeZonePoints(points);
    if (norm.length < 3) {
        const angle = Math.random() * Math.PI * 2;
        const d = Math.random() * Math.max(2, Number(fallback.radius) || 10);
        return {
            x: Number(fallback.x) + Math.cos(angle) * d,
            y: Number(fallback.y) + Math.sin(angle) * d,
            z: Number(fallback.z) || 0,
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let zSum = 0;

    norm.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        zSum += p.z;
    });

    const avgZ = zSum / norm.length;
    const tries = 80;
    for (let i = 0; i < tries; i++) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        if (isPointInPolygon2d(x, y, norm)) {
            return { x, y, z: avgZ };
        }
    }

    const center = norm.reduce((acc, p) => {
        acc.x += p.x;
        acc.y += p.y;
        return acc;
    }, { x: 0, y: 0 });

    return {
        x: center.x / norm.length,
        y: center.y / norm.length,
        z: avgZ,
    };
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
        const points = normalizeZonePoints(zone && zone.points);
        if (points.length >= 3) {
            return isPointInPolygon2d(player.position.x, player.position.y, points);
        }
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
    normalizeZonePoints,
    isPointInPolygon2d,
    randomPointInPolygon,
    getPlayerById,
    isPlayerInZone,
    playersInZone,
    isPlayerValidTarget,
    chooseNearestTarget,
};
