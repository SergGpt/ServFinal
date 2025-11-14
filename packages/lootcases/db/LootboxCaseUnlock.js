"use strict";

module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("LootboxCaseUnlock", {
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
            allowNull: true,
        },
        uniqueKey: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
    }, {
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["characterId", "uniqueKey"],
            },
        ],
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, { foreignKey: "characterId", as: "character" });
    };

    return model;
};
