"use strict";
/// Документ по работе с БД, не подключает игнорируемые модули
const Sequelize = require('sequelize');
const fs = require("fs");
let path = require('path');
global.Op = Sequelize.Op;

module.exports = {
    sequelize: null,
    Models: {},
    /// Подключение к БД
    connect: function(callback) {
        console.log("[DATABASE] db connect...");
        this.sequelize = new Sequelize('tribunal', mp.config.dbUser, mp.config.dbPassword, {
            host: '127.0.0.1',
            dialect: 'mysql',
            port: mp.config.dbPort || 3306,
            logging: false,
            pool: {
                max: 100,
                min: 2,
                //acquire: 30000,
                idle: 10000
            },
            dialectOptions: {
                connectTimeout: 30000,
            },
        });

        const tryConnect = async (attempt = 1) => {
            try {
                await this.sequelize.authenticate();
                console.log(`[DATABASE] connection established (attempt ${attempt})`);
                await this.loadModels();
                callback();
            }
            catch (err) {
                console.error(`[DATABASE] connection attempt ${attempt} failed: ${err.message}`);

                const nextAttempt = attempt + 1;
                const retryDelay = Math.min(30000, 5000 * nextAttempt);
                console.log(`[DATABASE] retrying in ${retryDelay / 1000} seconds...`);
                setTimeout(() => tryConnect(nextAttempt), retryDelay);
            }
        };

        tryConnect();
    },
    /// Загрузка моделей таблиц из папки 'db' в каждом из модулей, кроме игнорируемого
    loadModels: async function() {
        console.log("[DATABASE] load models...");
        try {
            fs.readdirSync(path.dirname(__dirname)).forEach(dir => {
                if (dir != 'base' && !ignoreModules.includes(dir) && fs.existsSync(path.dirname(__dirname)+ "/" + dir + '/db')) {
                    console.log(`[DATABASE] --${dir}`);
                    fs.readdirSync(path.dirname(__dirname)+ "/" + dir + '/db').forEach(file => {
                        console.log(`[DATABASE] -----${file}`);
                        let model = this.sequelize.import(path.dirname(__dirname)+ "/" + dir + '/db/' + file);
                        this.Models[model.name] = model;
                    });
                }
            });
            for (var name in this.Models) {
                var model = this.Models[name];
                if (model.associate) model.associate(this.Models);
            }
            await this.sequelize.sync();
            console.log("[DATABASE] loaded.");
        }
        catch (err) {
            console.error(`[DATABASE] model load failed: ${err.message}`);
            throw err;
        }
    }
};
