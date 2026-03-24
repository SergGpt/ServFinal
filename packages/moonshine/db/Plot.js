module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('MoonshinePlot', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        x: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        y: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        z: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        radius: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 1.5,
        },
    }, {
        timestamps: false,
    });

    return model;
};
