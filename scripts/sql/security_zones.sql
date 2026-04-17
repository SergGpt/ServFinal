CREATE TABLE IF NOT EXISTS `security_zones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL DEFAULT 'Security Zone',
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `z` float NOT NULL DEFAULT 0,
  `dimension` int(11) NOT NULL DEFAULT 0,
  `radius` float NOT NULL DEFAULT 100,
  `guardCount` int(11) NOT NULL DEFAULT 3,
  `chiefCount` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
