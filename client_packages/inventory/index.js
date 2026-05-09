"use strict";

mp.inventory = {
    groundMaxDist: 1.8,
    lastArmour: 0,
    itemsInfo: null,
    animData: require('animations/data.js'),
    handsBlock: false,
    handsBlockForce: false,
    groundItemMarker: {},
    backSlotWhitelist: [],
    lastActionTime: 0,
    waitActionTime: 1000,
    searchPlayer: null,
    searchRadius: 2,
    clothesHandsItemIds: [1, 2, 6, 7, 8, 9, 10, 11, 12, 14],

    enable(enable) {
        mp.callCEFV(`inventory.enable = ${enable}`);
    },
    controlEnable(enable) {
        mp.callCEFV(`inventory.controlEnable = ${enable}`);
    },
    debug(enable) {
        mp.callCEFV(`inventory.debug = ${enable}`);
    },
    setHandsBlock(enable, force = false) {
        if (this.handsBlockForce && !force) return;
        if (this.handsBlock != enable) mp.callCEFV(`inventory.handsBlock = ${enable}`);
        this.handsBlock = enable;
        this.handsBlockForce = force;
    },
    spin(enable) {
        mp.callCEFV(`inventory.spin = ${enable}`);
    },
    initItems(items) {
        if (typeof items == 'object') items = JSON.stringify(items);
        mp.callCEFV(`inventory.initItems(${items})`);
    },
    initSearchItems(data) {
        var rec = mp.players.atRemoteId(data.playerId);
        if (!rec) return mp.notify.error(`Игрок #${data.playerId} не найден`, `Обыск`);
        this.searchPlayer = rec;
        mp.callCEFV(`inventory.initSearchItems(${JSON.stringify(data)})`);
    },
    stopSearchMode() {
        this.searchPlayer = null;
        mp.callCEFV(`inventory.stopSearchMode()`);
        mp.events.callRemote(`police.inventory.search.stop`);
    },
    checkSearchPlayer() {
        if (!this.searchPlayer) return;
        if (!mp.players.exists(this.searchPlayer)) return this.stopSearchMode();
        var dist = mp.vdist(mp.players.local.position, this.searchPlayer.position);
        if (dist > this.searchRadius) return this.stopSearchMode();
    },
    setItemsInfo(itemsInfo) {
        this.itemsInfo = itemsInfo;

        if (typeof itemsInfo == 'object') itemsInfo = JSON.stringify(itemsInfo);
        mp.callCEFV(`inventory.setItemsInfo(${itemsInfo})`);
    },
    setItemInfo(id, itemInfo) {
        this.itemsInfo[id] = itemInfo;
        if (typeof itemInfo == 'object') itemInfo = JSON.stringify(itemInfo);
        mp.callCEFV(`inventory.setItemInfo(${id}, ${itemInfo})`);
    },
    setMergeList(list) {
        if (typeof list == 'object') list = JSON.stringify(list);
        mp.callCEFV(`inventory.setMergeList(${list})`);
    },
    setBlackList(list) {
        if (typeof list == 'object') list = JSON.stringify(list);
        mp.callCEFV(`inventory.setBlackList(${list})`);
    },
    addItem(item, pocket, index, parent) {
        if (typeof item == 'object') item = JSON.stringify(item);
        mp.callCEFV(`inventory.addItem(${item}, ${pocket}, ${index}, ${parent})`);
    },
    deleteItem(sqlId) {
        mp.callCEFV(`inventory.deleteItem(${sqlId})`);
    },
    setItemSqlId(id, sqlId) {
        mp.callCEFV(`inventory.setItemSqlId(${id}, ${sqlId})`);
    },
    setItemParam(sqlId, key, value) {
        mp.callCEFV(`inventory.setItemParam(${sqlId}, \`${key}\`, \`${value}\`)`);
    },
    setFoundItem(sqlId, enable) {
        mp.callCEFV(`inventory.setFoundItem(${sqlId}, ${enable})`);
    },
    addEnvironmentPlace(place) {
        if (typeof place == 'object') place = JSON.stringify(place);
        mp.callCEFV(`inventory.addEnvironmentPlace(${place})`);
    },
    deleteEnvironmentPlace(sqlId) {
        mp.callCEFV(`inventory.deleteEnvironmentPlace(${sqlId})`);
    },
    setEnvironmentItemSqlId(id, sqlId) {
        mp.callCEFV(`inventory.setEnvironmentItemSqlId(${id}, ${sqlId})`);
    },
    deleteEnvironmentItem(id) {
        mp.callCEFV(`inventory.deleteEnvironmentItem(${id})`);
    },
    setMaxPlayerWeight(val) {
        mp.callCEFV(`inventory.maxPlayerWeight = ${val}`)
    },
    setSatiety(val) {
        mp.callCEFV(`inventory.satiety = ${val}`)
    },
    setThirst(val) {
        mp.callCEFV(`inventory.thirst = ${val}`)
    },
    setArmour(val) {
        if (this.lastArmour == val) return;
        this.lastArmour = val;
        mp.callCEFV(`inventory.setArmour(${val})`);
    },
    getNearGroundItemObject(pos) {
        let itemObj, minDist = 9999;
        mp.objects.forEach((obj) => {
            if (!obj.getVariable("groundItem")) return;
            if (obj.dimension != mp.players.local.dimension) return;
            let objPos = obj.position;
            let dist = mp.game.system.vdist(pos.x, pos.y, pos.z, objPos.x, objPos.y, objPos.z);
            if (dist > mp.inventory.groundMaxDist) return;
            if (dist > minDist) return;

            minDist = dist;
            itemObj = obj;
        });
        return itemObj;
    },
    takeItemHandler() {
        // поднятие предмета с земли
        if (mp.busy.includes()) return;
        if (mp.players.local.vehicle) return;
        if (!mp.players.local.getHealth()) return;
        let pos = mp.players.local.getOffsetFromInWorldCoords(0, 0, 0);
        let itemObj = this.getNearGroundItemObject(pos);
        if (!itemObj) return;
        if (this.isFlood()) return;
        mp.events.callRemote("item.ground.take", itemObj.remoteId);
    },
    loadHotkeys() {
        if (!mp.storage.data.hotkeys) mp.storage.data.hotkeys = {};
        var hotkeys = mp.storage.data.hotkeys;
        for (var key in hotkeys) {
            var sqlId = hotkeys[key];
            key = parseInt(key);
            mp.callCEFV(`inventory.bindHotkey(${sqlId}, ${key})`);
        }
    },
    saveHotkey(sqlId, key) {
        mp.inventory.clearHotkeys(sqlId);
        var hotkeys = mp.storage.data.hotkeys;
        hotkeys[key] = sqlId;
    },
    removeHotkey(key) {
        var hotkeys = mp.storage.data.hotkeys;
        delete hotkeys[key];
    },
    clearHotkeys(sqlId) {
        var hotkeys = mp.storage.data.hotkeys;
        for (var key in hotkeys) {
            var itemSqlId = hotkeys[key];
            if (sqlId == itemSqlId) this.removeHotkey(key);
        }
    },
    registerWeaponAttachments(attachmentsOrList) {
        const attachments = Array.isArray(attachmentsOrList) ? attachmentsOrList : [];
        const bodyList = [];

        for (let i = 0; i < attachments.length; i++) {
            const entry = attachments[i];
            if (!entry || typeof entry !== "object") continue;

            const itemId = parseInt(entry.itemId, 10);
            if (!Number.isInteger(itemId)) continue;

            const model = entry.model;
            const dbAttach = (entry.attachInfo && typeof entry.attachInfo === "object") ? entry.attachInfo : {};
            if (model == null) continue;

            let bone = 24818;
            if (Number.isInteger(dbAttach.bone)) bone = dbAttach.bone;
            else if (typeof dbAttach.bone === "string") {
                const parsedBone = parseInt(dbAttach.bone, 10);
                if (Number.isInteger(parsedBone) && !Number.isNaN(parsedBone)) bone = parsedBone;
            }

            const pos = new mp.Vector3(
                Array.isArray(dbAttach.pos) ? (parseFloat(dbAttach.pos[0]) || 0) : 0,
                Array.isArray(dbAttach.pos) ? (parseFloat(dbAttach.pos[1]) || 0) : 0,
                Array.isArray(dbAttach.pos) ? (parseFloat(dbAttach.pos[2]) || 0) : 0
            );
            const rot = new mp.Vector3(
                Array.isArray(dbAttach.rot) ? (parseFloat(dbAttach.rot[0]) || 0) : 0,
                Array.isArray(dbAttach.rot) ? (parseFloat(dbAttach.rot[1]) || 0) : 0,
                Array.isArray(dbAttach.rot) ? (parseFloat(dbAttach.rot[2]) || 0) : 0
            );

            // Координаты для правки находятся на сервере в packages/inventory/index.js:
            // BACK_SLOT_DEFAULT_ATTACH_INFO и отдельные attachInfo в BACK_SLOT_ATTACHMENT_CONFIGS.
            mp.attachmentMngr.register(`weapon_back_${itemId}`, model, bone, pos, rot);
            bodyList.push(itemId);
        }

        this.backSlotWhitelist = bodyList;
        mp.callCEFV(`inventory.setBodyList(9, ${JSON.stringify(bodyList)})`)
    },
    disableControlActions() {
        mp.game.controls.disableControlAction(1, 157, true);
        mp.game.controls.disableControlAction(1, 158, true);
        mp.game.controls.disableControlAction(1, 159, true);
        mp.game.controls.disableControlAction(1, 160, true);
        mp.game.controls.disableControlAction(1, 161, true);
        mp.game.controls.disableControlAction(1, 162, true);
        mp.game.controls.disableControlAction(1, 163, true);
        mp.game.controls.disableControlAction(1, 164, true);
        mp.game.controls.disableControlAction(1, 165, true);
    },
    
    // Функция для получения предмета в руках
    getHandsItem(player) {
        try {
            if (!player || !mp.players.exists(player)) {
                console.log(`[Inventory] getHandsItem failed: Invalid player`);
                return null;
            }
            if (!player.hands) {
                console.log(`[Inventory] getHandsItem: No item in hands for player ${player.remoteId}`);
                return null;
            }
            const item = {
                itemId: player.hands.itemId,
                model: player.hands.model,
                params: {
                    model: player.hands.model,
                    weaponHash: mp.game.joaat(player.hands.model),
                    health: 100 // Предполагаем, что здоровье предмета хранится где-то еще
                }
            };
            console.log(`[Inventory] getHandsItem: Returning item for player ${player.remoteId}`, item);
            return item;
        } catch (e) {
            console.error(`[Inventory] Error in getHandsItem: ${e.message}`);
            return null;
        }
    },

    hands(player, itemId) {
        if (!this.itemsInfo) return;

        // Удаляем текущий предмет в руках
        if (player.hands) {
            try {
                const oldInfo = this.itemsInfo[player.hands.itemId];
                if (oldInfo && oldInfo.attachInfo) {
                    const attachInfo = oldInfo.attachInfo;
                    const oldAnim = attachInfo.anim;

                    if (oldAnim && oldAnim !== 0) {
                        const a = this.animData[oldAnim].split(" ");
                        if (mp.players.local.remoteId === player.remoteId) {
                            player.stopAnimTask(a[0], a[1], 3);
                        } else {
                            player.clearTasksImmediately();
                        }
                    } else {
                        player.clearTasksImmediately();
                    }
                }

                if (mp.objects.exists(player.hands.object)) {
                    player.hands.object.destroy();
                }
                delete player.hands;
            } catch (e) {
                console.error("Error removing old hands item:", e);
            }
        }

        // Создаем новый предмет в руках
        if (itemId) {
            if (player.vehicle) return;

            try {
                const info = this.itemsInfo[itemId];
                if (!info) {
                    console.error(`No info found for item ${itemId}`);
                    return;
                }

                const attachInfo = info.attachInfo;
                if (!attachInfo) {
                    console.error(`No attachInfo found for item ${itemId}`);
                    return;
                }

                console.log(`Creating item ${itemId} with attachInfo:`, attachInfo);

                setTimeout(() => {
                    this.attachItemToPlayer(player, itemId, info, attachInfo);
                }, 100);
            } catch (e) {
                console.error("Error creating hands item:", e);
            }
        }
    },

    attachItemToPlayer(player, itemId, info, attachInfo) {
        try {
            if (!mp.players.exists(player)) return;

            // Если attachInfo это строка (JSON из БД), парсим её
            if (typeof attachInfo === 'string') {
                try {
                    attachInfo = JSON.parse(attachInfo);
                } catch (e) {
                    console.error(`Failed to parse attachInfo JSON for item ${itemId}:`, e);
                    return;
                }
            }

            const modelName = info.model;
            if (!modelName) {
                console.error(`No model specified for item ${itemId}`);
                return;
            }

            let targetBone = attachInfo.bone || 28422; // default = R_Hand
            let boneIndex = player.getBoneIndex(targetBone);

            if (boneIndex === -1) {
                console.warn(`Bone ${targetBone} not found for item ${itemId}, trying alternative`);
                const alternatives = [28422, 57005, 24818, 18905, 60309];
                for (let bone of alternatives) {
                    boneIndex = player.getBoneIndex(bone);
                    if (boneIndex !== -1) {
                        targetBone = bone;
                        break;
                    }
                }
                if (boneIndex === -1) {
                    console.error(`No suitable bone found for item ${itemId}`);
                    return;
                }
            }

            const modelHash = mp.game.joaat(modelName);
            if (!mp.game.streaming.isModelValid(modelHash)) {
                console.error(`Invalid model: ${modelName} for item ${itemId}`);
                return;
            }

            mp.game.streaming.requestModel(modelHash);

            const object = mp.objects.new(modelHash, player.position, {
                dimension: player.dimension
            });

            if (!object || !mp.objects.exists(object)) {
                console.error(`Failed to create object for model ${modelName}`);
                return;
            }

            setTimeout(() => {
                if (!mp.objects.exists(object)) return;

                // Преобразуем массивы pos/rot в mp.Vector3
                let pos = Array.isArray(attachInfo.pos) ? attachInfo.pos : [0, 0, 0];
                let rot = Array.isArray(attachInfo.rot) ? [
                    attachInfo.rot[0], // X axis
                    attachInfo.rot[1], // Z axis
                    attachInfo.rot[2]  // Y axis
                ] : [0, 0, 0];

                // Создаем mp.Vector3 объекты
                const posVector = new mp.Vector3(pos[0], pos[1], pos[2]);
                const rotVector = new mp.Vector3(rot[0], rot[1], rot[2]);

                console.log(`Attaching item ${itemId} to bone ${targetBone} with pos: [${pos.join(', ')}] rot: [${rot.join(', ')}]`);

                // Используем точно такие же параметры как в редакторе
                object.attachTo(
                    player.handle,
                    boneIndex,
                    parseFloat(posVector.x),    // точно как в редакторе
                    parseFloat(posVector.y),
                    parseFloat(posVector.z),
                    parseFloat(rotVector.x),
                    parseFloat(rotVector.y),
                    parseFloat(rotVector.z),
                    false,  // softPinning (как в редакторе)
                    true,   // useSoftPinning (как в редакторе)
                    false,  // collision (как в редакторе)
                    true,   // isPed (как в редакторе)
                    1,      // vertexIndex (как в редакторе первый раз)
                    true    // fixedRot (как в редакторе)
                );

                // Анимация
                if (attachInfo.anim && attachInfo.anim !== 0) {
                    const animName = this.animData[attachInfo.anim];
                    if (animName) {
                        const a = animName.split(" ");
                        player.clearTasksImmediately();
                        mp.utils.requestAnimDict(a[0], () => {
                            player.taskPlayAnim(a[0], a[1], 8.0, 0.0, -1, 49, 0.0, false, false, false);
                        });
                    }
                } else {
                    this.playItemAnimation(player, itemId, targetBone);
                }

                // Сохраняем
                player.hands = {
                    object: object,
                    itemId: itemId,
                    bone: targetBone,
                    boneIndex: boneIndex,
                    model: modelName
                };

                console.log(`✓ Attached ${modelName} (item ${itemId}) to bone ${targetBone}`);
            }, 200);

        } catch (e) {
            console.error("Error in attachItemToPlayer:", e);
        }
    },

    // Вспомогательная функция для анимаций
    playItemAnimation(player, itemId, targetBone) {
        // Видеокамера на плече.
        if (itemId === 503) {
            mp.utils.requestAnimDict("amb@world_human_paparazzi@male@base", () => {
                player.taskPlayAnim("amb@world_human_paparazzi@male@base", "base", 8.0, 0.0, -1, 49, 0.0, false, false, false);
            });
            return;
        }

        // Микрофон в одной руке (согнутая рука у лица).
        if (itemId === 502) {
            mp.utils.requestAnimDict("cellphone@", () => {
                player.taskPlayAnim("cellphone@", "cellphone_call_listen_base", 8.0, 0.0, -1, 49, 0.0, false, false, false);
            });
            return;
        }

        // Предметы одежды в руках — поза "держит перед собой" (локти согнуты).
        if (this.clothesHandsItemIds.includes(itemId)) {
            mp.utils.requestAnimDict("anim@heists@box_carry@", () => {
                player.taskPlayAnim("anim@heists@box_carry@", "idle", 8.0, 0.0, -1, 49, 0.0, false, false, false);
            });
            return;
        }

        // Scrap Metal: держим перед собой (локти согнуты)
        if (itemId === 501) {
            mp.utils.requestAnimDict("anim@heists@box_carry@", () => {
                player.taskPlayAnim("anim@heists@box_carry@", "idle", 8.0, 0.0, -1, 49, 0.0, false, false, false);
            });
            return;
        }

        // Базовая анимация для предмета в руках
        if (targetBone === 28422 || targetBone === 57005) { // правая или левая рука
            player.taskSwapWeapon(true);
        } else {
            // Для других костей можно добавить специфичные анимации
            player.clearTasksImmediately();
        }
    },

    // Функция для получения позиции предмета на земле
    getGroundItemPos(player) {
        const pos = player.getOffsetFromInWorldCoords(0, 1.2, 0);
        return {
            x: pos.x,
            y: pos.y,
            z: pos.z - 1.0
        };
    },

    // Функция для проверки флуда
    isFlood() {
        const currentTime = Date.now();
        if (currentTime - this.lastActionTime < this.waitActionTime) {
            return true;
        }
        this.lastActionTime = currentTime;
        return false;
    },

    // Функция для синхронизации патронов
    syncAmmo(weapon) {
        if (!weapon) return;
        try {
            // Используем правильный метод RageMP API
            const ammo = mp.players.local.getAmmo(weapon);
            mp.callCEFV(`inventory.setAmmo(${weapon}, ${ammo})`);
        } catch (e) {
            console.error("Error syncing ammo:", e);
        }
    },

    // Функция для инициализации маркера предметов на земле
    initGroundItemMarker() {
        this.groundItemMarker = mp.markers.new(1, new mp.Vector3(0, 0, 0), 0.3, {
            color: [255, 255, 0, 100],
            visible: false,
            dimension: mp.players.local.dimension
        });
    }
};

