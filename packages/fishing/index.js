let money;
let notifs;
let inventory;
let jobs;
let timer;

const ROD_ID = 5;
const FISHING_RECORDS_LIMIT = 5;

const port = {
    x: -167.7662,
    y: -2687.0261,
    z: 6.0107,
};

module.exports = {
    async init() {
        money = call('money');
        notifs = call('notifications');
        inventory = call('inventory');
        jobs = call('jobs');
        timer = call('timer');
        await this.initFishersFromDB();
        await this.initFishesFromDB();
        await this.resetExpiredRecords();
        await this.loadRecordsFromDB();
        this.startRecordsResetTimer();
        this.createPortPoint();
    },

    rodPrice: 100,

    fishes: [],

    fishers: [],

    records: [],

    recordsResetTimer: null,
    lastRecordsResetKey: null,

    colshapes: [],

    portPriceMultiplier: 1.5,
    exp: 0.05,
    // Прибавка к цене предмета в % (0.0-1.0) при фулл скилле
    priceBonus: 0.5,

    getRodId() {
        return ROD_ID;
    },

    getRodQuality(health = 100) {
        const safeHealth = Math.max(0, Math.min(100, Number(health) || 0));

        if (safeHealth >= 80) {
            return {
                label: 'Отличная',
                level: 'high',
                timeBonus: 1400,
                junkBonus: -2,
                sizeBonus: 0.45,
                weightBonus: 0.08,
            };
        }

        if (safeHealth >= 45) {
            return {
                label: 'Нормальная',
                level: 'normal',
                timeBonus: 500,
                junkBonus: 0,
                sizeBonus: 0.15,
                weightBonus: 0.03,
            };
        }

        return {
            label: 'Изношенная',
            level: 'low',
            timeBonus: -900,
            junkBonus: 2,
            sizeBonus: -0.25,
            weightBonus: -0.05,
        };
    },

    getWeatherEffect(currentWeather) {
        const icon = currentWeather && currentWeather.icon ? currentWeather.icon : 'clear';
        const effects = {
            clear: { label: 'Ясно', timeBonus: 0, junkBonus: 0, biteBonus: 0, weightBonus: 0 },
            'partly-cloudy': { label: 'Малооблачно', timeBonus: 300, junkBonus: 0, biteBonus: -1, weightBonus: 0.02 },
            cloudy: { label: 'Облачно', timeBonus: 500, junkBonus: -1, biteBonus: -1, weightBonus: 0.03 },
            overcast: { label: 'Пасмурно', timeBonus: 700, junkBonus: -1, biteBonus: -2, weightBonus: 0.04 },
            rain: { label: 'Дождь', timeBonus: 1000, junkBonus: -2, biteBonus: -3, weightBonus: 0.07 },
            thunderstorm: { label: 'Гроза', timeBonus: -700, junkBonus: 2, biteBonus: -4, weightBonus: 0.12 },
            snow: { label: 'Снег', timeBonus: -500, junkBonus: 1, biteBonus: 1, weightBonus: 0.05 },
        };

        return effects[icon] || effects.clear;
    },

    getFishBehavior(fish) {
        const minWeight = Number(fish && fish.minWeight) || 0;
        const maxWeight = Number(fish && fish.maxWeight) || 0;
        const avgWeight = (minWeight + maxWeight) / 2;

        if (avgWeight >= 18) {
            return {
                type: 'heavy',
                label: 'Крупная рыба',
                description: 'Меньше целей, но они крупнее и медленнее.',
                targetCount: 4,
                junkCount: 8,
                timeLimit: 12500,
                sizeBonus: 0.85,
                speedClass: 'slow',
            };
        }

        if (avgWeight >= 9) {
            return {
                type: 'deep',
                label: 'Глубинная рыба',
                description: 'Средняя сложность и чуть больше хлама.',
                targetCount: 5,
                junkCount: 10,
                timeLimit: 11800,
                sizeBonus: 0.2,
                speedClass: 'normal',
            };
        }

        if (avgWeight <= 3) {
            return {
                type: 'swift',
                label: 'Юркая рыба',
                description: 'Целей больше, они мельче и двигаются быстрее.',
                targetCount: 6,
                junkCount: 9,
                timeLimit: 11000,
                sizeBonus: -0.35,
                speedClass: 'fast',
            };
        }

        return {
            type: 'common',
            label: 'Обычная рыба',
            description: 'Сбалансированная поклёвка без резких сюрпризов.',
            targetCount: 5,
            junkCount: 9,
            timeLimit: 12000,
            sizeBonus: 0,
            speedClass: 'normal',
        };
    },

    async buildMinigameConfig(fish, rodHealth, currentWeather) {
        const behavior = this.getFishBehavior(fish);
        const rodQuality = this.getRodQuality(rodHealth);
        const weatherEffect = this.getWeatherEffect(currentWeather);
        const timeLimit = Math.max(8500, behavior.timeLimit + rodQuality.timeBonus + weatherEffect.timeBonus);
        const junkCount = Math.max(5, behavior.junkCount + rodQuality.junkBonus + weatherEffect.junkBonus);
        const targetSizeBonus = behavior.sizeBonus + rodQuality.sizeBonus;
        const weightBonus = rodQuality.weightBonus + weatherEffect.weightBonus;

        return {
            targetCount: behavior.targetCount,
            junkCount,
            timeLimit,
            targetSizeBonus,
            speedClass: behavior.speedClass,
            weightBonus,
            behavior: {
                type: behavior.type,
                label: behavior.label,
                description: behavior.description,
            },
            rod: {
                label: rodQuality.label,
                level: rodQuality.level,
            },
            weather: {
                label: weatherEffect.label,
                icon: currentWeather && currentWeather.icon ? currentWeather.icon : 'clear',
            },
            records: await this.getRecords(),
        };
    },

    getRecordPeriodStart(date = new Date()) {
        const start = new Date(date);
        start.setHours(12, 0, 0, 0);

        if (date < start) {
            start.setDate(start.getDate() - 1);
        }

        return start;
    },

    getRecordResetKey(date = new Date()) {
        const start = this.getRecordPeriodStart(date);
        return `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
    },

    formatRecord(record) {
        return {
            playerName: record.playerName,
            fishName: record.fishName,
            weight: Number(record.weight) || 0,
            time: Number(record.time) || 0,
            date: record.caughtAt ? new Date(record.caughtAt).getTime() : Date.now(),
        };
    },

    async loadRecordsFromDB() {
        const records = await db.Models.FishingRecord.findAll({
            where: {
                caughtAt: { [Op.gte]: this.getRecordPeriodStart() }
            },
            order: [['weight', 'DESC'], ['time', 'ASC']],
            limit: FISHING_RECORDS_LIMIT,
            raw: true
        });

        this.records = records.map((record) => this.formatRecord(record));
        return this.records;
    },

    async getRecords() {
        await this.loadRecordsFromDB();
        return this.records.slice(0, FISHING_RECORDS_LIMIT);
    },

    async resetExpiredRecords() {
        await db.Models.FishingRecord.destroy({
            where: {
                caughtAt: { [Op.lt]: this.getRecordPeriodStart() }
            }
        });
    },

    async resetRecords(reason = 'manual') {
        await db.Models.FishingRecord.destroy({ where: {} });
        this.records = [];
        this.lastRecordsResetKey = this.getRecordResetKey();
        console.log(`[FISHING] Records reset (${reason})`);
        return this.records;
    },

    startRecordsResetTimer() {
        if (this.recordsResetTimer) timer.remove(this.recordsResetTimer);

        this.lastRecordsResetKey = null;
        this.recordsResetTimer = timer.addInterval(async () => {
            try {
                const now = new Date();
                if (now.getHours() !== 12 || now.getMinutes() !== 0) return;

                const resetKey = this.getRecordResetKey(now);
                if (this.lastRecordsResetKey === resetKey) return;

                await this.resetExpiredRecords();
                await this.loadRecordsFromDB();
                this.lastRecordsResetKey = resetKey;
                console.log('[FISHING] Records daily reset at 12:00');
            } catch (e) {
                console.log(e);
            }
        }, 60000);
    },

    async addRecord(player, fishName, weight, time) {
        await db.Models.FishingRecord.create({
            characterId: player && player.character ? player.character.id : null,
            playerName: player && player.name ? player.name : 'Рыбак',
            fishName,
            weight: Number(weight) || 0,
            time: Number(time) || 0,
            caughtAt: new Date(),
        });

        await this.resetExpiredRecords();
        return this.getRecords();
    },

    async initFishesFromDB() {
        this.fishes = await db.Models.Fish.findAll();
    },

    async initFishersFromDB() {
        this.fishers = await db.Models.Fisher.findAll({
            raw: true
        });

        this.fishers.forEach(fisher => {
            let colshape = this.createFisherColshape(fisher);
            this.colshapes.push(colshape);
            this.createMarker(fisher);
            this.createBlip(fisher);
        });

        // mp.players.forEach(player => {
        //     player.call('fishing.fishers.init', [fishers]);
        // })
    },

    createFisherColshape(fisher) {
        let pos = new mp.Vector3(fisher.x, fisher.y, fisher.z);
        let colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 2);

        colshape.isFisher = true;

        return colshape;
    },

    createMarker(fisher) {
        let heading = fisher.heading + 90;

        let markerX = fisher.x + 0.8 * Math.cos(heading * Math.PI / 180.0);
        let markerY = fisher.y + 0.8 * Math.sin(heading * Math.PI / 180.0);

        mp.markers.new(1, new mp.Vector3(markerX, markerY, fisher.z - 1.2), 0.4, {
            direction: new mp.Vector3(markerX, markerY, fisher.z),
            rotation: 0,
            color: [255, 255, 125, 200],
            visible: true,
            dimension: 0
        });
    },

    createBlip(blip) {
        mp.blips.new(68, new mp.Vector3(blip.x, blip.y, blip.z), {
            name: 'Рыбалка',
            shortRange: true,
            color: 26
        });
    },

    createPortPoint() {
        mp.blips.new(108, new mp.Vector3(port.x, port.y, port.z),
            {
                name: `Сбыт рыбы`,
                shortRange: true,
                color: 26
            });
        mp.markers.new(1, new mp.Vector3(port.x, port.y, port.z - 1), 0.4,
            {
                direction: new mp.Vector3(port.x, port.y, port.z - 1),
                rotation: 0,
                color: [255, 255, 125, 200],
                visible: true,
                dimension: 0
            });
        const shape = mp.colshapes.newSphere(port.x, port.y, port.z, 2);
        shape.pos = new mp.Vector3(port.x, port.y, port.z);
        shape.isFishPortSell = true;
    },

    async buyRod(player) {

        if (player.character.cash < this.rodPrice) {
            return player.call('fishing.rod.buy.ans', [3]);
        }

        inventory.addItem(player, ROD_ID, { health: 100 }, (e) => {
            if (e) return player.call('fishing.rod.buy.ans', [2, e]);

            money.removeCash(player, this.rodPrice, (result) => {
                if (result) {
                    player.call('fishing.rod.buy.ans', [1]);
                    notifs.success(player, "Удочка добавлена в инвентарь", "Рыбалка");
                } else {
                    player.call('fishing.rod.buy.ans', [0]);
                }
            }, `Buy fishing rod by player with id ${player.id}`);
        });
    },

    async sellFish(player, isPort) {
        let fishes = inventory.getArrayByItemId(player, 15);
        let sum = 0;

        if (fishes && fishes.length > 0) {
            fishes.forEach(fish => {
                let fishName = inventory.getParam(fish, 'name').value;
                let fishWeight = inventory.getParam(fish, 'weight').value;
                let fishPrice = this.fishes.find(fish => fish.name == fishName).price;
                sum += fishPrice * fishWeight * 10;
            });

            sum = isPort ? parseInt(this.portPriceMultiplier * sum) : parseInt(sum);
            const exp = jobs.getJobSkill(player, 10).exp;
            sum *= (1 + this.priceBonus * (exp / 100));
            sum = parseInt(sum);

            money.addCash(player, sum * jobs.bonusPay, async function (result) {
                if (result) {
                    fishes.forEach(fish => inventory.deleteItem(player, fish.id));
                    player.call('fishing.fish.sell.ans', [1]);
                    return notifs.success(player, `Вы продали рыбы на ${sum}$`, 'Продажа')
                } else {
                    player.call('fishing.fish.sell.ans', [0]);
                    return notifs.error(player, 'Ошибка', 'Продажа');
                }
            }, `Sell fish by player with id ${player.id} x${jobs.bonusPay}`)
        } else {
            player.call('fishing.fish.sell.ans', [0]);
            return notifs.error(player, 'У вас нет рыбы', 'Ошибка');
        }
    },

    getFisherPosition(id) {
        let fisher = this.fishers.find(fisher => fisher.id == id);

        if (fisher) {
            return {
                x: fisher.x,
                y: fisher.y,
                z: fisher.z
            };
        }
    },
    addJobExp(player) {
        var skill = jobs.getJobSkill(player, 10);
        jobs.setJobExp(player, skill, skill.exp + this.exp);
    },
}