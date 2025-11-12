"use strict";

module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("LootboxCaseInventory", {
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
        count: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: ["characterId", "caseId"],
            },
        ],
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, { foreignKey: "characterId", as: "character" });
    };

    return model;
};
