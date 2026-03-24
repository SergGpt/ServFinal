let bizes;

let customs;
let customsRuntime = new Map();

let modsConfig = {
    "11": "engineType",
    "12": "brakeType",
    "13": "transmissionType",
    "15": "suspensionType",
    "16": "armourType",
    "18": "turbo",
    "0": "spoiler",
    "1": "frontBumper",
    "2": "rearBumper",
    "3": "sideSkirt",
    "4": "exhaust",
    "5": "frame",
    "6": "grille",
    "7": "hood",
    "8": "fender",
    "9": "rightFender",
    "10": "roof",
    "23": "frontWheels",
    "48": "livery",
    "55": "windowTint",
    "22": "xenon",
    "62": "plateHolder",
    "100": "neon"
}

let priceConfig = { 
    repair: 125,
    color: 100,
    default: 0.005,
    engine: 0.02,
    brake: 0.02,
    transmission: 0.01,
    suspension: 0.01,
    armour: 0.03
}

let colorsPrice = priceConfig.color;

module.exports = {
    business: {
        type: 9,
        name: "Los Santos Customs",
        productName: "Детали",
    },
    rentPerDayMultiplier: 0.01,
    minPriceMultiplier: 1.0,
    maxPriceMultiplier: 2.0,
    productPrice: 20,
    elementsToSync: ['62', '100', '22'],
    defaultBoostValue: 5,
    powerMultipliers: {},
    brakeMultipliers: {},
    async init() {
        bizes = call('bizes');
        await this.loadCustomsFromDB();
        await this.loadMultipliers();
    },
    async loadCustomsFromDB() {
        customs = await db.Models.LosSantosCustoms.findAll();
        for (var i = 0; i < customs.length; i++) {
            this.createLSC(customs[i]);
        }
        console.log(`[TUNING] Загружено LSC: ${i}`);
    },
    async loadMultipliers() {
        let multipliers = await db.Models.VehicleMultiplier.findAll();
        multipliers.forEach(x => {
            let model = x.model;
            this.powerMultipliers[model] = x.power;
            this.brakeMultipliers[model] = x.brake;
        });
        console.log(`[TUNING] Загружены показатели транспорта: ${multipliers.length} шт.`);
    },
    createLSC(LSC) {
        this.destroyLSC(LSC.id);

        let blip = mp.blips.new(72, new mp.Vector3(LSC.x, LSC.y, LSC.z),
            {
                name: 'Los Santos Customs',
                color: 0,
                shortRange: true,
            });
        let shape = mp.colshapes.newSphere(LSC.x, LSC.y, LSC.z, 4);

        shape.isCustoms = true;
        shape.customsId = LSC.id;
        customsRuntime.set(LSC.id, { blip, shape });
    },
    destroyLSC(id) {
        let runtime = customsRuntime.get(id);
        if (!runtime) return;
        if (runtime.blip) runtime.blip.destroy();
        if (runtime.shape) runtime.shape.destroy();
        customsRuntime.delete(id);
    },
    getCustomsDataById(id) {
        return customs.find(x => x.id == id);
    },
    async createCustoms(name, price, enterPos, tunePos, tuneH, returnPos, returnH) {
        let bizId = await bizes.createBiz(name, price, this.business.type, enterPos);
        let LSC = await db.Models.LosSantosCustoms.create({
            bizId,
            x: enterPos.x,
            y: enterPos.y,
            z: enterPos.z,
            tuneX: tunePos.x,
            tuneY: tunePos.y,
            tuneZ: tunePos.z,
            tuneH,
            returnX: returnPos.x,
            returnY: returnPos.y,
            returnZ: returnPos.z,
            returnH,
            priceMultiplier: 1.0
        });
        customs.push(LSC);
        this.createLSC(LSC);
        return LSC;
    },
    async updateCustomsPoint(id, pointName, position, heading) {
        let LSC = this.getCustomsDataById(id);
        if (!LSC) return null;

        let updateData = {};
        switch (pointName) {
            case 'enter':
                updateData = { x: position.x, y: position.y, z: position.z };
                break;
            case 'tune':
                updateData = { tuneX: position.x, tuneY: position.y, tuneZ: position.z, tuneH: heading };
                break;
            case 'return':
                updateData = { returnX: position.x, returnY: position.y, returnZ: position.z, returnH: heading };
                break;
            default:
                return null;
        }

        await LSC.update(updateData);
        if (pointName === 'enter') this.createLSC(LSC);
        return LSC;
    },
    getModsConfig() {
        return modsConfig;
    },
    setTuning(vehicle) {
        for (let key in modsConfig) {
            let modType = parseInt(key);
            let modIndex = vehicle.tuning[modsConfig[key]];
            if (modIndex != -1) {
                if (this.elementsToSync.includes(key)) {
                    this.syncMod(vehicle, key, modIndex);
                } else {
                    vehicle.setMod(modType, modIndex);
                } 
            }
        }
        this.initBoost(vehicle);
    },
    getModTypeByName(name) {
        for (let key in modsConfig) {
            if (modsConfig[key] == name) return key;
        }
    },
    saveMod(vehicle, typeName, modIndex) {
        vehicle.tuning[typeName] = modIndex;
        vehicle.tuning.save();
    },
    syncMod(vehicle, type, index) {
        vehicle.setVariable(modsConfig[type], index);
    },
    getPriceConfig() {
        return priceConfig;
    },
    calculateModPrice(vehPrice, modType, index) {
        let key;
        let i = index + 1;
        switch (modType) {
            case 11:
                key = 'engine';
                break;
            case 12:
                key = 'brake';
                break;
            case 13:
                key = 'transmission';
                break;
            case 15:
                key = 'suspension';
                break;
            case 16:
                key = 'armour';
                break;
            default:
                key = 'default';
                break;
        }
        return parseInt(priceConfig[key] * vehPrice * i);
    },
    getColorsPrice() {
        return colorsPrice;
    },
    getBizParamsById(id) {
        let lsc = customs.find(x => x.bizId == id);
        if (!lsc) return;
        let params = [
            {
                key: 'priceMultiplier',
                name: 'Наценка на услуги',
                max: this.maxPriceMultiplier,
                min: this.minPriceMultiplier,
                current: lsc.priceMultiplier
            }
        ]
        return params;
    },
    setBizParam(id, key, value) {
        let lsc = customs.find(x => x.bizId == id);
        if (!lsc) return;
        lsc[key] = value;
        lsc.save();
    },
    getProductsAmount(id) {
        let lsc = customs.find(x => x.id == id);
        let bizId = lsc.bizId;
        let products = bizes.getProductsAmount(bizId);
        return products;
    },
    removeProducts(id, products) {
        let lsc = customs.find(x => x.id == id);
        let bizId = lsc.bizId;
        bizes.removeProducts(bizId, products);
    },
    getPriceMultiplier(id) {
        let lsc = customs.find(x => x.id == id);
        return lsc.priceMultiplier;
    },
    updateCashbox(id, money) {
        let lsc = customs.find(x => x.id == id);
        let bizId = lsc.bizId;
        bizes.bizUpdateCashBox(bizId, money);
    },
    calculateProductsNeeded(price) {
        switch (price) {
            // case price <= this.productPrice:
            //     return 1;
            default:
                let products = parseInt((price * 0.8) / this.productPrice);
                return products;
        }
    },
    getIgnoreGetterModsData(vehicle) {
        if (!vehicle.tuning) return;
        return {
            22: vehicle.tuning.xenon,
            55: vehicle.tuning.windowTint,
            62: vehicle.tuning.plateHolder,
            100: vehicle.tuning.neon
        }
    },
    initBoost(vehicle) {
        if (!vehicle || !vehicle.tuning) return;
        let engineValue = vehicle.tuning.engineType;
        if (engineValue === -1) return;
        let boost = (engineValue + 1) * this.defaultBoostValue;
        vehicle.setVariable('boost', boost);
    },
    async updateMultiplier(model, name, value) {
        let instance = await db.Models.VehicleMultiplier.findOrCreate({
            where: {
                model: model,
            }
        });
        instance[0][name] = value;
        instance[0].save();
        mp.players.forEach(p => p.call(`vehicles.${name}Config.update`, [model, value]));
    }
}
