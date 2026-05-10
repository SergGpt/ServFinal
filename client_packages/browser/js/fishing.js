let intervalFishingB;
let timeoutFishingGame;
let intervalFishingTimer;

var fishing = new Vue({
    el: '#fishing',
    data: {
        show: false,
        position: 0,
        zone: null,
        isStarted: false,
        isFetch: false,
        direction: 'right',
        weight: null,
        fishName: null,
        isEnd: false,
        success: false,
        targets: [],
        fishClicks: 0,
        junkClicks: 0,
        targetCount: 5,
        junkCount: 9,
        targetSizeBonus: 0,
        fishSpeedClass: 'normal',
        fishBehavior: null,
        weightBonus: 0,
        rodQuality: null,
        weatherInfo: null,
        biteInfo: null,
        depthInfo: null,
        records: [],
        timeLimit: 12000,
        startedAt: null,
        elapsed: 0,
        resultQuality: 0,
        resultWeight: null,
        ended: false,
        junkIcons: ['🪝', '🥾', '🪵', '🥫', '🦀', '🧴'],
    },
    computed: {
        elapsedSeconds() {
            return (this.elapsed / 1000).toFixed(2);
        },
        leftSeconds() {
            let left = Math.max(0, this.timeLimit - this.elapsed);
            return (left / 1000).toFixed(1);
        },
        progressWidth() {
            return `${Math.min(100, (this.fishClicks / this.targetCount) * 100)}%`;
        },
        hasRecords() {
            return this.records && this.records.length > 0;
        }
    },
    watch: {
        position: function (newPosition, oldPosition) {
            if (oldPosition === 98) {
                this.direction = 'left';
            }

            if (oldPosition === 1) {
                if (this.direction === 'left') {
                    this.finishGame(false);
                }

                this.direction = 'right';
            }
        },
    },
    methods: {
        setWaitInfo(minigame = {}) {
            this.rodQuality = minigame.rod || null;
            this.weatherInfo = minigame.weather || null;
            this.biteInfo = minigame.bite || null;
            this.depthInfo = minigame.depth || null;
            this.records = minigame.records || [];
        },
        moveCursor() {
            if (this.direction === 'right') {
                this.position++;
            }

            if (this.direction === 'left') {
                this.position--;
            }
        },
        fishFetch(payload, zone, weight, name) {
            clearInterval(intervalFishingB);

            if (typeof payload !== 'object') {
                payload = {
                    speed: payload,
                    zone,
                    weight,
                    name,
                    minigame: {},
                };
            }

            const minigame = payload.minigame || {};

            this.isFetch = true;
            this.zone = payload.zone;
            this.weight = payload.weight;
            this.fishName = payload.name;
            this.targetCount = minigame.targetCount || 5;
            this.junkCount = minigame.junkCount || 9;
            this.timeLimit = minigame.timeLimit || 12000;
            this.targetSizeBonus = minigame.targetSizeBonus || 0;
            this.fishSpeedClass = minigame.speedClass || 'normal';
            this.fishBehavior = minigame.behavior || null;
            this.weightBonus = minigame.weightBonus || 0;
            this.rodQuality = minigame.rod || null;
            this.weatherInfo = minigame.weather || null;
            this.biteInfo = minigame.bite || null;
            this.depthInfo = minigame.depth || null;
            this.records = minigame.records || [];
            this.startClickerGame();
        },
        startClickerGame() {
            clearTimeout(timeoutFishingGame);
            clearInterval(intervalFishingTimer);

            this.targets = this.generateTargets();
            this.fishClicks = 0;
            this.junkClicks = 0;
            this.elapsed = 0;
            this.resultQuality = 0;
            this.resultWeight = null;
            this.ended = false;
            this.success = false;
            this.startedAt = Date.now();

            intervalFishingTimer = setInterval(() => {
                this.elapsed = Date.now() - this.startedAt;
            }, 50);

            timeoutFishingGame = setTimeout(() => {
                this.finishGame(false);
            }, this.timeLimit);
        },
        generateTargets() {
            let items = [];
            let fishCount = this.targetCount;
            let junkCount = this.junkCount;

            for (let i = 0; i < fishCount; i++) {
                items.push(this.createTarget(i, 'fish'));
            }

            for (let i = 0; i < junkCount; i++) {
                items.push(this.createTarget(fishCount + i, 'junk'));
            }

            return items.sort(() => Math.random() - 0.5);
        },
        createTarget(id, type) {
            return {
                id,
                type,
                caught: false,
                x: 7 + Math.random() * 82,
                y: 13 + Math.random() * 70,
                size: type === 'fish' ? Math.max(3.1, 4.3 + this.targetSizeBonus + Math.random() * 1.2) : 3.5 + Math.random() * 1.1,
                rotate: -22 + Math.random() * 44,
                delay: Math.random() * 0.25,
                speedClass: type === 'fish' ? this.fishSpeedClass : 'junk',
                icon: this.junkIcons[Math.floor(Math.random() * this.junkIcons.length)],
            };
        },
        clickTarget(target) {
            if (this.ended || target.caught) return;

            if (target.type === 'fish') {
                target.caught = true;
                this.fishClicks++;

                if (this.fishClicks >= this.targetCount) {
                    this.finishGame(true);
                }
                return;
            }

            this.junkClicks++;
            target.caught = true;
        },
        getQuality(time) {
            let safeTime = Math.max(1200, Math.min(this.timeLimit, time));
            let progress = 1 - ((safeTime - 1200) / (this.timeLimit - 1200));
            return Math.max(0.75, Math.min(1.35, 0.75 + progress * 0.6));
        },
        finishGame(result) {
            if (this.ended) return;

            clearInterval(intervalFishingB);
            clearTimeout(timeoutFishingGame);
            clearInterval(intervalFishingTimer);

            this.ended = true;
            this.isEnd = true;
            this.elapsed = this.startedAt ? Date.now() - this.startedAt : this.elapsed;
            this.success = result && this.fishClicks >= this.targetCount;
            this.resultQuality = this.success ? this.getQuality(this.elapsed) : 0;
            this.resultWeight = this.success ? (this.weight * this.resultQuality * (1 + this.weightBonus)).toFixed(1) : null;

            mp.trigger('fishing.game.end', JSON.stringify({
                success: this.success,
                time: this.elapsed,
                fish: this.fishClicks,
                target: this.targetCount,
                quality: this.resultQuality,
                junk: this.junkClicks,
            }));
        },
        endFishing() {
            this.finishGame(this.fishClicks >= this.targetCount);
        },
        clearData() {
            clearInterval(intervalFishingB);
            clearTimeout(timeoutFishingGame);
            clearInterval(intervalFishingTimer);

            this.position = 0;
            this.weight = null;
            this.fishName = null;
            this.zone = null;
            this.direction = 'right';
            this.isStarted = false;
            this.isFetch = false;
            this.isEnd = false;
            this.success = false;
            this.targets = [];
            this.fishClicks = 0;
            this.junkClicks = 0;
            this.targetCount = 5;
            this.junkCount = 9;
            this.targetSizeBonus = 0;
            this.fishSpeedClass = 'normal';
            this.fishBehavior = null;
            this.weightBonus = 0;
            this.rodQuality = null;
            this.weatherInfo = null;
            this.biteInfo = null;
            this.depthInfo = null;
            this.records = [];
            this.timeLimit = 12000;
            this.startedAt = null;
            this.elapsed = 0;
            this.resultQuality = 0;
            this.resultWeight = null;
            this.ended = false;
        }
    },
});

// fishing.show = true;
// fishing.isStarted = true;
// setTimeout(() => fishing.fishFetch(20, 20, 3, 'Окунь'), 10);
