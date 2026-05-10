module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("CharacterWeaponSkin", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        characterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false
        },
        weaponHash: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        tintId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0
        }
    }, {
        timestamps: true,
        indexes: [{
            unique: true,
            fields: ["characterId", "weaponHash"]
        }]
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, {
            foreignKey: "characterId"
        });
    };

    return model;
};