// События
mp.events.add("characterInit.done", () => {
    mp.inventory.enable(true);
    mp.keys.bind(69, true, () => { // E
        mp.inventory.takeItemHandler();
    });
    mp.inventory.initGroundItemMarker();
});

mp.events.add("click", (x, y, upOrDown, leftOrRight, relativeX, relativeY, worldPosition, hitEntity) => {
    if (upOrDown != 'down' || leftOrRight != 'left') return;
    if (mp.game.ui.isPauseMenuActive()) return;
    if (mp.busy.includes()) return;
    if (!mp.players.local.getVariable("hands")) return;
    if (mp.inventory.isFlood()) {
        mp.callCEFV(`inventory.clearHands()`);
        return;
    }
    mp.callCEFV(`inventory.onUseHandsItem()`);
});

mp.events.add("inventory.enable", mp.inventory.enable);

mp.events.add("inventory.controlEnable", mp.inventory.controlEnable);

mp.events.add("inventory.debug", mp.inventory.debug);

mp.events.add("inventory.spin", mp.inventory.spin);

mp.events.add("inventory.initItems", (items) => {
    mp.inventory.initItems(items);
    mp.inventory.loadHotkeys();
});

mp.events.add("inventory.initSearchItems", (data) => {
    mp.inventory.initSearchItems(data);
});

