module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FamilyInvite", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        familyId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        characterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        inviterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        indexes: [{
            unique: true,
            fields: ['familyId', 'characterId'],
        }]
    });

    model.associate = (models) => {
        model.belongsTo(models.Family, { foreignKey: 'familyId', as: 'Family' });
        model.belongsTo(models.Character, { foreignKey: 'characterId', as: 'Character' });
    };

    return model;
};
