module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FamilyMember", {
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
            unique: true,
        },
        rankId: {
            type: DataTypes.INTEGER(11),
            allowNull: true,
        },
        joinedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    });

    model.associate = (models) => {
        model.belongsTo(models.Family, { foreignKey: 'familyId', as: 'Family' });
        model.belongsTo(models.FamilyRank, { foreignKey: 'rankId', as: 'Rank', onDelete: 'SET NULL' });
        model.belongsTo(models.Character, { foreignKey: 'characterId', as: 'Character' });
    };

    return model;
};
