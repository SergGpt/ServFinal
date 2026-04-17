module.exports = (sequelize, DataTypes) => {
    return sequelize.define('NpcAttakZone', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: 'NpcAttakZone',
        },
        dimension: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0,
        },
        points: {
            type: DataTypes.TEXT('long'),
            allowNull: false,
            defaultValue: '[]',
        },
        minZ: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        maxZ: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        enabled: {
            type: DataTypes.INTEGER(1),
            allowNull: false,
            defaultValue: 1,
        },
    }, {
        timestamps: false,
        tableName: 'npc_attak_zones',
    });
};
