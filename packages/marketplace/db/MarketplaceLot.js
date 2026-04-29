module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("MarketplaceLot", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        sellerCharacterId: {
            type: DataTypes.INTEGER(11),
            allowNull: false
        },
        sellerName: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        title: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        description: {
            type: DataTypes.STRING(512),
            allowNull: true
        },
        price: {
            type: DataTypes.INTEGER(11),
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: "active"
        },
        buyerCharacterId: {
            type: DataTypes.INTEGER(11),
            allowNull: true
        },
        lotType: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: "item"
        },
        lotTargetId: {
            type: DataTypes.INTEGER(11),
            allowNull: true
        },
        lotPayload: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        timestamps: true,
        tableName: "marketplace_lots"
    });

    return model;
};