mp.events.add("inventory.stopSearchMode", () => {
    mp.inventory.stopSearchMode();
});

mp.events.add("inventory.setItemsInfo", (itemsInfo) => {
    mp.inventory.setItemsInfo(itemsInfo);
});

mp.events.add("inventory.setItemInfo", (id, info) => {
    mp.inventory.setItemInfo(id, info);
});

mp.events.add("inventory.setMergeList", mp.inventory.setMergeList);

mp.events.add("inventory.setBlackList", mp.inventory.setBlackList);

mp.events.add("inventory.deleteItem", mp.inventory.deleteItem);

mp.events.add("inventory.setItemSqlId", mp.inventory.setItemSqlId);

mp.events.add("inventory.setFoundItem", mp.inventory.setFoundItem);

mp.events.add("inventory.addItem", mp.inventory.addItem);

mp.events.add("inventory.setItemParam", mp.inventory.setItemParam);

mp.events.add("inventory.addEnvironmentPlace", mp.inventory.addEnvironmentPlace);

mp.events.add("inventory.deleteEnvironmentPlace", mp.inventory.deleteEnvironmentPlace);

mp.events.add("inventory.setEnvironmentItemSqlId", mp.inventory.setEnvironmentItemSqlId);

mp.events.add("inventory.deleteEnvironmentItem", mp.inventory.deleteEnvironmentItem);

