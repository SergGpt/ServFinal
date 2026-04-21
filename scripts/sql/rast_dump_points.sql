CREATE TABLE IF NOT EXISTS `RastDumpPoints` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `x` float NOT NULL,
  `y` float NOT NULL,
  `z` float NOT NULL,
  `d` int(11) NOT NULL DEFAULT 0,
  `radius` float NOT NULL DEFAULT 2,
  `cooldownSec` int(11) NOT NULL DEFAULT 120,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
