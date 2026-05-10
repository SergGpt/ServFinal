module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("FishingRecord", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        characterId: {
            type: DataTypes.INTEGER(11),
            allowNull: true
        },
        playerName: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        fishName: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        weight: {
            type: DataTypes.FLOAT(10),
            allowNull: false
        },
        time: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0
        },
        caughtAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        timestamps: false,
        indexes: [
            { fields: ["weight"] },
            { fields: ["caughtAt"] }
        ]
    });

    return model;
};