mp.events.add("inventory.setMaxPlayerWeight", mp.inventory.setMaxPlayerWeight);

mp.events.add("inventory.registerWeaponAttachments", (list, models) => {
    mp.inventory.registerWeaponAttachments(list, models);
});

mp.events.add("inventory.setSatiety", mp.inventory.setSatiety);

mp.events.add("inventory.setThirst", mp.inventory.setThirst);

mp.events.add("inventory.setHandsBlock", (enable, force = false) => {
    mp.inventory.setHandsBlock(enable, force);
});

mp.events.add("inventory.saveHotkey", mp.inventory.saveHotkey);

mp.events.add("inventory.removeHotkey", mp.inventory.removeHotkey);

mp.events.add("inventory.ground.put", (sqlId) => {
    var pos = mp.inventory.getGroundItemPos(mp.players.local);
    mp.events.callRemote(`item.ground.put`, sqlId, JSON.stringify(pos));
});

mp.events.add("police.inventory.search.item.putGround", (sqlId) => {
    var pos = mp.inventory.getGroundItemPos(mp.players.local);
    mp.events.callRemote(`police.inventory.search.item.putGround`, sqlId, JSON.stringify(pos));
});

mp.events.add("inventory.item.adrenalin.use.callRemote", (data) => {
    if (typeof data == 'string') data = JSON.parse(data);

    var rec = mp.utils.getNearPlayer(mp.players.local.position);
    if (!rec) return mp.notify.error(`Рядом никого нет`, `Адреналин`);
    data.recId = rec.remoteId;
    mp.events.callRemote(`inventory.item.adrenalin.use`, JSON.stringify(data));
});

