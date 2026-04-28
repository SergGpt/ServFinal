/*
 Navicat Premium Data Transfer

 Source Server         : Farko
 Source Server Type    : MySQL
 Source Server Version : 100414
 Source Host           : localhost:3306
 Source Schema         : ra3_mj

 Target Server Type    : MySQL
 Target Server Version : 100414
 File Encoding         : 65001

 Date: 28/11/2024 14:12:13
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for e-dev_marketplace-auction
-- ----------------------------
DROP TABLE IF EXISTS `e-dev_marketplace-auction`;
CREATE TABLE `e-dev_marketplace-auction`  (
  `id` int NOT NULL,
  `type` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `cost` int NULL DEFAULT NULL,
  `data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `betStep` int NULL DEFAULT NULL,
  `bets` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `endDate` datetime NULL DEFAULT NULL,
  `views` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `favourites` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
