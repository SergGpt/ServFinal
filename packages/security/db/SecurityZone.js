module.exports = (sequelize, DataTypes) => {

    const model = sequelize.define("SecurityZone", {
        id: {
            type: DataTypes.STRING(64),
            primaryKey: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(128),
            defaultValue: null,
            allowNull: true,
        },
        dimension: {
            type: DataTypes.INTEGER(11),
            defaultValue: 0,
            allowNull: false,
        },
        data: {
            type: DataTypes.TEXT("long"),
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.BIGINT(20),
            defaultValue: null,
            allowNull: true,
        },
    }, {
        timestamps: false,
        tableName: "guard_checkpoint_posts",
        hooks: {
            afterCreate: (zone) => {
                console.log(`[SECURITY] new DB record inserted for zone id=${zone.id}, name=${zone.name || "-"}, dimension=${zone.dimension}.`);
            },
        },
    });

    return model;
};
