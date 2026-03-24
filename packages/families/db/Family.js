module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("Family", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
        },
        ownerId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        logo: {
            type: DataTypes.STRING(256),
            allowNull: true,
            defaultValue: null,
        },
        motd: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '',
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '',
        },
    });

    model.associate = (models) => {
        model.belongsTo(models.Character, {
            as: 'Owner',
            foreignKey: 'ownerId',
        });
        model.hasMany(models.FamilyRank, {
            as: 'Ranks',
            foreignKey: 'familyId',
            onDelete: 'CASCADE',
        });
        model.hasMany(models.FamilyMember, {
            as: 'Members',
            foreignKey: 'familyId',
            onDelete: 'CASCADE',
        });
        model.hasMany(models.FamilyInvite, {
            as: 'Invites',
            foreignKey: 'familyId',
            onDelete: 'CASCADE',
        });
    };

    return model;
};
