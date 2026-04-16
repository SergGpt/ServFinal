-- Обновляет координаты поста army_north_gate в БД (guard_checkpoint_posts.data JSON)
-- Новая точка: 733.0470581054688, -2549.67333984375, 19.984865188598633

UPDATE guard_checkpoint_posts
SET
    data = JSON_SET(
        CAST(data AS JSON),
        '$.guardZone.center.x', 733.0470581054688,
        '$.guardZone.center.y', -2549.67333984375,
        '$.guardZone.center.z', 19.984865188598633,

        '$.postZone.center.x', 733.0470581054688,
        '$.postZone.center.y', -2549.67333984375,
        '$.postZone.center.z', 19.984865188598633,

        '$.pursuitZone.center.x', 733.0470581054688,
        '$.pursuitZone.center.y', -2549.67333984375,
        '$.pursuitZone.center.z', 19.984865188598633,

        '$.stopZone.center.x', 745.2170581054688,
        '$.stopZone.center.y', -2559.97333984375,
        '$.stopZone.center.z', 19.984865188598633,

        '$.violationZone.center.x', 743.1370581054687,
        '$.violationZone.center.y', -2557.92333984375,
        '$.violationZone.center.z', 19.984865188598633,

        '$.leader.spawn.x', 741.0470581054688,
        '$.leader.spawn.y', -2555.73333984375,
        '$.leader.spawn.z', 19.984865188598633,

        '$.guards[0].spawn.x', 737.4670581054688,
        '$.guards[0].spawn.y', -2560.89333984375,
        '$.guards[0].spawn.z', 19.984865188598633,

        '$.guards[1].spawn.x', 746.5570581054688,
        '$.guards[1].spawn.y', -2554.04333984375,
        '$.guards[1].spawn.z', 19.984865188598633
    ),
    name = 'Army North Gate',
    dimension = 0,
    updatedAt = UNIX_TIMESTAMP(NOW(3)) * 1000
WHERE id = 'army_north_gate';

