module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('SecurityZone', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: 'Security Zone',
        },
        x: {
            type: DataTypes.FLOAT(11),
            allowNull: false,
            defaultValue: 0,
        },
        y: {
            type: DataTypes.FLOAT(11),
            allowNull: false,
            defaultValue: 0,
        },
        z: {
            type: DataTypes.FLOAT(11),
            allowNull: false,
            defaultValue: 0,
        },
        dimension: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0,
        },
        radius: {
            type: DataTypes.FLOAT(11),
            allowNull: false,
            defaultValue: 100,
        },
        guardCount: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 3,
        },
        chiefCount: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 1,
        },
    }, {
        timestamps: false,
        tableName: 'security_zones',
    });

    return model;
};
