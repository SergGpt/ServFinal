"use strict";

module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("LootboxCaseHistory", {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        characterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        caseId: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        caseName: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        rewardType: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        rewardName: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        rewardIcon: {
            type: DataTypes.STRING(256),
            allowNull: true,
        },
        rarity: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        rarityName: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        rarityColor: {
            type: DataTypes.STRING(16),
            allowNull: false,
        },
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        duplicate: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        refund: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    }, {
        updatedAt: false,
        tableName: "LootboxCaseHistories",
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, { foreignKey: "characterId", as: "character" });
    };

    return model;
};
