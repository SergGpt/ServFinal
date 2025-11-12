"use strict";

module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("LootboxCaseRequest", {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        characterId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        caseId: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        requestId: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        response: {
            type: DataTypes.JSON,
            allowNull: false,
        },
    }, {
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["requestId"],
            },
            {
                fields: ["characterId", "caseId"],
            }
        ],
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, { foreignKey: "characterId", as: "character" });
    };

    return model;
};
