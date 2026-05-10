CREATE TABLE IF NOT EXISTS `FishingRecords` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `characterId` INT(11) NULL DEFAULT NULL,
  `playerName` VARCHAR(64) NOT NULL,
  `fishName` VARCHAR(128) NOT NULL,
  `weight` FLOAT(10) NOT NULL,
  `time` INT(11) NOT NULL DEFAULT 0,
  `caughtAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fishing_records_weight` (`weight`),
  KEY `fishing_records_caught_at` (`caughtAt`),
  KEY `fishing_records_fish_name` (`fishName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
