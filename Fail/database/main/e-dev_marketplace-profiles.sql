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

 Date: 28/11/2024 14:12:23
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for e-dev_marketplace-profiles
-- ----------------------------
DROP TABLE IF EXISTS `e-dev_marketplace-profiles`;
CREATE TABLE `e-dev_marketplace-profiles`  (
  `uuid` int NOT NULL,
  `storage` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  PRIMARY KEY (`uuid`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
