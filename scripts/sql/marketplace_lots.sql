CREATE TABLE IF NOT EXISTS `marketplace_lots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sellerCharacterId` int NOT NULL,
  `sellerName` varchar(64) NOT NULL,
  `title` varchar(128) NOT NULL,
  `description` varchar(512) DEFAULT NULL,
  `price` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `buyerCharacterId` int DEFAULT NULL,
  `lotType` varchar(16) NOT NULL DEFAULT "item",
  `lotTargetId` int DEFAULT NULL,
  `lotPayload` text DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_marketplace_status` (`status`),
  KEY `idx_marketplace_seller` (`sellerCharacterId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