mp.events.add("inventory.item.use.callRemote", (data) => {
    if (typeof data == 'string') data = JSON.parse(data);
    data.pos = mp.inventory.getGroundItemPos(mp.players.local);
    mp.events.callRemote(`inventory.item.use`, JSON.stringify(data));
});

mp.events.add("playerEnterVehicle", () => {
    if (!mp.players.local.getVariable("hands")) return;
    mp.callCEFV(`inventory.clearHands()`);
});

mp.events.add("playerEnterVehicleBoot", (player, vehicle) => {
    if (!vehicle.getVariable("trunk")) return;
    if (vehicle.getVariable("static")) return;
    if (player.vehicle) return;
    mp.prompt.showByName("vehicle_items_boot");
    mp.events.callRemote(`vehicle.boot.items.request`, vehicle.remoteId);
});

mp.events.add("playerExitVehicleBoot", (player, vehicle) => {
    if (vehicle.getVariable("static")) return;
    mp.events.callRemote(`vehicle.boot.items.clear`, vehicle.remoteId);
});

mp.events.add("playerWeaponShot", (targetPos, targetEntity) => {
    mp.inventory.syncAmmo(mp.players.local.weapon);
});

mp.events.add("playerWeaponChanged", (weapon, oldWeapon) => {
    mp.inventory.syncAmmo(weapon);
});

