"use strict";

let inventory = call('inventory');
let jobs = call('jobs');
let money = call('money');
let notifs = call('notifications');
let timer = call('timer');
let utils = call('utils');

module.exports = {
    // Позиция лесопилки
    storagePos: new mp.Vector3(-567.3698120117188, 5273.9111328125, 70.2374496459961 - 1),
    sellPos: new mp.Vector3(-19.214927673339844, -2640.1435546875, 6.032532215118408 - 1),
    
    // Снаряжение лесопилки
    items: [{
        itemId: 64,
        params: {
            health: 100,
            weaponHash: mp.joaat('weapon_hatchet'),
            model: 'weapon_hatchet'
        },
        price: 100
    }],
    
    // Параметры работы
    treeDamage: 10,
    logDamage: 25,
    axDamage: 0.2,
    treePrice: 25,
    exp: 0.05,
    priceBonus: 0.5,
    respawnTreeTime: 30 * 60 * 1000,
    
    // Объекты бревен на земле
    logObjects: [],

    async init() {
        try {
            console.log('[Woodman] Initializing woodman system...');
            this.createStorageMarker();
            this.createSellMarker();
            this.setupEvents();
            console.log('[Woodman] System initialized successfully');
        } catch (e) {
            console.log(`[Woodman] Error during initialization: ${e.message}`);
        }
    },

    createStorageMarker() {
        try {
            var pos = this.storagePos;
            var marker = mp.markers.new(1, pos, 0.5, {
                color: [54, 184, 255, 70]
            });
            
            var colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
            colshape.onEnter = (player) => {
                try {
                    if (!player || !player.character) return;
                    
                    var data = {
                        itemPrices: this.getItemPrices(),
                        treePrice: this.treePrice
                    };
                    player.call(`woodman.storage.inside`, [data]);
                    player.woodmanStorage = marker;
                } catch (e) {
                    console.log(`[Woodman] Error in storage enter: ${e.message}`);
                }
            };
            
            colshape.onExit = (player) => {
                try {
                    if (!player || !player.character) return;
                    
                    player.call(`woodman.storage.inside`);
                    delete player.woodmanStorage;
                } catch (e) {
                    console.log(`[Woodman] Error in storage exit: ${e.message}`);
                }
            };
            
            marker.colshape = colshape;
            
            mp.blips.new(67, pos, {
                color: 81,
                name: `Лесопилка`,
                shortRange: 10,
                scale: 1
            });
            
            console.log('[Woodman] Storage marker created');
        } catch (e) {
            console.log(`[Woodman] Error creating storage marker: ${e.message}`);
        }
    },

    createSellMarker() {
        try {
            var pos = this.sellPos;
            var marker = mp.markers.new(1, pos, 0.5, {
                color: [54, 184, 255, 70]
            });
            
            var colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
            colshape.onEnter = (player) => {
                try {
                    if (!player || !player.character) return;
                    
                    var data = {
                        treePrice: this.treePrice
                    };
                    player.call(`woodman.sell.inside`, [data]);
                    player.woodmanSell = marker;
                } catch (e) {
                    console.log(`[Woodman] Error in sell enter: ${e.message}`);
                }
            };
            
            colshape.onExit = (player) => {
                try {
                    if (!player || !player.character) return;
                    
                    player.call(`woodman.sell.inside`);
                    delete player.woodmanSell;
                } catch (e) {
                    console.log(`[Woodman] Error in sell exit: ${e.message}`);
                }
            };
            
            marker.colshape = colshape;
            
            mp.blips.new(108, pos, {
                color: 31,
                name: `Сбыт дерева`,
                shortRange: 10,
                scale: 1
            });
            
            console.log('[Woodman] Sell marker created');
        } catch (e) {
            console.log(`[Woodman] Error creating sell marker: ${e.message}`);
        }
    },

    setupEvents() {
        try {
            // События для работы лесоруба
            mp.events.add('woodman.buyItem', (player, index) => {
                this.buyItem(player, index);
            });
            
            mp.events.add('woodman.sellItems', (player) => {
                this.sellItems(player);
            });
            
            mp.events.add('woodman.trees.hit', (player) => {
                if (!player.treeColshape) return;
                this.hitTree(player, player.treeColshape);
            });
            
            mp.events.add('woodman.logs.hit', (player, index) => {
                if (!player.treeLog) return;
                this.hitLog(player, player.treeLog, index);
            });
            
            mp.events.add('woodman.logs.add', (player, slotData) => {
                try {
                    var slot = JSON.parse(slotData);
                    if (player.treeColshape) {
                        this.addLogObject(player.treeColshape, slot);
                    }
                } catch (e) {
                    console.log(`[Woodman] Error parsing log slot data: ${e.message}`);
                }
            });
            
            mp.events.add('woodman.items.add', (player, slotsData) => {
                try {
                    var slots = JSON.parse(slotsData);
                    if (player.treeLog) {
                        this.addLogItems(player.treeLog, slots);
                    }
                } catch (e) {
                    console.log(`[Woodman] Error parsing items slots data: ${e.message}`);
                }
            });
            
            console.log('[Woodman] Events setup completed');
        } catch (e) {
            console.log(`[Woodman] Error setting up events: ${e.message}`);
        }
    },

    getItemPrices() {
        try {
            return this.items.map(x => x.price);
        } catch (e) {
            console.log(`[Woodman] Error getting item prices: ${e.message}`);
            return [];
        }
    },

    buyItem(player, index) {
        try {
            var header = 'Дровосек';
            var out = (text) => {
                if (notifs && notifs.error) {
                    notifs.error(player, text, header);
                }
            };
            
            if (!player || !player.character) {
                console.log(`[Woodman] Buy item failed: Invalid player or character`);
                return out(`Ошибка игрока`);
            }
            if (!player.woodmanStorage) {
                console.log(`[Woodman] Buy item failed: Player not at storage`);
                return out(`Вы не у лесопилки`);
            }

            index = Math.max(0, Math.min(index, this.items.length - 1));
            var item = this.items[index];
            
            if (!item) {
                console.log(`[Woodman] Buy item failed: Item not found at index ${index}`);
                return out(`Предмет не найден`);
            }
            if (!player.character.cash || player.character.cash < item.price) {
                console.log(`[Woodman] Buy item failed: Insufficient cash (${player.character.cash}/${item.price})`);
                return out(`Необходимо ${item.price}`);
            }

            var cantAdd = inventory && inventory.cantAdd ? inventory.cantAdd(player, item.itemId, item.params) : null;
            if (cantAdd) {
                console.log(`[Woodman] Buy item failed: Cannot add item - ${cantAdd}`);
                return out(cantAdd);
            }

            if (money && money.removeCash) {
                money.removeCash(player, item.price, (res) => {
                    if (!res) {
                        console.log(`[Woodman] Buy item failed: Cash removal error`);
                        return out(`Ошибка списания наличных`);
                    }
                    
                    console.log(`[Woodman] Adding item ${item.itemId} to player ${player.name}`);
                    if (inventory && inventory.addItem) {
                        inventory.addItem(player, item.itemId, item.params, (e) => {
                            if (e) {
                                console.log(`[Woodman] Buy item failed: Add item error - ${e}`);
                                return out(e);
                            }
                            
                            console.log(`[Woodman] Item ${item.itemId} added successfully`);
                            // Экипируем топор на сервере
                            if (inventory && inventory.setHands) {
                                inventory.setHands(player, item.itemId);
                                console.log(`[Woodman] Equipped item ${item.itemId} for player ${player.name}`);
                            } else {
                                console.log(`[Woodman] Error: inventory.setHands not available`);
                            }
                            
                            if (notifs && notifs.success) {
                                var itemName = inventory.getName ? inventory.getName(item.itemId) : `предмет #${item.itemId}`;
                                notifs.success(player, `Вы приобрели и экипировали ${itemName}`, header);
                            }
                        });
                    }
                }, `Покупка предмета #${item.itemId} на лесопилке`);
            }
        } catch (e) {
            console.log(`[Woodman] Error buying item: ${e.message}`);
        }
    },

    sellItems(player) {
        try {
            var header = 'Сбыт дерева';
            var out = (text) => {
                if (notifs && notifs.error) {
                    notifs.error(player, text, header);
                }
            };
            
            if (!player || !player.character) return out(`Ошибка игрока`);
            if (!player.woodmanSell) return out(`Вы не у точки скупки`);

            var items = inventory && inventory.getArrayByItemId ? inventory.getArrayByItemId(player, 131) : [];
            if (!items.length) return out(`У вас нет ресурсов для продажи`);

            var exp = jobs && jobs.getJobSkill ? jobs.getJobSkill(player, 7).exp : 0;
            var pay = items.length * this.treePrice;
            pay *= (1 + this.priceBonus * (exp / 100));
            
            var bonusPay = jobs && jobs.bonusPay ? jobs.bonusPay : 1;
            var finalPay = Math.floor(pay * bonusPay);

            if (money && money.addCash) {
                money.addCash(player, finalPay, (res) => {
                    if (!res) return out(`Ошибка начисления наличных`);

                    items.forEach(item => {
                        if (inventory && inventory.deleteItem) {
                            inventory.deleteItem(player, item);
                        }
                    });

                    if (notifs && notifs.success) {
                        notifs.success(player, `Продано ${items.length} ед. дерева за ${finalPay}`, header);
                    }
                }, `Продажа ${items.length} ед. дерева x${bonusPay}`);
            }
        } catch (e) {
            console.log(`[Woodman] Error selling items: ${e.message}`);
        }
    },

    hitTree(player, colshape) {
        try {
            var header = `Лесоруб`;
            var out = (text) => {
                if (notifs && notifs.error) {
                    notifs.error(player, text, header);
                }
            };
            
            if (!player || !player.character) {
                console.log(`[Woodman] Hit tree failed: Invalid player or character`);
                return out(`Ошибка игрока`);
            }
            if (!colshape) {
                console.log(`[Woodman] Hit tree failed: No colshape`);
                return out(`Дерево не найдено`);
            }

            const ax = inventory?.getHandsItem ? inventory.getHandsItem(player) : null;
            console.log(`[Woodman] Checking ax for hitTree:`, ax ? `itemId: ${ax.itemId}, params: ${JSON.stringify(ax.params)}` : 'null');
            if (!this.isAx(ax, player)) {
                console.log(`[Woodman] Hit tree failed: No ax in hands`);
                return out(`Возьмите в руки топор`);
            }

            var health = inventory && inventory.getParam ? inventory.getParam(ax, 'health') : null;
            if (!health || health.value <= 0) {
                console.log(`[Woodman] Hit tree failed: Ax is broken`);
                return out(`Топор сломан`);
            }
            if (!colshape.health || colshape.health <= 0) {
                console.log(`[Woodman] Hit tree failed: Tree health depleted`);
                return out(`Дерево исчерпало свой ресурс`);
            }

            // Уменьшаем прочность топора
            health.value = Math.max(0, Math.min(100, health.value - this.axDamage));
            if (inventory && inventory.updateParam) {
                inventory.updateParam(player, ax, 'health', health.value);
                console.log(`[Woodman] Ax health updated: ${health.value}`);
            }

            // Наносим урон дереву
            var damage = Math.floor(this.treeDamage * this.getInventoryDamageBoost(player.inventory ? player.inventory.items : []));
            colshape.health = Math.max(0, colshape.health - damage);
            console.log(`[Woodman] Tree health updated: ${colshape.health}, damage dealt: ${damage}`);

            // Обновляем здоровье дерева у всех игроков поблизости
            mp.players.forEachInRange(colshape.db ? colshape.db.pos : colshape.position, 
                                     colshape.db ? colshape.db.radius : 5, rec => {
                if (!rec.character) return;
                rec.call(`woodman.tree.health`, [colshape.health]);
            });

            // Если дерево срублено
            if (colshape.health <= 0) {
                colshape.destroyTime = Date.now();
                player.call(`woodman.log.request`);
                this.addJobExp(player);
                console.log(`[Woodman] Tree felled, requesting log for player ${player.name}`);
                
                // Устанавливаем таймер восстановления дерева
                if (timer && timer.add) {
                    timer.add(() => {
                        if (colshape && colshape.health !== undefined) {
                            colshape.health = 100;
                            mp.players.forEachInRange(colshape.db ? colshape.db.pos : colshape.position, 
                                                     colshape.db ? colshape.db.radius : 5, rec => {
                                if (!rec.character) return;
                                rec.call(`woodman.tree.health`, [colshape.health]);
                            });
                            console.log(`[Woodman] Tree respawned at ${JSON.stringify(colshape.db ? colshape.db.pos : colshape.position)}`);
                        }
                    }, this.respawnTreeTime);
                }
            }
        } catch (e) {
            console.log(`[Woodman] Error hitting tree: ${e.message}`);
        }
    },

    addLogObject(colshape, slot) {
        try {
            if (!slot || !slot.pos || !slot.rot) return;
            
            var obj = mp.objects.new('prop_fence_log_02', slot.pos, {
                rotation: slot.rot
            });
            
            if (!obj) return;
            
            var pos = obj.position;
            var logColshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 3);
            
            logColshape.onEnter = (player) => {
                try {
                    if (!player || !player.character || player.vehicle) return;
                    
                    player.treeLog = logColshape;
                    player.call(`woodman.log.inside`, [logColshape.squats, obj.id]);
                } catch (e) {
                    console.log(`[Woodman] Error in log enter: ${e.message}`);
                }
            };
            
            logColshape.onExit = (player) => {
                try {
                    if (!player || !player.character) return;
                    
                    delete player.treeLog;
                    player.call(`woodman.log.inside`);
                } catch (e) {
                    console.log(`[Woodman] Error in log exit: ${e.message}`);
                }
            };
            
            logColshape.obj = obj;
            logColshape.tree = colshape.db || {};
            logColshape.squats = [100, 100, 100, 100, 100];

            obj.colshape = logColshape;
            
            // Таймер удаления бревна
            var destroyTime = inventory && inventory.groundItemTime ? inventory.groundItemTime : 300000;
            obj.destroyTimer = timer && timer.add ? timer.add(() => {
                try {
                    if (obj && mp.objects.exists(obj)) {
                        if (obj.colshape) obj.colshape.destroy();
                        obj.destroy();
                    }
                } catch (e) {
                    console.log(`[Woodman] Error destroying log object: ${e.message}`);
                }
            }, destroyTime) : null;
            
            this.logObjects.push(obj);
        } catch (e) {
            console.log(`[Woodman] Error adding log object: ${e.message}`);
        }
    },

    hitLog(player, colshape, index) {
        try {
            var header = `Лесоруб`;
            var out = (text) => {
                if (notifs && notifs.error) {
                    notifs.error(player, text, header);
                }
            };
            
            if (!player || !player.character) return out(`Ошибка игрока`);
            if (!colshape || !colshape.squats) return out(`Бревно не найдено`);

            var ax = inventory && inventory.getHandsItem ? inventory.getHandsItem(player) : null;
            if (!this.isAx(ax, player)) return out(`Возьмите в руки топор`);

            var health = inventory && inventory.getParam ? inventory.getParam(ax, 'health') : null;
            if (!health || health.value <= 0) return out(`Топор сломан`);

            index = Math.max(0, Math.min(index, colshape.squats.length - 1));
            if (colshape.squats[index] <= 0) return out(`Перейдите к другой части бревна`);

            // Уменьшаем прочность топора
            health.value = Math.max(0, Math.min(100, health.value - this.axDamage));
            if (inventory && inventory.updateParam) {
                inventory.updateParam(player, ax, 'health', health.value);
            }

            // Наносим урон бревну
            var damage = Math.floor(this.logDamage * this.getInventoryDamageBoost(player.inventory ? player.inventory.items : []));
            colshape.squats[index] = Math.max(0, colshape.squats[index] - damage);

            // Обновляем здоровье бревна у всех игроков поблизости
            var obj = colshape.obj;
            if (obj && obj.position) {
                mp.players.forEachInRange(obj.position, 3, rec => {
                    if (!rec.character) return;
                    rec.call(`woodman.log.health`, [obj.id, index, colshape.squats[index]]);
                });
            }

            // Проверяем, полностью ли обработано бревно
            var allHealth = utils && utils.arraySum ? utils.arraySum(colshape.squats) : 
                           colshape.squats.reduce((sum, val) => sum + val, 0);
            
            if (allHealth <= 0) {
                player.call(`woodman.items.request`);
                this.addJobExp(player);
            }
        } catch (e) {
            console.log(`[Woodman] Error hitting log: ${e.message}`);
        }
    },

    addLogItems(colshape, slots) {
        try {
            if (!colshape || !slots) return;
            
            // Удаляем бревно
            if (colshape.obj) {
                if (colshape.obj.destroyTimer && timer && timer.remove) {
                    timer.remove(colshape.obj.destroyTimer);
                }
                if (mp.objects.exists(colshape.obj)) {
                    colshape.obj.destroy();
                }
            }
            colshape.destroy();

            // Добавляем предметы на землю
            var params = {
                name: colshape.tree ? colshape.tree.name : 'Дерево'
            };
            
            slots.forEach(slot => {
                if (inventory && inventory.addGroundItem) {
                    inventory.addGroundItem(131, params, slot);
                }
            });
        } catch (e) {
            console.log(`[Woodman] Error adding log items: ${e.message}`);
        }
    },

    getInventoryDamageBoost(itemsList) {
        try {
            if (!itemsList || !inventory || !inventory.getItemsByParams) return 1;
            
            var items = inventory.getItemsByParams(itemsList, null, 'treeDamage', null).filter(x => !x.parentId);
            var boost = 0;
            
            items.forEach(item => {
                var treeDamage = inventory.getParam ? inventory.getParam(item, 'treeDamage') : null;
                if (treeDamage && treeDamage.value) {
                    boost += treeDamage.value;
                }
            });
            
            return 1 + (boost / 100);
        } catch (e) {
            console.log(`[Woodman] Error getting damage boost: ${e.message}`);
            return 1;
        }
    },

    addJobExp(player) {
        try {
            if (!player || !jobs || !jobs.getJobSkill || !jobs.setJobExp) return;
            
            var skill = jobs.getJobSkill(player, 7);
            if (skill) {
                jobs.setJobExp(player, skill, skill.exp + this.exp);
            }
        } catch (e) {
            console.log(`[Woodman] Error adding job exp: ${e.message}`);
        }
    },

    isAx(item, player) {
        try {
            console.log(`[Woodman] Checking ax - item:`, item ? `itemId: ${item.itemId}, params: ${JSON.stringify(item.params)}` : 'null', 
                        `player weapon:`, player ? player.weapon : 'no player', 
                        `hands variable:`, player ? player.getVariable('hands') : 'no player');
            
            // Проверка 1: itemId (64 = обычный топор, 76 = каменный топор)
            if (item && (item.itemId === 64 || item.itemId === 76)) {
                console.log(`[Woodman] Ax confirmed by itemId: ${item.itemId}`);
                return true;
            }

            // Проверка 2: параметры предмета (model или weaponHash)
            if (item && inventory?.getParam) {
                const model = inventory.getParam(item, 'model')?.value;
                const weaponHash = inventory.getParam(item, 'weaponHash')?.value;
                console.log(`[Woodman] Item model: ${model || 'none'}, weaponHash: ${weaponHash || 'none'}`);
                
                if (model === 'weapon_hatchet' || model === 'weapon_stone_hatchet') {
                    console.log(`[Woodman] Ax confirmed by model: ${model}`);
                    return true;
                }
                
                const hatchetHash = mp.joaat('weapon_hatchet');
                const stoneHatchetHash = mp.joaat('weapon_stone_hatchet');
                if (weaponHash && (weaponHash === hatchetHash || weaponHash === stoneHatchetHash)) {
                    console.log(`[Woodman] Ax confirmed by weaponHash: ${weaponHash}`);
                    return true;
                }
            }

            // Проверка 3: переменная hands
            const handsItemId = player.getVariable('hands');
            if (handsItemId === 64 || handsItemId === 76) {
                console.log(`[Woodman] Ax confirmed by hands variable: ${handsItemId}`);
                return true;
            }

            // Проверка 4: текущее оружие игрока
            if (player && player.weapon) {
                const curWeapon = typeof player.weapon === 'number' ? player.weapon : parseInt(player.weapon, 10) || 0;
                const hatchetHash = mp.joaat('weapon_hatchet');
                const stoneHatchetHash = mp.joaat('weapon_stone_hatchet');
                console.log(`[Woodman] Player weapon: ${curWeapon}, hatchet: ${hatchetHash}, stone: ${stoneHatchetHash}`);
                
                if (curWeapon === hatchetHash || curWeapon === stoneHatchetHash) {
                    console.log(`[Woodman] Ax confirmed by player weapon`);
                    return true;
                }
            }

            console.log(`[Woodman] No ax detected`);
            return false;
        } catch (e) {
            console.log(`[Woodman] Error checking ax: ${e.message}`);
            return false;
        }
    },
};