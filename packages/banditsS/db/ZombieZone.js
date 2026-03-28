module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('ZombieZone', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: 'Zombie Zone',
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
            defaultValue: 30,
        },
        zombieCount: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 3,
        },
        respawnMs: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 60000,
        },
        maxZombieCount: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 18,
        },
        waveSize: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 3,
        },
        points: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
            defaultValue: null,
        },
    }, {
        timestamps: false,
        tableName: 'zombie_zones',
    });

    return model;
};
