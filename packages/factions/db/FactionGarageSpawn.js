module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FactionGarageSpawn", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        factionId: {
            type: DataTypes.INTEGER(11),
            allowNull: false
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
        h: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0
        },
        d: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0
        }
    }, {
        timestamps: false
    });

    return model;
};
