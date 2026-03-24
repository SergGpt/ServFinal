let weather = require('./index.js');

module.exports = {
    '/gettemp': {
        args: '',
        description: 'Узнать текущую температуру',
        access: 6,
        handler: (player, args, out) => {
            let temp = weather.getCurrentWeather().temperature;
            out.info(`Температура: ${temp}`, player);
        }
    },
    '/settemp': {
        args: '[градусы]',
        description: 'Установить кастомную температуру',
        access: 6,
        handler: (player, args, out) => {
            weather.setCustomTemperature(parseInt(args[0]));
            out.info(`${player.name} установил температуру ${args[0]} градусов`);
        }
    },
    '/resettemp': {
        args: '',
        description: 'Возобновить обновление температуры',
        access: 6,
        handler: (player, args, out) => {
            weather.resetCustomTemperature();
            out.info(`${player.name} возобновил обновление температуры`);
        }
    },
    '/setweather': {
        args: '[тип]',
        description: 'Принудительно установить погоду (clear, partly-cloudy, cloudy, overcast, rain, thunderstorm)',
        access: 6,
        handler: (player, args, out) => {
            const weatherIcon = args[0];
            if (!weather.forceWeather(weatherIcon)) {
                return out.error(`Неизвестная погода. Доступно: ${weather.getAvailableWeatherIcons().join(', ')}`, player);
            }
            out.info(`${player.name} установил погоду ${weatherIcon}`);
        }
    },
    '/nextweather': {
        args: '',
        description: 'Сразу переключить погоду по ротации',
        access: 6,
        handler: (player, args, out) => {
            weather.setWeatherFromRotation();
            out.info(`${player.name} запустил принудительную смену погоды`);
        }
    }
}
