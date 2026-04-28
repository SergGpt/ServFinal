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

 Date: 28/11/2024 14:12:19
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for e-dev_marketplace-items
-- ----------------------------
DROP TABLE IF EXISTS `e-dev_marketplace-items`;
CREATE TABLE `e-dev_marketplace-items`  (
  `id` int NOT NULL,
  `owner` int NULL DEFAULT NULL,
  `type` int NULL DEFAULT NULL,
  `data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `cost` bigint NULL DEFAULT NULL,
  `views` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `favourites` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `photos` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `createDate` datetime NULL DEFAULT NULL,
  `endDate` datetime NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
