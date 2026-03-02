module.exports = (sequelize, DataTypes) => {
    const toTexturesArray = (val) => {
        if (Array.isArray(val)) return val.map(Number).filter(Number.isFinite);
        if (val == null) return [];

        if (typeof val === 'number') {
            const count = Math.max(0, parseInt(val));
            return Array.from({ length: count }, (_, i) => i);
        }

        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed.length) return [];

            if (/^\d+$/.test(trimmed)) {
                const count = parseInt(trimmed);
                return Array.from({ length: count }, (_, i) => i);
            }

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
            } catch (e) {
                // fallback to CSV-like values
            }

            return trimmed
                .split(',')
                .map(v => parseInt(v.trim()))
                .filter(Number.isFinite);
        }

        return [];
    };

    const model = sequelize.define("ClothesBag", {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        variation: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        capacity: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
            defaultValue: 0,
        },
        price: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        textures: {
            type: DataTypes.STRING(128),
            allowNull: false,
            get() {
                const val = this.getDataValue('textures');
                return toTexturesArray(val);
            },
            set(val) {
                const textures = toTexturesArray(val);
                this.setDataValue('textures', JSON.stringify(textures));
            }
        },
        sex: {
            type: DataTypes.TINYINT(1),
            allowNull: false,
        },
        class: {
            type: DataTypes.INTEGER(11),
            defaultValue: 1,
            allowNull: false,
        }
    }, {
        timestamps: false,
        tableName: 'clothesbags'
    });

    return model;
};
