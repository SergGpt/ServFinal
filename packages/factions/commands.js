let factions = require('./index');
let notifs = require('../notifications');
let vehicles = call('vehicles');

module.exports = {
    "/flist": {
        description: "Посмотреть список организаций.",
        access: 1,
        args: "",
        handler: (player, args, out) => {
            var text = "ID) Имя [бп] [макс. бп] [мед] [макс. мед] | блип | цвет_блипа | ранг склада<br/>";
            for (var i = 0; i < factions.factions.length; i++) {
                var faction = factions.factions[i];
                text += `${faction.id}) ${faction.name} [${faction.ammo}] [${faction.maxAmmo}] [${faction.medicines}] [${faction.maxMedicines}] | ${faction.blip} | ${faction.blipColor} | ${faction.ammoRank}<br/>`;
            }
            out.log(text, player);
        }
    },
    "/fsetgaragepos": {
    description: "Поставить точку гаража фракции (позиция берётся от игрока).",
    access: 6,
    args: "[ид_организации]:n",
    handler: (player, args, out) => {
        const faction = factions.getFaction(args[0]);
        if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

        const pos = player.position;
        faction.gX = pos.x; faction.gY = pos.y; faction.gZ = pos.z;
        faction.gD = player.dimension; faction.gH = player.heading;
        faction.save();

        const existing = factions.getGarage(faction.id);
        if (existing) {
            existing.colshape.destroy();
            existing.position = new mp.Vector3(pos.x, pos.y, pos.z - 1);
            existing.dimension = faction.gD;
            if (existing.blip) { existing.blip.position = existing.position; existing.blip.dimension = faction.gD; }
            const cs = mp.colshapes.newSphere(existing.position.x, existing.position.y, existing.position.z, 1.5, existing.dimension);
            cs.onEnter = existing.colshape.onEnter; cs.onExit = existing.colshape.onExit; existing.colshape = cs;
            existing.label.position = new mp.Vector3(existing.position.x, existing.position.y, existing.position.z + 1.5);
            existing.label.dimension = existing.dimension;
        } else {
            factions.createGarageMarker(faction);
        }
        out.info(`${player.name} изменил позицию гаража у организации ${faction.name}`);
    }
},
    "/fgarageaddveh": {
        description: "Добавить текущее авто в гараж фракции (key=faction).",
        access: 6,
        args: "[ид_организации]:n [мин_ранг]:n",
        handler: async (player, args, out) => {
            const veh = player.vehicle;
            if (!veh || !veh.db) return out.error(`Вы должны сидеть в авто из БД`, player);

            const faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            const minRank = Math.clamp(parseInt(args[1]) || 1, 1, faction.ranks.length);
            veh.db.key = 'faction';
            veh.db.owner = faction.id;
            veh.key = 'faction';
            veh.owner = faction.id;
            veh.spawned = false;
            veh.position = new mp.Vector3(0, 0, -100);
            veh.dimension = 999999;

            veh.db.x = 0;
            veh.db.y = 0;
            veh.db.z = -100;
            veh.db.h = veh.heading;
            veh.db.dimension = 999999;
            await veh.db.save();

            factions.setVehicleMinRank(veh, minRank);
            out.info(`${player.name} добавил ${veh.db.modelName} [#${veh.db.id}] в гараж ${faction.name} (мин. ранг ${minRank})`);
        }
    },
    "/fgaragevehlist": {
        description: "Список фракционных машин для гаража организации.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            const faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            const rows = [];
            mp.vehicles.forEach(v => {
                if (!v || !v.db) return;
                if (v.db.key !== 'faction') return;
                if (v.db.owner != faction.id) return;
                rows.push(`${v.db.id}) ${v.db.modelName} [${v.db.plate}] | minRank=${v.db.minRank ? v.db.minRank.rank : 1} | ${v.spawned !== false ? 'В мире' : 'В гараже'}`);
            });

            if (!rows.length) return out.info(`У ${faction.name} нет машин в runtime`, player);
            out.log(rows.join('<br/>'), player);
        }
    },
    "/fgaragesetspawn": {
        description: "Alias для /fsetgaragepos (точка выдачи машин гаража).",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            const faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            const pos = player.position;
            faction.gX = pos.x;
            faction.gY = pos.y;
            faction.gZ = pos.z;
            faction.gD = player.dimension;
            faction.gH = player.heading;
            faction.save();
            out.info(`${player.name} обновил spawn гаража для ${faction.name}`);
        }
    },
    "/fgaragecreateveh": {
        description: "Создать новое авто сразу в БД и добавить в гараж фракции.",
        access: 6,
        args: "[ид_организации]:n [model]:s [мин_ранг]:n [color1]:n [color2]:n",
        handler: async (player, args, out) => {
            const faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            const modelName = String(args[1]).toLowerCase();
            const minRank = Math.clamp(parseInt(args[2]) || 1, 1, faction.ranks.length);
            const color1 = parseInt(args[3]) || 0;
            const color2 = parseInt(args[4]) || 0;

            const dbVeh = await db.Models.Vehicle.create({
                key: 'faction',
                owner: faction.id,
                modelName: modelName,
                plate: vehicles.generateVehiclePlate(),
                color1: color1,
                color2: color2,
                x: 0,
                y: 0,
                z: -100,
                h: player.heading,
                fuel: 70,
                health: 1000,
                destroys: 0,
                engineState: 0,
                steeringState: 0,
                fuelState: 0,
                brakeState: 0,
                dimension: 999999,
                mileage: 0
            });

            dbVeh.d = dbVeh.dimension;
            const veh = await vehicles.spawnVehicle(dbVeh, 0);
            veh.spawned = false;
            veh.dimension = 999999;
            veh.position = new mp.Vector3(0, 0, -100);
            factions.setVehicleMinRank(veh, minRank);

            out.info(`${player.name} создал ${modelName} [#${dbVeh.id}] для гаража ${faction.name} (мин. ранг ${minRank})`);
        }
    },
    "/fgarageui": {
        description: "Открыть UI гаража фракции (тест).",
        access: 0,
        args: "",
        handler: (player, args, out) => {
            if (!player.character || !player.character.factionId) return out.error(`Вы не в фракции`, player);
            player.call('factions.garage.menu.open');
        }
    },

    "/ftp": {
        description: "Телепортироваться к организации.",
        access: 1,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var marker = factions.getMarker(args[0]);
            if (!marker) return out.error(`Организация #${args[0]} не найдена`, player);
            var pos = marker.position;
            pos.z++;
            player.position = pos;
            player.dimension = marker.dimension;
            out.info(`Вы телепортировались к организации #${args[0]}`, player);
        }
    },
    "/fsetname": {
        description: "Сменить имя организации.",
        access: 6,
        args: "[ид_организации]:n [имя]",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            args.splice(0, 1);
            var name = args.join(" ").trim();
            out.info(`${player.name} сменил имя у организации ${faction.name} (${faction.name} => ${name})`);
            faction.name = name;
            faction.save();
        }
    },
    "/fsetleaderoff": {
        description: "Сменить лидера организации оффлайн.",
        access: 6,
        args: "[ид_организации]:n [имя] [фамилия]",
        handler: async (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var fullName = `${args[1]} ${args[2]}`;
            var rec = mp.players.getByName(fullName);
            var character = (rec) ? rec.character : await db.Models.Character.findOne({
                attributes: ['id', 'faction', 'factionRank'],
                where: {
                    name: fullName
                }
            });;
            if (!character) return out.error(`Персонаж ${fullName} не найден`, player);

            const maxRank = factions.getMaxRank(faction);
            if (!maxRank) return out.error(`У организации ${faction.name} не настроены ранги (FactionRanks)`, player);

            out.info(`${player.name} добавил лидера организации ${faction.name} оффлайн (#${character.id})`);
            character.factionId = faction.id;
            character.factionRank = maxRank.id;
            character.save();
        }
    },
    "/fsetleader": {
        description: "Сменить лидера организации.",
        access: 1,
        args: "[ид_игрока]:n [ид_организации]:n",
        handler: async (player, args, out) => {
            var faction = factions.getFaction(args[1]);
            if (!faction) return out.error(`Организация #${args[1]} не найдена`, player);

            var rec = mp.players.at(args[0]);
            if (!rec || !rec.character) return out.error(`Игрок #${args[0]} не найден`, player);

            const maxRank = factions.getMaxRank(faction);
            if (!maxRank) return out.error(`У организации ${faction.name} не настроены ранги (FactionRanks)`, player);

            out.info(`${player.name} добавил лидера организации ${faction.name} (${rec.name})`);
            factions.setLeader(faction, rec);
        }
    },
    "/fuval": {
        description: "Уволить игрока из организации.",
        access: 1,
        args: "[ид_игрока]:n",
        handler: async (player, args, out) => {
            var rec = mp.players.at(args[0]);
            if (!rec || !rec.character) return out.error(`Игрок #${args[0]} не найден`, player);

            if (!rec.character.factionId) return out.error(`${rec.name} не состоит в организации`, player);
            var faction = factions.getFaction(rec.character.factionId);
            if (!faction) return out.error(`Организация #${rec.character.factionId} не найдена`, player);

            out.info(`${player.name} уволил ${rec.name} из организации ${faction.name}`);
            factions.deleteMember(rec);
        }
    },
    "/fadd": {
        description: "Добавить игрока в организацию.",
        access: 6,
        args: "[ид_игрока]:n [ид_организации]:n",
        handler: async (player, args, out) => {
            var rec = mp.players.at(args[0]);
            if (!rec || !rec.character) return out.error(`Игрок #${args[0]} не найден`, player);

            var faction = factions.getFaction(args[1]);
            if (!faction) return out.error(`Организация #${args[1]} не найдена`, player);


            const minRank = factions.getMinRank(faction);
            if (!minRank) return out.error(`У организации ${faction.name} не настроены ранги (FactionRanks)`, player);

            out.info(`${player.name} добавил ${rec.name} в организацию ${faction.name}`);
            factions.addMember(faction, rec);
        }
    },
    "/fgiverank": {
        description: "Изменить ранг игрока в организацию.",
        access: 6,
        args: "[ид_игрока]:n [ранг]:n",
        handler: async (player, args, out) => {
            var rec = mp.players.at(args[0]);
            if (!rec || !rec.character) return out.error(`Игрок #${args[0]} не найден`, player);

            if (!rec.character.factionId) return out.error(`${rec.name} не состоит в организации`, player);

            var rank = factions.getRank(rec.character.factionId, args[1]);
            if (!rank) return out.error(`Ранг #${args[1]} не найден`, player);

            out.info(`${player.name} изменил ранг ${rec.name} (${rank.rank})`);
            factions.setRank(rec, rank);
        }
    },
    "/fsetammo": {
        description: "Изменить количество боеприпасов на складе организации.",
        access: 1,
        args: "[ид_организации]:n [боеприпасы]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            out.info(`${player.name} изменил количество боеприпасов у организации ${faction.name} (${faction.ammo} => ${args[1]})`);
            factions.setAmmo(faction, args[1]);
        }
    },
    "/fsetmaxammo": {
        description: "Изменить вместимость боеприпасов на складе организации.",
        access: 6,
        args: "[ид_организации]:n [вместимость]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            out.info(`${player.name} изменил вместимость боеприпасов на складе у организации ${faction.name} (${faction.maxAmmo} => ${args[1]})`);
            factions.setMaxAmmo(faction, args[1]);
        }
    },
    "/fsetmeds": {
        description: "Изменить количество медикаментов на складе организации.",
        access: 6,
        args: "[ид_организации]:n [медикаменты]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            out.info(`${player.name} изменил количество медикаментов у организации ${faction.name} (${faction.medicines} => ${args[1]})`);
            factions.setMedicines(faction, args[1]);
        }
    },
    "/fsetmaxmeds": {
        description: "Изменить вместимость медикаментов на складе организации.",
        access: 6,
        args: "[ид_организации]:n [вместимость]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            out.info(`${player.name} изменил вместимость медикаментов на складе у организации ${faction.name} (${faction.maxMedicines} => ${args[1]})`);
            factions.setMaxMedicines(faction, args[1]);
        }
    },
    "/fsetblip": {
        description: "Изменить блип на карте у организации.",
        access: 5,
        args: "[ид_организации]:n [тип_блипа]:n [цвет_блипа]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            out.info(`${player.name} изменил блип у организации ${faction.name} (${faction.blip}-${faction.blipColor} => ${args[0]}-${args[1]})`);
            factions.setBlip(faction, args[1], args[2]);
        }
    },
    "/fsetammorank": {
        description: "Изменить минимальный ранг, с которого можно брать ящики БП/Мед со склада организации.",
        access: 4,
        args: "[ид_организации]:n [ранг]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            args[1] = Math.clamp(args[1], 0, faction.ranks.length - 1);

            out.info(`${player.name} изменил мин. ранг для доступа к складу у организации ${faction.name} (${faction.ammoRank} => ${args[1]})`);
            factions.setAmmoRank(faction, args[1]);
        }
    },
    "/fsetpos": {
        description: "Изменить позицию организации. Позиция берется от игрока.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var pos = player.position;
            faction.x = pos.x;
            faction.y = pos.y;
            faction.z = pos.z;
            faction.h = player.heading;
            faction.d = player.dimension;
            faction.save();
            pos.z -= 1;

            var marker = factions.getMarker(faction.id);
            marker.position = pos;
            marker.dimension = faction.d;
            var blip = factions.getBlip(faction.id);
            blip.position = pos;
            blip.dimension = faction.d;

            out.info(`${player.name} изменил позицию у организации ${faction.name}`);
        }
    },
    "/fsetwarehousepos": {
        description: "Изменить позицию склада организации. Позиция берется от игрока.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var pos = player.position;
            faction.wX = pos.x;
            faction.wY = pos.y;
            faction.wZ = pos.z;
            faction.wD = player.dimension;
            faction.save();
            pos.z -= 1;

            var warehouse = factions.getWarehouse(faction.id);
            warehouse.colshape.destroy();
            warehouse.position = pos;
            warehouse.dimension = faction.wD;
            pos.z += 2;
            warehouse.label.position = pos;
            warehouse.label.dimension = faction.wD;

            var colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5, warehouse.dimension);
            colshape.onEnter = warehouse.colshape.onEnter;
            colshape.onExit = warehouse.colshape.onExit;
            warehouse.colshape = colshape;


            out.info(`${player.name} изменил позицию склада у организации ${faction.name}`);
        }
    },
    "/fsetstoragepos": {
        description: "Изменить позицию выдачи предметов организации. Позиция берется от игрока.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var pos = player.position;
            faction.sX = pos.x;
            faction.sY = pos.y;
            faction.sZ = pos.z;
            faction.sD = player.dimension;
            faction.save();
            pos.z -= 1;

            var storage = factions.getStorage(faction.id);
            storage.colshape.destroy();
            storage.position = pos;
            storage.dimension = faction.sD;

            var colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5, storage.dimension);
            colshape.onEnter = storage.colshape.onEnter;
            colshape.onExit = storage.colshape.onExit;
            storage.colshape = colshape;

            out.info(`${player.name} изменил позицию выдачи предметов у организации ${faction.name}`);
        }
    },
    "/fsetholderpos": {
        description: "Изменить позицию шкафа организации. Позиция берется от игрока.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var pos = player.position;
            faction.hX = pos.x;
            faction.hY = pos.y;
            faction.hZ = pos.z;
            faction.hD = player.dimension;
            faction.save();
            pos.z -= 1;

            var holder = factions.getHolder(faction.id);
            holder.colshape.destroy();
            holder.position = pos;
            holder.dimension = faction.hD;

            var colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5, holder.dimension);
            colshape.onEnter = holder.colshape.onEnter;
            colshape.onExit = holder.colshape.onExit;

            holder.colshape = colshape;

            out.info(`${player.name} изменил позицию шкафа у организации ${faction.name}`);
        }
    },
    "/fsetcommonpos": {
        description: "Изменить позицию общего шкафа организации. Позиция берется от игрока.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            let faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            let pos = player.position;
            faction.chX = pos.x;
            faction.chY = pos.y;
            faction.chZ = pos.z;
            faction.chD = player.dimension;
            faction.save();
            pos.z -= 1;

            let holder = factions.getCommonHolder(faction.id);
            holder.colshape.destroy();
            holder.position = pos;
            holder.dimension = faction.chD;

            let colshape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 1.5);
            colshape.dimension = faction.chD;
            colshape.onEnter = holder.colshape.onEnter;
            colshape.onExit = holder.colshape.onExit;

            holder.colshape = colshape;

            out.info(`${player.name} изменил позицию общего шкафа у организации ${faction.name}`);
        }
    },
    "/franks": {
        description: "Получить список рангов организации.",
        access: 6,
        args: "[ид_организации]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var text = `Организация ${faction.name}:<br/>`;
            for (var i = 0; i < faction.ranks.length; i++) {
                var rank = faction.ranks[i];
                text += `${i + 1}) ${rank.name} - $${rank.pay}<br/>`;
            }

            out.log(text, player);
        }
    },
    "/fsetrankname": {
        description: "Изменить название ранга.",
        access: 6,
        args: "[ид_организации]:n [номер_ранга]:n [название]",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var rank = faction.ranks[args[1] - 1];

            args.splice(0, 2);
            var name = args.join(" ").trim();
            out.info(`${player.name} изменил название ранга ${rank.rank} у организации ${faction.name} (${rank.name} => ${name})`);
            rank.name = name;
            rank.save();
        }
    },
    "/fsetrankpay": {
        description: "Изменить зарплату ранга.",
        access: 6,
        args: "[ид_организации]:n [номер_ранга]:n [сумма]:n",
        handler: (player, args, out) => {
            var faction = factions.getFaction(args[0]);
            if (!faction) return out.error(`Организация #${args[0]} не найдена`, player);

            var rank = faction.ranks[args[1] - 1];

            out.info(`${player.name} изменил зарплату ранга ${rank.pay} у организации ${faction.name} (${rank.pay} => ${args[2]})`);
            rank.pay = args[2];
            rank.save();
        }
    },
    "/fdebug": {
        description: "Диагностика состояния фракции игрока.",
        access: 6,
        args: "[ид_игрока]:n",
        handler: (player, args, out) => {
            const rec = mp.players.at(args[0]);
            if (!rec || !rec.character) return out.error(`Игрок #${args[0]} не найден`, player);

            const factionId = rec.character.factionId;
            if (!factionId) return out.info(`${rec.name} не состоит в организации`, player);

            const faction = factions.getFaction(factionId);
            if (!faction) return out.error(`Фракция #${factionId} не найдена в runtime`, player);

            const rankById = factions.getRankById(faction, rec.character.factionRank);
            const minRank = factions.getMinRank(faction);
            const maxRank = factions.getMaxRank(faction);

            const marker = factions.getMarker(faction.id);
            const storage = factions.getStorage(faction.id);
            const holder = factions.getHolder(faction.id);
            const commonHolder = factions.getCommonHolder(faction.id);
            const warehouse = factions.getWarehouse(faction.id);
            const blipsPos = factions.getBlipsPos(faction.id);

            const lines = [
                `Игрок: ${rec.name} (#${rec.id})`,
                `Фракция: #${faction.id} ${faction.name} (type=${typeof faction.id})`,
                `FactionRank (id): ${rec.character.factionRank}`,
                `Текущий ранг: ${rankById ? `${rankById.name} (rank=${rankById.rank})` : 'НЕ НАЙДЕН'}`,
                `Минимальный ранг: ${minRank ? `${minRank.name} (#${minRank.id})` : 'НЕТ'}`,
                `Максимальный ранг: ${maxRank ? `${maxRank.name} (#${maxRank.id})` : 'НЕТ'}`,
                `Количество рангов: ${faction.ranks ? faction.ranks.length : 0}`,
                `rastFactionId: ${factions.rastFactionId}, normalizedFactionId: ${factions.getFactionId(faction)}`,
                `Crime/Band/Mafia: ${factions.isCrimeFaction(faction)} / ${factions.isBandFaction(faction)} / ${factions.isMafiaFaction(faction)}`,
                `Marker/Storage/Holder/Common/Warehouse: ${!!marker} / ${!!storage} / ${!!holder} / ${!!commonHolder} / ${!!warehouse}`,
                `BlipsPos: ${blipsPos ? 'OK' : 'NULL'}`
            ];

            out.log(lines.join('<br/>'), player);
        }
    },
}
