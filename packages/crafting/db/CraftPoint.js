module.exports = (sequelize, DataTypes) => {
    const model = sequelize.define("CraftPoint", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        type: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'food'
        },
        variant: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'survivor_camp'
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
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        radius: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 2.0
        }
    }, {
        timestamps: false
    });

    return model;
};
