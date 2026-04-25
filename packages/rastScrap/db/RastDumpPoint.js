module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("RastDumpPoint", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        x: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        y: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        z: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        d: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        radius: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 2.0
        },
        cooldownSec: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 120
        }
    }, {
        timestamps: false
    });

    return model;
};
