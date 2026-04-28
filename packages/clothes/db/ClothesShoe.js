module.exports = (sequelize, DataTypes) => {
    const toTexturesArray = (val) => {
        if (Array.isArray(val)) return val.map(Number).filter(Number.isFinite);
        if (val == null) return [0];

        if (typeof val === 'number') {
            const count = parseInt(val);
            if (!Number.isFinite(count) || count < 0) return [0];
            return Array.from({ length: count + 1 }, (_, i) => i);
        }

        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed.length) return [0];

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    const arr = parsed.map(Number).filter(Number.isFinite);
                    return arr.length ? arr : [0];
                }
                if (Number.isFinite(parsed)) {
                    const count = parseInt(parsed);
                    if (count < 0) return [0];
                    return Array.from({ length: count + 1 }, (_, i) => i);
                }
            } catch (e) {
                // fallback below
            }

            const csv = trimmed
                .split(',')
                .map(v => parseInt(v.trim()))
                .filter(Number.isFinite);
            if (csv.length) return csv;
        }

        return [0];
    };

    const toClimeArray = (val) => {
        if (Array.isArray(val)) return val.map(Number).filter(Number.isFinite).slice(0, 2);
        if (val == null) return [-10, 45];

        if (typeof val === 'number') {
            if (!Number.isFinite(val)) return [-10, 45];
            return [val, val];
        }

        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed.length) return [-10, 45];

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite).slice(0, 2);
                if (Number.isFinite(parsed)) return [parsed, parsed];
            } catch (e) {
                // fallback below
            }

            const fromCsv = trimmed
                .split(',')
                .map(v => parseInt(v.trim()))
                .filter(Number.isFinite)
                .slice(0, 2);
            if (fromCsv.length === 2) return fromCsv;
            if (fromCsv.length === 1) return [fromCsv[0], fromCsv[0]];
        }

        return [-10, 45];
    };

    const model = sequelize.define("ClothesShoe", {
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
        price: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },
        clime: {
            type: DataTypes.STRING(20),
            allowNull: false,
            get() {
                const val = this.getDataValue('clime');
                return toClimeArray(val);
            },
            set(val) {
                const clime = toClimeArray(val);
                this.setDataValue('clime', JSON.stringify(clime));
            }
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
        tableName: "clothesshoe" // ← указываем точное имя таблицы
    });

    return model;
};
