module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('MoonshineSetting', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            allowNull: false,
        },
        data: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
        },
    }, {
        timestamps: false,
    });

    return model;
};
