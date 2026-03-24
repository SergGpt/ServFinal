module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FamilyRank", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        familyId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        order: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 1,
        },
        canInvite: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        canKick: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        canManageRanks: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        canEditInfo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        canDisband: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    });

    model.associate = (models) => {
        model.belongsTo(models.Family, { foreignKey: 'familyId', as: 'Family' });
        model.hasMany(models.FamilyMember, { foreignKey: 'rankId', as: 'Members', onDelete: 'SET NULL' });
    };

    return model;
};
