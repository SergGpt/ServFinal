CREATE TABLE IF NOT EXISTS `zombie_zones` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL DEFAULT 'Zombie Zone',
  `x` FLOAT NOT NULL,
  `y` FLOAT NOT NULL,
  `z` FLOAT NOT NULL,
  `radius` FLOAT NOT NULL DEFAULT 30,
  `zombieCount` INT(11) NOT NULL DEFAULT 3 COMMENT 'Количество одновременного спавна зомби',
  `respawnMs` INT(11) NOT NULL DEFAULT 60000 COMMENT 'Скорость респавна зомби (мс)',
  `maxZombieCount` INT(11) NOT NULL DEFAULT 18,
  `waveSize` INT(11) NOT NULL DEFAULT 3,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
