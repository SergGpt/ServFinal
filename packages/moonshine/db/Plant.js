module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define('MoonshinePlant', {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        plotId: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        stage: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'seeded',
        },
        ownerId: {
            type: DataTypes.INTEGER(11),
            allowNull: true,
        },
        ownerName: {
            type: DataTypes.STRING(64),
            allowNull: true,
        },
        seededAt: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        stageStartedAt: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        nextStageAt: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        graceEndsAt: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        witherAt: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['plotId'],
            },
        ],
    });

    return model;
};
