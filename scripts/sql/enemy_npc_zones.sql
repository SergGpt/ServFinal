-- Таблица для хранения зон с вражескими NPC
CREATE TABLE IF NOT EXISTS enemy_npc_zones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    dimension INT NOT NULL DEFAULT 0,
    npcCount INT NOT NULL DEFAULT 3,
    respawnSec INT NOT NULL DEFAULT 60,
    points LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Индекс для быстрого поиска по измерению
CREATE INDEX idx_dimension ON enemy_npc_zones(dimension);
