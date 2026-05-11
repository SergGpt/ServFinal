module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("CargoDeliveryRoute", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        pickupName: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'Точка погрузки'
        },
        pickupX: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        pickupY: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        pickupZ: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        dropoffs: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '[]'
        },
        reward: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 15000
        },
        isActive: {
            type: DataTypes.INTEGER(1),
            allowNull: false,
            defaultValue: 1
        },
    }, { timestamps: false });

    return model;
};
