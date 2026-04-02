"use strict";

module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("LootboxCaseReward", {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        caseId: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        rarity: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        weight: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        icon: {
            type: DataTypes.STRING(256),
            allowNull: true,
        },
        minAmount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        maxAmount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        uniqueKey: {
            type: DataTypes.STRING(128),
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        isEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        tableName: "LootboxCaseRewards",
    });

    return model;
};
