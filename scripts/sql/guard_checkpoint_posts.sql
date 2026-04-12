CREATE TABLE IF NOT EXISTS `guard_checkpoint_posts` (
  `id` varchar(64) NOT NULL,
  `name` varchar(128) DEFAULT NULL,
  `dimension` int(11) NOT NULL DEFAULT 0,
  `data` longtext NOT NULL,
  `updatedAt` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
