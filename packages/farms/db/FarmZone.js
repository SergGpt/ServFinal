module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('FarmZone', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        x: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
        },
        y: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
        },
        z: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
        },
        dx: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 10,
        },
        dy: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 10,
        },
        dz: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 5,
        },
        dimension: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        timestamps: false,
        tableName: 'farm_zones',
    });

    return model;
};
