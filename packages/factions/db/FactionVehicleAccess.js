module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FactionVehicleAccess", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        factionId: {
            type: DataTypes.INTEGER(11),
            allowNull: false
        },
        rank: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 10
        }
    }, {
        timestamps: false
    });

    return model;
};
