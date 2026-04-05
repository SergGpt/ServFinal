module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('VehicleDriftSetup', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        vehicleId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            unique: true,
        },
        installed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        activePreset: {
            type: DataTypes.STRING(64),
            defaultValue: 'Street Drift',
            allowNull: false,
        },
        settings: {
            type: DataTypes.TEXT('long'),
            allowNull: false,
            defaultValue: '{}',
        },
        presets: {
            type: DataTypes.TEXT('long'),
            allowNull: false,
            defaultValue: '[]',
        },
    }, {
        timestamps: false,
    });

    return model;
};