mp.events.add("entityStreamIn", (entity) => {
    if (entity.type != "player") return;
    var itemId = entity.getVariable("hands");
    mp.inventory.hands(entity, itemId);
});

mp.events.add("entityStreamOut", (entity) => {
    if (entity.type != "player") return;
    if (!entity.hands) return;
    mp.inventory.hands(entity, null);
});

mp.events.add("inventory.ground.drop", (sqlId) => {
    var pos = mp.inventory.getGroundItemPos(mp.players.local);
    mp.events.callRemote(`item.ground.drop`, sqlId, JSON.stringify(pos));
});

mp.events.add("time.main.tick", () => {
    var start = Date.now();
    var player = mp.players.local;
    var value = player.getArmour();
    mp.inventory.setArmour(value);
    mp.inventory.checkSearchPlayer();
    if (mp.busy.includes("lostAttach")) return;
    mp.inventory.setHandsBlock(player.vehicle != null);

    if (mp.timeMainChecker) mp.timeMainChecker.modules.inventory = Date.now() - start;
});

mp.events.add("render", () => {
    var start = Date.now();
    mp.inventory.disableControlActions();

    var player = mp.players.local;
    var itemObj = mp.inventory.getNearGroundItemObject(player.position);
    if (itemObj && !player.vehicle) {
        var pos = itemObj.position;
        pos.z += 0.5;
        mp.inventory.groundItemMarker.position = pos;
        mp.inventory.groundItemMarker.visible = true;
    } else mp.inventory.groundItemMarker.visible = false;
    if (player.getVariable("hands")) {
        mp.game.controls.disableControlAction(0, 24, true); /// удары
        mp.game.controls.disableControlAction(0, 25, true); /// INPUT_AIM
        mp.game.controls.disableControlAction(0, 140, true); /// удары R
        mp.game.controls.disableControlAction(0, 257, true); // INPUT_ATTACK2
    }
    if (mp.renderChecker) mp.utils.drawText2d(`inventory rend: ${Date.now() - start} ms`, [0.8, 0.59]);
});

mp.events.addDataHandler("trunk", (vehicle, value) => {
    if (!mp.moduleVehicles || mp.moduleVehicles.nearBootVehicleId == null) return;
    if (mp.moduleVehicles.nearBootVehicleId != vehicle.remoteId) return;
    if (value) {
        mp.events.callRemote(`vehicle.boot.items.request`, vehicle.remoteId);
        mp.prompt.showByName("vehicle_items_boot");
    } else {
        mp.events.callRemote(`vehicle.boot.items.clear`, vehicle.remoteId);
        mp.prompt.showByName("vehicle_open_boot");
    }
});

mp.events.addDataHandler("hands", (player, itemId) => {
    mp.inventory.hands(player, itemId);
});
