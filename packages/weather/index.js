"use strict";

let timer = call('timer');
let utils = call('utils');

const WEATHER_CHANGE_INTERVAL = 15 * 60 * 1000;
const SUNNY_CHANCE = 60;
const DEFAULT_TEMPERATURE = 20;

const WEATHER_SEQUENCE = [
    { icon: "clear", summary: "Ясно", gameWeather: "CLEAR", minTemp: 20, maxTemp: 30 },
    { icon: "partly-cloudy", summary: "Малооблачно", gameWeather: "EXTRASUNNY", minTemp: 18, maxTemp: 28 },
    { icon: "cloudy", summary: "Облачно", gameWeather: "CLOUDS", minTemp: 14, maxTemp: 22 },
    { icon: "overcast", summary: "Пасмурно", gameWeather: "OVERCAST", minTemp: 10, maxTemp: 18 },
    { icon: "rain", summary: "Дождь", gameWeather: "RAIN", minTemp: 8, maxTemp: 16 },
    { icon: "thunderstorm", summary: "Гроза", gameWeather: "THUNDER", minTemp: 6, maxTemp: 14 }
];

const SUNNY_WEATHERS = ["clear", "partly-cloudy"];

let customTemperature = null;
let currentWeather = WEATHER_SEQUENCE[0];
let weatherTimer = null;

function pickRandomWeather() {
    const isSunny = utils.randomInteger(1, 100) <= SUNNY_CHANCE;

    if (isSunny) {
        return WEATHER_SEQUENCE.find((w) => w.icon === SUNNY_WEATHERS[utils.randomInteger(0, SUNNY_WEATHERS.length - 1)]);
    }

    const nonSunny = WEATHER_SEQUENCE.filter((w) => !SUNNY_WEATHERS.includes(w.icon));
    return nonSunny[utils.randomInteger(0, nonSunny.length - 1)];
}

function normalizeWeather(weather) {
    if (!weather || typeof weather !== 'object') {
        return WEATHER_SEQUENCE[0];
    }

    return {
        ...WEATHER_SEQUENCE[0],
        ...weather
    };
}

module.exports = {
    customWeather: false,
    customWeatherType: 'winter',
    currentWeatherName: 'CLEAR',

    init() {
        this.setWeatherFromRotation();
        this.startWeatherRotation();
    },

    startWeatherRotation() {
        if (weatherTimer) timer.remove(weatherTimer);
        weatherTimer = timer.addInterval(() => {
            try {
                this.setWeatherFromRotation();
            } catch (e) {
                console.log(e);
            }
        }, WEATHER_CHANGE_INTERVAL);
    },

    setWeatherFromRotation() {
        if (!this.customWeather) {
            currentWeather = pickRandomWeather();
        } else {
            currentWeather = this.generateCustomWeather();
        }

        currentWeather = normalizeWeather(currentWeather);

        this.currentWeatherName = currentWeather.gameWeather || 'CLEAR';
        mp.world.weather = this.currentWeatherName;

        const forecast = this.getCurrentWeather();
        mp.players.forEach((p) => p.call('weather.info.update', [forecast]));

        console.log(`[WEATHER] Новая погода: ${forecast.summary} (${this.currentWeatherName}), t=${forecast.temperature}`);
    },

    setCustomTemperature(temp) {
        customTemperature = temp;
        mp.players.forEach((p) => p.call('weather.info.update', [this.getCurrentWeather()]));
    },

    resetCustomTemperature() {
        customTemperature = null;
        mp.players.forEach((p) => p.call('weather.info.update', [this.getCurrentWeather()]));
    },

    getCurrentWeather() {
        currentWeather = normalizeWeather(currentWeather);

        const weatherInfo = {
            summary: currentWeather.summary,
            icon: currentWeather.icon,
            temperature: customTemperature != null
                ? customTemperature
                : utils.randomInteger(currentWeather.minTemp || DEFAULT_TEMPERATURE, currentWeather.maxTemp || DEFAULT_TEMPERATURE)
        };

        return weatherInfo;
    },

    forceWeather(icon) {
        const weather = WEATHER_SEQUENCE.find((w) => w.icon === icon);
        if (!weather) return false;

        currentWeather = weather;
        this.currentWeatherName = weather.gameWeather;
        mp.world.weather = weather.gameWeather;
        mp.players.forEach((p) => p.call('weather.info.update', [this.getCurrentWeather()]));
        return true;
    },

    getAvailableWeatherIcons() {
        return WEATHER_SEQUENCE.map((w) => w.icon);
    },

    generateCustomWeather() {
        if (this.customWeatherType === 'winter') {
            return {
                summary: 'Снег',
                temperature: utils.randomInteger(-15, -5),
                icon: 'snow',
                gameWeather: 'XMAS',
                minTemp: -15,
                maxTemp: -5
            };
        }

        return WEATHER_SEQUENCE[0];
    }
};
