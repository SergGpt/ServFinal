"use strict";

mp.woodman = {
    treeHealthBar: {
        width: 0.1,
        height: 0.015,
        border: 0.0005,
        textColor: [255, 255, 255, 255],
        textScale: [0.2, 0.2],
        getProgressColor() {
            try {
                var player = mp.players.local;
                return (player && typeof player.isInMeleeCombat === 'function' && player.isInMeleeCombat()) ? [255, 0, 0, 100] : [0, 0, 0, 100];
            } catch (e) {
                return [0, 0, 0, 100];
            }
        },
        getFillColor(health) {
            return [54, 184, 255, 70];
        },
    },
    logHealthBar: {
        width: 0.05,
        height: 0.012,
        border: 0.0004,
        textColor: [255, 255, 255, 200],
        textScale: [0.17, 0.17],
        getProgressColor() {
            return [0, 0, 0, 50];
        },
        getFillColor(health) {
            return [33, 177, 255, 50];
        },
    },
    treeHealth: 0,
    treePos: null,
    logSquats: [],
    logObj: null,
    logFocusSlotI: -1,
    lastStartMelee: 0,
    hitWaitTime: 500,
    logSize: {
        height: 0.3,
        width: 4.4,
    },
    logTimer: null,

    // <--- NEW: признак, что игрок сейчас в контексте лесоруба (у дерева или у бревна)
    isActive() {
        try {
            const hasTree = !!this.treePos;
            const hasLog = !!(this.logObj && mp.objects && mp.objects.exists && mp.objects.exists(this.logObj));
            return hasTree || hasLog;
        } catch (e) {
            return false;
        }
    },

    drawTreeHealthBar(x, y) {
        try {
            if (!mp.game || !mp.game.graphics) {
                console.log(`[Woodman] No mp.game.graphics available`);
                return;
            }
            console.log(`[Woodman] Drawing tree health bar at ${x}, ${y}, health: ${this.treeHealth}`);
            var info = this.treeHealthBar;
            var color = info.getProgressColor();
            var border = info.border;
            var fillColor = info.getFillColor(this.treeHealth);
            var textColor = info.textColor;
            var textScale = info.textScale;
            var health = Math.max(0, Math.min(100, this.treeHealth || 0));
            mp.game.graphics.drawRect(x, y, info.width + border * 2, info.height + border * 5, color[0], color[1], color[2], color[3]);
            mp.game.graphics.drawRect(x - (100 - health) * 0.0005, y, info.width * health / 100, info.height, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
            mp.game.graphics.drawText(`${health}%`, [x, y - 0.04 * textScale[0]], {
                font: 0,
                color: textColor,
                scale: textScale,
                outline: false
            });
        } catch (e) {
            console.log(`[Woodman] Error drawing tree health bar: ${e.message}`);
        }
    },
    
    drawLogHealthBar(x, y, index) {
        try {
            if (!mp.game || !mp.game.graphics) return;
            if (!this.logSquats || index < 0 || index >= this.logSquats.length) return;
            
            var info = this.logHealthBar;
            var health = Math.max(0, Math.min(100, this.logSquats[index] || 0));
            var color = info.getProgressColor();
            var border = info.border;
            var fillColor = info.getFillColor(health);
            var textColor = info.textColor;
            var textScale = info.textScale;
            
            if (this.logFocusSlotI == index) {
                color[3] = fillColor[3] = 200;
            }
            
            mp.game.graphics.drawRect(x, y, info.width + border * 2, info.height + border * 5, color[0], color[1], color[2], color[3]);
            mp.game.graphics.drawRect(x - (100 - health) * 0.00025, y,
                info.width * health / 100, info.height,
                fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
            mp.game.graphics.drawText(`${health}%`, [x, y - 0.045 * textScale[0]], {
                font: 0,
                color: textColor,
                scale: textScale,
                outline: false
            });
        } catch (e) {
            console.log(`[Woodman] Error drawing log health bar: ${e.message}`);
        }
    },
    
    isAxInHands(player) {
        try {
            if (!player) player = mp.players.local;
            console.log(`[Woodman] Checking ax in hands - player: ${player ? player.remoteId : 'null'}`);

            // Проверка 1: предмет в руках через инвентарь
            let handsItem = mp.inventory?.getHandsItem ? mp.inventory.getHandsItem(player) : null;
            console.log(`[Woodman] Hands item:`, handsItem ? `itemId: ${handsItem.itemId}, model: ${handsItem.model}, params: ${JSON.stringify(handsItem.params)}` : 'null');
            
            if (handsItem && (handsItem.itemId === 64 || handsItem.itemId === 76 || handsItem.model === 'weapon_hatchet' || handsItem.model === 'weapon_stone_hatchet')) {
                console.log(`[Woodman] Ax confirmed by hands item: ${handsItem.itemId || handsItem.model}`);
                return true;
            }

            // Проверка 2: переменная hands
            const handsItemId = player.getVariable('hands');
            console.log(`[Woodman] Hands variable: ${handsItemId}`);
            if (handsItemId === 64 || handsItemId === 76) {
                console.log(`[Woodman] Ax confirmed by hands variable: ${handsItemId}`);
                return true;
            }

            // Проверка 3: хэш текущего оружия
            const axHashes = [mp.game.joaat('weapon_hatchet'), mp.game.joaat('weapon_stone_hatchet')];
            let playerWeapon = typeof player.weapon === 'number' ? player.weapon : parseInt(player.weapon, 10) || 0;
            console.log(`[Woodman] Player weapon: ${playerWeapon}, axHashes: ${axHashes}`);
            
            if (axHashes.includes(playerWeapon)) {
                console.log(`[Woodman] Ax confirmed by weapon hash: ${playerWeapon}`);
                return true;
            }

            console.log(`[Woodman] No ax detected in hands`);
            return false;
        } catch (e) {
            console.log(`[Woodman] Error checking ax in hands: ${e.message}`);
            return false;
        }
    },
    
    isFocusTree() {
        try {
            if (!this.treePos) return false;
            
            var player = mp.players.local;
            if (!player || !player.position) return false;
            
            var positions = [
                player.position,
                player.getOffsetFromInWorldCoords(-1, 0, 0),
                player.getOffsetFromInWorldCoords(1, 0, 0),
                player.getOffsetFromInWorldCoords(0, 0, 1),
                player.getOffsetFromInWorldCoords(0, 0, -1),
            ];
            
            var treeEntity = null;
            for (var i = 0; i < positions.length; i++) {
                if (!mp.raycasting || !mp.raycasting.testPointToPoint) continue;
                
                var raycastToTree = mp.raycasting.testPointToPoint(positions[i], this.treePos);
                if (raycastToTree && raycastToTree.entity) {
                    treeEntity = raycastToTree.entity;
                    break;
                }
            }
            
            if (!treeEntity) return false;
            
            var frontPos = player.getOffsetFromInWorldCoords(0, 1, this.treePos.z - player.position.z);
            
            return mp.vdist && mp.vdist(player.position, this.treePos) > mp.vdist(frontPos, this.treePos);
        } catch (e) {
            console.log(`[Woodman] Error checking focus tree: ${e.message}`);
            return false;
        }
    },
    
    setInside(data) {
        try {
            if (!data) return mp.callCEFV && mp.callCEFV(`selectMenu.show = false`);
            
            if (mp.callCEFV) {
                mp.callCEFV(`selectMenu.menus['woodmanItems'].init(${JSON.stringify(data)})`);
                mp.callCEFV(`selectMenu.showByName('woodmanItems')`);
            }
        } catch (e) {
            console.log(`[Woodman] Error setting inside: ${e.message}`);
        }
    },
    
    setSellInside(data) {
        try {
            if (!data) return mp.callCEFV && mp.callCEFV(`selectMenu.show = false`);
            
            if (mp.callCEFV) {
                mp.callCEFV(`selectMenu.menus['woodmanSell'].init(${JSON.stringify(data)})`);
                mp.callCEFV(`selectMenu.showByName('woodmanSell')`);
            }
        } catch (e) {
            console.log(`[Woodman] Error setting sell inside: ${e.message}`);
        }
    },
    
    setTreeInside(pos, health) {
        try {
            console.log(`[Woodman] Setting tree inside - pos: ${pos ? JSON.stringify(pos) : 'null'}, health: ${health}`);
            if (pos) {
                const isAxEquipped = this.isAxInHands();
                console.log(`[Woodman] Ax equipped: ${isAxEquipped}`);
                if (isAxEquipped) {
                    mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_start_ax');
                } else {
                    mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_take_ax');
                }
                this.treePos = pos;
                this.treeHealth = health || 0;
            } else {
                mp.prompt && mp.prompt.hide && mp.prompt.hide();
                this.treePos = null;
                this.treeHealth = 0;
            }
        } catch (e) {
            console.log(`[Woodman] Error setting tree inside: ${e.message}`);
        }
    },
    
    getFreeTreeSlot() {
        try {
            var player = mp.players.local;
            if (!player || !player.getOffsetFromInWorldCoords) return null;
            
            var leftPos = player.getOffsetFromInWorldCoords(2, -this.logSize.width / 2, 3);
            var rightPos = player.getOffsetFromInWorldCoords(2, this.logSize.width / 2, 3);
            
            var leftGroundZ = mp.game.gameplay.getGroundZFor3dCoord(leftPos.x, leftPos.y, leftPos.z, false, false);
            var rightGroundZ = mp.game.gameplay.getGroundZFor3dCoord(rightPos.x, rightPos.y, rightPos.z, false, false);
            
            var leftDist = mp.vdist(leftPos, new mp.Vector3(leftPos.x, leftPos.y, leftGroundZ));
            var rightDist = mp.vdist(rightPos, new mp.Vector3(rightPos.x, rightPos.y, rightGroundZ));
            
            var alpha = -Math.sin((leftDist - rightDist) / this.logSize.width) * 180 / Math.PI;
            
            var objPos = player.getOffsetFromInWorldCoords(2, 0, 3);
            objPos.z = mp.game.gameplay.getGroundZFor3dCoord(objPos.x, objPos.y, objPos.z, false, false) + this.logSize.height / 2;
            
            return {
                pos: objPos,
                rot: new mp.Vector3(0, alpha, player.getHeading() + 90),
            };
        } catch (e) {
            console.log(`[Woodman] Error getting free tree slot: ${e.message}`);
            return null;
        }
    },
    
    setLogInside(squats, objId) {
        try {
            if (squats && objId !== undefined) {
                if (this.isAxInHands()) {
                    mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_log_start_ax');
                } else {
                    mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_log_take_ax');
                }
                
                this.logSquats = squats || [];
                this.logObj = mp.objects && mp.objects.atRemoteId ? mp.objects.atRemoteId(objId) : null;
            } else {
                mp.prompt && mp.prompt.hide && mp.prompt.hide();
                this.logSquats = [];
                this.logObj = null;
            }
        } catch (e) {
            console.log(`[Woodman] Error setting log inside: ${e.message}`);
        }
    },
    
    getLogSlots(obj) {
        try {
            if (!obj || !obj.getOffsetFromInWorldCoords) return [];
            
            var slots = [
                obj.getOffsetFromInWorldCoords(-2, 0, 0),
                obj.getOffsetFromInWorldCoords(-1, 0, 0),
                obj.getOffsetFromInWorldCoords(0, 0, 0),
                obj.getOffsetFromInWorldCoords(1, 0, 0),
                obj.getOffsetFromInWorldCoords(2, 0, 0),
            ];
            return slots;
        } catch (e) {
            console.log(`[Woodman] Error getting log slots: ${e.message}`);
            return [];
        }
    },
    
    hitLogHandler() {
        try {
            if (this.logFocusSlotI == -1 || !this.logObj || (mp.objects && !mp.objects.exists(this.logObj)) || this.logTimer != null) return;
            if (!this.isAxInHands()) return;
            if (!this.logSquats[this.logFocusSlotI]) {
                return mp.notify && mp.notify.error && mp.notify.error(`Перейдите к другой части бревна`, `Лесоруб`);
            }
            
            if (mp.busy && mp.busy.add) mp.busy.add("jobProcess", false);
            if (mp.events && mp.events.callRemote) mp.events.callRemote(`animations.playById`, 5523);
            
            this.logTimer = (mp.timer && mp.timer.add) ? mp.timer.add(() => {
                this.stopLogTimer();
                if (!this.logObj || (mp.objects && !mp.objects.exists(this.logObj)) || this.logFocusSlotI == -1 || !this.logSquats[this.logFocusSlotI]) {
                    return;
                }
                if (mp.events && mp.events.callRemote) {
                    mp.events.callRemote(`woodman.logs.hit`, this.logFocusSlotI);
                }
            }, 2000) : null;
        } catch (e) {
            console.log(`[Woodman] Error in hit log handler: ${e.message}`);
        }
    },
    
    stopLogTimer() {
        try {
            if (this.logTimer && mp.timer && mp.timer.remove) {
                mp.timer.remove(this.logTimer);
                this.logTimer = null;
            }
            if (mp.busy && mp.busy.remove) mp.busy.remove("jobProcess");
            if (mp.events && mp.events.callRemote) mp.events.callRemote(`animations.stop`);
        } catch (e) {
            console.log(`[Woodman] Error stopping log timer: ${e.message}`);
        }
    },
    
    createJobPeds() {
        try {
            var peds = [{
                model: "s_m_m_gardener_01",
                position: {
                    x: -567.0806274414062,
                    y: 5274.73291015625,
                    z: 70.23765563964844
                },
                heading: 166.43630981445312,
            },
            {
                model: "s_m_m_gentransport",
                position: {
                    x: -19.935161590576172,
                    y: -2640.25341796875,
                    z: 6.032257080078125
                },
                heading: 277.59271240234375,
            }];
            
            peds.forEach(x => {
                if (mp.events && mp.events.call) {
                    mp.events.call('NPC.create', x);
                }
            });
        } catch (e) {
            console.log(`[Woodman] Error creating job peds: ${e.message}`);
        }
    },
};

// События
if (mp.events && mp.events.add) {
    mp.events.add({
        "render": () => {
            try {
                var start = Date.now();
                var player = mp.players.local;
                
                if (!player || !mp.woodman.isAxInHands(player)) return;
                
                if (mp.woodman.treePos) {
                    if (mp.woodman.isFocusTree()) {
                        var pos2d = mp.game && mp.game.graphics && mp.game.graphics.world3dToScreen2d ? 
                                   mp.game.graphics.world3dToScreen2d(mp.woodman.treePos) : null;
                        if (pos2d) mp.woodman.drawTreeHealthBar(pos2d.x, pos2d.y);
                    }
                } else {
                    // Отключаем контролы атаки если не у дерева
                    if (mp.game && mp.game.controls) {
                        mp.game.controls.disableControlAction(0, 24, true);   // атаки
                        mp.game.controls.disableControlAction(0, 25, true);   // прицеливание
                        mp.game.controls.disableControlAction(0, 140, true);  // атаки R
                        mp.game.controls.disableControlAction(0, 257, true);  // атака2
                    }
                }
                
                if (mp.objects && mp.objects.exists && mp.objects.exists(mp.woodman.logObj) && mp.woodman.logObj) {
                    var slots = mp.woodman.getLogSlots(mp.woodman.logObj);
                    
                    if (mp.woodman.logTimer == null && player.getOffsetFromInWorldCoords) {
                        var playerPos = player.getOffsetFromInWorldCoords(0, 0, -1);
                        var nearSlot = mp.utils && mp.utils.getNearPos ? 
                                      mp.utils.getNearPos(playerPos, slots, mp.x) : slots[0];
                        mp.woodman.logFocusSlotI = slots.indexOf(nearSlot);
                        
                        var frontPos = player.getOffsetFromInWorldCoords(0, 0.5, -1);
                        if (mp.vdist && mp.vdist(playerPos, nearSlot) < mp.vdist(frontPos, nearSlot)) {
                            mp.woodman.logFocusSlotI = -1;
                        }
                    }
                    
                    for (var i = 0; i < slots.length; i++) {
                        var slot = slots[i];
                        var pos2d = mp.game && mp.game.graphics && mp.game.graphics.world3dToScreen2d ? 
                                   mp.game.graphics.world3dToScreen2d(slot) : null;
                        if (pos2d) mp.woodman.drawLogHealthBar(pos2d.x, pos2d.y, i);
                    }
                    
                    // Отключаем контролы атаки при работе с бревном
                    if (mp.game && mp.game.controls) {
                        mp.game.controls.disableControlAction(0, 24, true);
                        mp.game.controls.disableControlAction(0, 25, true);
                        mp.game.controls.disableControlAction(0, 140, true);
                        mp.game.controls.disableControlAction(0, 257, true);
                    }
                }
                
                // Обработка удара по дереву
                if (mp.woodman.lastStartMelee && Date.now() > mp.woodman.lastStartMelee + mp.woodman.hitWaitTime) {
                    mp.woodman.lastStartMelee = 0;
                    
                    if (mp.woodman.isAxInHands() && mp.woodman.treePos && mp.woodman.isFocusTree()) {
                        if (mp.events && mp.events.callRemote) {
                            mp.events.callRemote(`woodman.trees.hit`);
                        }
                    }
                }
                
                // Отображение времени рендера (если включен дебаг)
                if (mp.renderChecker && mp.utils && mp.utils.drawText2d) {
                    mp.utils.drawText2d(`woodman rend: ${Date.now() - start} ms`, [0.8, 0.69]);
                }
                
            } catch (e) {
                console.log(`[Woodman] Render error: ${e.message}`);
            }
        },
        
        "woodman.storage.inside": (data) => {
            mp.woodman.setInside(data);
        },
        
        "woodman.sell.inside": (data) => {
            mp.woodman.setSellInside(data);
        },
        
        "woodman.tree.inside": (pos, health) => {
            mp.woodman.setTreeInside(pos, health);
        },
        
        "woodman.tree.health": (health) => {
            mp.woodman.treeHealth = health || 0;
        },
        
        "woodman.log.request": () => {
            try {
                var slot = mp.woodman.getFreeTreeSlot();
                if (slot && mp.events && mp.events.callRemote) {
                    mp.events.callRemote(`woodman.logs.add`, JSON.stringify(slot));
                }
            } catch (e) {
                console.log(`[Woodman] Error requesting log: ${e.message}`);
            }
        },
        
        "woodman.log.inside": (squats, objId) => {
            mp.woodman.setLogInside(squats, objId);
        },
        
        "woodman.log.health": (objId, slotI, health) => {
            try {
                if (mp.woodman.logFocusSlotI == slotI) mp.woodman.stopLogTimer();
                if (!mp.woodman.logObj || (mp.objects && !mp.objects.exists(mp.woodman.logObj)) || 
                    mp.woodman.logObj.remoteId != objId) return;
                
                mp.woodman.logSquats[slotI] = health || 0;
            } catch (e) {
                console.log(`[Woodman] Error updating log health: ${e.message}`);
            }
        },
        
        "woodman.items.request": () => {
            try {
                if (!mp.woodman.logObj) return;
                
                var slots = mp.woodman.getLogSlots(mp.woodman.logObj);
                slots.forEach(slot => {
                    slot.z -= mp.woodman.logSize.height / 2;
                    slot.rZ = mp.woodman.logObj.rotation.z + 20;
                });
                
                if (mp.events && mp.events.callRemote) {
                    mp.events.callRemote(`woodman.items.add`, JSON.stringify(slots));
                }
            } catch (e) {
                console.log(`[Woodman] Error requesting items: ${e.message}`);
            }
        },
        
        "playerWeaponChanged": (weapon) => {
            try {
                if (mp.woodman.treePos) {
                    if (mp.woodman.isAxInHands()) {
                        mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_start_ax');
                    } else {
                        mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_take_ax');
                    }
                } else if (mp.woodman.logObj) {
                    if (mp.woodman.isAxInHands()) {
                        mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_log_start_ax');
                    } else {
                        mp.prompt && mp.prompt.showByName && mp.prompt.showByName('woodman_log_take_ax');
                    }
                }
            } catch (e) {
                console.log(`[Woodman] Error on weapon change: ${e.message}`);
            }
        },
        
        // <--- FIXED: порядок проверок — сначала контекст, потом наличие топора и прочее
        "playerStartMeleeCombat": () => {
            try {
                // Вне контекста лесоруба — игнорируем вообще
                if (!mp.woodman.isActive()) {
                    console.log(`[Woodman] Melee combat started outside woodman context`);
                    return;
                }

                // В контексте — без топора предупреждаем
                if (!mp.woodman.isAxInHands()) {
                    console.log(`[Woodman] Melee combat started in woodman context, but no ax`);
                    mp.notify && mp.notify.error && mp.notify.error(`Возьмите в руки топор`, `Лесоруб`);
                    return;
                }

                // Если работаем по дереву — проверяем фокус и здоровье
                if (mp.woodman.treePos) {
                    if (!mp.woodman.isFocusTree()) {
                        console.log(`[Woodman] Melee combat started, but not focused on tree`);
                        return;
                    }
                    if (mp.woodman.treeHealth <= 0) {
                        console.log(`[Woodman] Melee combat started, but tree health is 0`);
                        mp.notify && mp.notify.error && mp.notify.error(`Дерево исчерпало свой ресурс`, `Лесоруб`);
                        return;
                    }
                }

                mp.woodman.lastStartMelee = Date.now();
                console.log(`[Woodman] Melee combat started, triggering woodman.trees.hit`);
                if (mp.events && mp.events.callRemote) {
                    mp.events.callRemote(`woodman.trees.hit`);
                }
            } catch (e) {
                console.log(`[Woodman] Error on melee combat start: ${e.message}`);
            }
        },
        
        "click": (x, y, upOrDown, leftOrRight, relativeX, relativeY, worldPosition, hitEntity) => {
            try {
                if (upOrDown != 'down' || leftOrRight != 'left') return;
                
                if (mp.game && mp.game.ui && mp.game.ui.isPauseMenuActive && mp.game.ui.isPauseMenuActive()) return;
                if (mp.busy && mp.busy.includes && mp.busy.includes()) return;
                
                mp.woodman.hitLogHandler();
            } catch (e) {
                console.log(`[Woodman] Error on click: ${e.message}`);
            }
        },
    });
}

// Инициализация
try {
    mp.woodman.createJobPeds();
} catch (e) {
    console.log(`[Woodman] Error during initialization: ${e.message}`);
}
