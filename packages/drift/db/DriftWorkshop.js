module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('DriftWorkshop', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: 'Drift Workshop',
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
            defaultValue: 3.0,
        },
    }, {
        timestamps: false,
    });

    return model;
};
