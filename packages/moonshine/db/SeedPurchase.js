module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('MoonshineSeedPurchase', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        characterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        date: {
            type: DataTypes.STRING(16),
            allowNull: false,
        },
        amount: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['characterId', 'date'],
            },
        ],
    });

    return model;
};
