"use strict";

const CREATION_NPC_MODEL = "a_m_y_business_03";
const CREATION_NPC_HEADING = 118.0;
const CREATION_NPC_POS = new mp.Vector3(-546.49, -198.21, 38.23);
const CREATION_MARKER_POS = new mp.Vector3(-546.6, -198.5, 37.73);
const CREATION_MARKER_COLOR = [114, 204, 114, 90];
const DEFAULT_NOTIFICATION_TITLE = "Семья";
const INVITE_CLEANUP_INTERVAL = 60 * 1000;

let notifications;
let prompt;
let money;
let utils;

const DEFAULT_ABOUT = "Расскажите об истории вашей семьи, целях и традициях. Это описание увидят все участники.";
const DEFAULT_RULES = "Опишите основные правила и обязанности для членов семьи. Текст можно редактировать в настройках.";

function toPlain(model) {
    return model ? model.get({ plain: true }) : null;
}

function compareRanks(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.order - b.order;
}

module.exports = {
    creationCost: 250000,
    minCreateHours: 10,
    maxMembers: 60,
    maxRanks: 10,
    inviteLifetime: 10 * 60 * 1000,
    creationMarker: null,
    creationColshape: null,
    cleanupTimer: null,
    cleanupInterval: INVITE_CLEANUP_INTERVAL,
    _serviceWarnings: {},

    ensureServices() {
        const logOnce = (key, err) => {
            if (!this._serviceWarnings[key]) {
                console.error(`[FAMILIES] ${key} service unavailable: ${err.message || err}`);
                this._serviceWarnings[key] = true;
            }
        };
        if (!notifications) {
            try {
                notifications = call('notifications');
                this._serviceWarnings.notifications = false;
            } catch (err) {
                logOnce('notifications', err);
            }
        }
        if (!prompt) {
            try {
                prompt = call('prompt');
                this._serviceWarnings.prompt = false;
            } catch (err) {
                logOnce('prompt', err);
            }
        }
        if (!money) {
            try {
                money = call('money');
                this._serviceWarnings.money = false;
            } catch (err) {
                logOnce('money', err);
            }
        }
        if (!utils) {
            try {
                utils = call('utils');
                this._serviceWarnings.utils = false;
            } catch (err) {
                logOnce('utils', err);
            }
        }
    },

    notify(target, type, message, title = DEFAULT_NOTIFICATION_TITLE) {
        this.ensureServices();
        if (!notifications || typeof notifications[type] !== 'function') return false;
        try {
            notifications[type](target, message, title);
            return true;
        } catch (err) {
            console.error(`[FAMILIES] Failed to send notification (${type}):`, err);
        }
        return false;
    },

    handleError(player, context, err) {
        console.error(`[FAMILIES] ${context} error:`, err);
        if (player) this.notify(player, 'error', 'Произошла внутренняя ошибка. Попробуйте позже.', DEFAULT_NOTIFICATION_TITLE);
    },

    startCleanupTimer() {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredInvites().catch((err) => this.handleError(null, 'cleanupExpiredInvites', err));
        }, this.cleanupInterval);
    },

    async cleanupExpiredInvites() {
        const now = new Date();
        const removed = await db.Models.FamilyInvite.destroy({
            where: { expiresAt: { [Op.lt]: now } },
        });
        if (removed > 0) {
            console.log(`[FAMILIES] Cleaned ${removed} expired family invites`);
        }
    },

    init() {
        this.ensureServices();
        this.createCreationSpot();
        mp.players.forEach((player) => {
            this.sendCreationNpc(player);
        });
        this.startCleanupTimer();
        this.cleanupExpiredInvites().catch((err) => this.handleError(null, 'cleanupExpiredInvites', err));
        console.log("[FAMILIES] Module initialized");
        inited(__dirname);
    },

    async loadPlayerFamily(player) {
        if (!player.character) return;
        const membership = await db.Models.FamilyMember.findOne({
            where: { characterId: player.character.id },
            include: [
                {
                    model: db.Models.Family,
                    as: 'Family',
                    include: [
                        { model: db.Models.FamilyRank, as: 'Ranks' },
                    ],
                },
                { model: db.Models.FamilyRank, as: 'Rank' },
            ],
        });
        if (!membership) {
            player.family = null;
            player.familyMember = null;
            return;
        }
        const family = toPlain(membership.Family);
        const rank = toPlain(membership.Rank);
        const permissions = this.getPermissions(family, membership.characterId, rank);
        player.family = {
            id: family.id,
            name: family.name,
            logo: family.logo,
            motd: family.motd,
            description: family.description,
            ownerId: family.ownerId,
            rank,
            permissions,
        };
        player.familyMember = membership;
    },

    getPermissions(family, characterId, rank) {
        const owner = family && family.ownerId === characterId;
        if (owner) {
            return {
                canInvite: true,
                canKick: true,
                canManageRanks: true,
                canEditInfo: true,
                canDisband: true,
            };
        }
        if (!rank) {
            return {
                canInvite: false,
                canKick: false,
                canManageRanks: false,
                canEditInfo: false,
                canDisband: false,
            };
        }
        return {
            canInvite: !!rank.canInvite,
            canKick: !!rank.canKick,
            canManageRanks: !!rank.canManageRanks,
            canEditInfo: !!rank.canEditInfo,
            canDisband: !!rank.canDisband,
        };
    },

    async openTablet(player) {
        if (!player.family) {
            this.notify(player, 'error', 'Вы не состоите в семье');
            return;
        }
        const payload = await this.buildFamilyPayload(player.family.id, player.character.id);
        this.decoratePayloadForPlayer(player, payload);
        player.call('families.tablet.open', [payload]);
    },

    async openCreation(player) {
        const data = await this.getCreationData();
        player.call('families.creation.open', [data]);
    },

    async getCreationData() {
        const families = await db.Models.Family.findAll({
            include: [
                { model: db.Models.FamilyMember, as: 'Members', attributes: ['id'] },
                { model: db.Models.Character, as: 'Owner', attributes: ['id', 'name'] },
            ],
        });
        return {
            cost: this.creationCost,
            minHours: this.minCreateHours,
            info: {
                about: DEFAULT_ABOUT,
                rules: DEFAULT_RULES,
            },
            families: families.map(fam => ({
                id: fam.id,
                name: fam.name,
                logo: fam.logo,
                members: fam.Members.length,
                owner: fam.Owner ? fam.Owner.name : null,
            })),
        };
    },

    async createFamily(player, payload) {
        if (!player.character) {
            this.notify(player, 'error', 'Персонаж не найден');
            return;
        }
        if (player.family) {
            this.notify(player, 'error', 'Вы уже состоите в семье');
            return;
        }
        const hours = Math.floor((player.character.minutes || 0) / 60);
        if (hours < this.minCreateHours) {
            this.notify(player, 'error', `Необходимо минимум ${this.minCreateHours} часов`);
            return;
        }
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        let name = (data.name || '').trim();
        const logo = data.logo ? data.logo.trim() : null;
        const motd = (data.motd || '').trim() || DEFAULT_ABOUT;
        const description = (data.description || '').trim() || DEFAULT_RULES;
        if (name.length < 3 || name.length > 32) {
            this.notify(player, 'error', 'Название должно содержать от 3 до 32 символов');
            return;
        }
        if (!/^[A-Za-zА-Яа-я0-9\s]+$/.test(name)) {
            this.notify(player, 'error', 'Название содержит недопустимые символы');
            return;
        }
        const existing = await db.Models.Family.findOne({ where: { name } });
        if (existing) {
            this.notify(player, 'error', 'Такая семья уже существует');
            return;
        }
        this.ensureServices();
        if (!money || typeof money.removeCash !== 'function') {
            this.notify(player, 'error', 'Платежный сервис недоступен. Попробуйте позже.');
            return;
        }
        const paid = await new Promise((resolve) => {
            money.removeCash(player, this.creationCost, (result) => {
                resolve(!!result);
            }, `Создание семьи ${name}`);
        });
        if (!paid) {
            this.notify(player, 'error', 'Недостаточно наличных средств');
            return;
        }
        const family = await db.Models.Family.create({
            name,
            ownerId: player.character.id,
            logo: logo && logo.length ? logo.substring(0, 256) : null,
            motd,
            description,
        });
        const ranksData = this.getDefaultRanks();
        const ranks = [];
        for (let i = 0; i < ranksData.length; i++) {
            const rankInfo = ranksData[i];
            const rank = await db.Models.FamilyRank.create(Object.assign({
                familyId: family.id,
            }, rankInfo));
            ranks.push(rank);
        }
        const leaderRank = ranks.sort(compareRanks)[0];
        await db.Models.FamilyMember.create({
            familyId: family.id,
            characterId: player.character.id,
            rankId: leaderRank ? leaderRank.id : null,
        });
        await this.loadPlayerFamily(player);
        this.notify(player, 'success', 'Семья успешно создана');
        player.call('families.creation.close');
        await this.refreshTablet(player);
    },

    getDefaultRanks() {
        return [
            { name: 'Основатель', order: 1, canInvite: true, canKick: true, canManageRanks: true, canEditInfo: true, canDisband: true },
            { name: 'Заместитель', order: 2, canInvite: true, canKick: true, canManageRanks: true, canEditInfo: true, canDisband: false },
            { name: 'Участник', order: 3, canInvite: false, canKick: false, canManageRanks: false, canEditInfo: false, canDisband: false },
        ];
    },

    async buildFamilyPayload(familyId, selfCharacterId) {
        const family = await db.Models.Family.findOne({
            where: { id: familyId },
            include: [
                { model: db.Models.FamilyRank, as: 'Ranks', separate: true, order: [['order', 'ASC']] },
                { model: db.Models.FamilyMember, as: 'Members', include: [
                    { model: db.Models.Character, as: 'Character', attributes: ['id', 'name', 'minutes'] },
                    { model: db.Models.FamilyRank, as: 'Rank' },
                ]},
                { model: db.Models.FamilyInvite, as: 'Invites', include: [
                    { model: db.Models.Character, as: 'Character', attributes: ['id', 'name'] },
                ]},
                { model: db.Models.Character, as: 'Owner', attributes: ['id', 'name'] },
            ],
        });
        if (!family) return null;
        const ranks = family.Ranks.map(rank => ({
            id: rank.id,
            name: rank.name,
            order: rank.order,
            canInvite: !!rank.canInvite,
            canKick: !!rank.canKick,
            canManageRanks: !!rank.canManageRanks,
            canEditInfo: !!rank.canEditInfo,
            canDisband: !!rank.canDisband,
        })).sort(compareRanks);
        const members = family.Members.map(member => {
            const character = member.Character;
            const rank = member.Rank;
            const onlinePlayer = this.getOnlinePlayerByCharacterId(member.characterId);
            return {
                characterId: member.characterId,
                name: character ? character.name : 'Неизвестно',
                rankId: member.rankId,
                rankName: rank ? rank.name : 'Без ранга',
                rankOrder: rank ? rank.order : 999,
                isOwner: family.ownerId === member.characterId,
                online: !!onlinePlayer,
                ping: onlinePlayer ? onlinePlayer.ping : null,
                minutes: character ? character.minutes : 0,
            };
        }).sort((a, b) => {
            if (a.rankOrder === b.rankOrder) return a.name.localeCompare(b.name);
            return a.rankOrder - b.rankOrder;
        });
        const invites = family.Invites.map(invite => ({
            id: invite.id,
            characterId: invite.characterId,
            name: invite.Character ? invite.Character.name : 'Неизвестно',
            expiresAt: invite.expiresAt,
            pending: this.isInviteActive(invite),
            isSelf: invite.characterId === selfCharacterId,
        }));
        return {
            family: {
                id: family.id,
                name: family.name,
                logo: family.logo,
                motd: family.motd,
                description: family.description,
                ownerId: family.ownerId,
                ownerName: family.Owner ? family.Owner.name : null,
                membersCount: members.length,
                createdAt: family.createdAt,
            },
            ranks,
            members,
            invites,
        };
    },

    isInviteActive(invite) {
        if (!invite || !invite.expiresAt) return false;
        return new Date(invite.expiresAt).getTime() > Date.now();
    },

    async updateTexts(player, fields) {
        if (!player.family || !player.family.permissions.canEditInfo) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const data = typeof fields === 'string' ? JSON.parse(fields) : fields;
        const updates = {};
        if (typeof data.motd === 'string') updates.motd = data.motd.trim().substring(0, 2000);
        if (typeof data.description === 'string') updates.description = data.description.trim().substring(0, 2000);
        if (!Object.keys(updates).length) return;
        await db.Models.Family.update(updates, { where: { id: player.family.id } });
        await this.loadPlayerFamily(player);
        await this.refreshTablet(player);
        this.notify(player, 'success', 'Информация обновлена');
    },

    async updateLogo(player, url) {
        if (!player.family || !player.family.permissions.canEditInfo) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const logo = (url || '').trim();
        if (logo.length > 256) {
            this.notify(player, 'error', 'Ссылка слишком длинная');
            return;
        }
        await db.Models.Family.update({ logo: logo || null }, { where: { id: player.family.id } });
        await this.loadPlayerFamily(player);
        this.notify(player, 'success', 'Логотип обновлён');
        await this.refreshTablet(player);
    },

    async disbandFamily(player) {
        if (!player.family || !player.family.permissions.canDisband) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const familyId = player.family.id;
        const members = await db.Models.FamilyMember.findAll({
            where: { familyId },
            attributes: ['characterId'],
        });
        await db.Models.Family.destroy({ where: { id: familyId } });
        members.forEach(({ characterId }) => {
            const targetPlayer = this.getOnlinePlayerByCharacterId(characterId);
            if (!targetPlayer) return;
            targetPlayer.family = null;
            targetPlayer.familyMember = null;
            targetPlayer.call('families.tablet.close');
            this.notify(targetPlayer, 'warning', 'Семья была расформирована');
        });
        this.notify(player, 'warning', 'Семья расформирована');
        player.call('families.tablet.close');
        player.family = null;
        player.familyMember = null;
    },

    async invitePlayer(player, targetId) {
        if (!player.family || !player.family.permissions.canInvite) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const familyId = player.family.id;
        const currentMembers = await db.Models.FamilyMember.count({ where: { familyId } });
        if (currentMembers >= this.maxMembers) {
            this.notify(player, 'error', 'Достигнут лимит участников');
            return;
        }
        this.ensureServices();
        let target = null;
        if (typeof targetId === 'number') {
            target = mp.players.at(targetId);
        } else if (utils && typeof utils.getPlayerBySqlId === 'function') {
            target = utils.getPlayerBySqlId(targetId);
        }
        let parsedId = null;
        if (!target && (typeof targetId === 'number' || !Number.isNaN(parseInt(targetId, 10)))) {
            parsedId = typeof targetId === 'number' ? targetId : parseInt(targetId, 10);
            if (!Number.isNaN(parsedId)) {
                target = mp.players.at(parsedId) || target;
            }
        }
        let character;
        if (target && target.character) {
            character = target.character;
        } else {
            const charId = parsedId != null ? parsedId : parseInt(targetId, 10);
            if (isNaN(charId)) {
                this.notify(player, 'error', 'Игрок не найден');
                return;
            }
            character = await db.Models.Character.findByPk(charId, { attributes: ['id', 'name'] });
            if (!character) {
                this.notify(player, 'error', 'Игрок не найден');
                return;
            }
            if (await db.Models.FamilyMember.findOne({ where: { characterId: charId } })) {
                this.notify(player, 'error', 'Игрок уже состоит в семье');
                return;
            }
        }
        if (await db.Models.FamilyInvite.findOne({ where: { familyId, characterId: character.id } })) {
            this.notify(player, 'error', 'Приглашение уже отправлено');
            return;
        }
        const invite = await db.Models.FamilyInvite.create({
            familyId,
            characterId: character.id,
            inviterId: player.character.id,
            expiresAt: new Date(Date.now() + this.inviteLifetime),
        });
        this.notify(player, 'success', `Приглашение для ${character.name} отправлено`);
        if (target && target.character) {
            target.familyInvite = { id: invite.id, familyId };
            target.call('offerDialog.show', ['family_invite', {
                name: player.name,
                family: player.family.name,
                inviteId: invite.id,
            }]);
            this.notify(target, 'info', `${player.name} приглашает вас в ${player.family.name}`);
        } else {
            this.notify(character.id, 'info', `${player.name} приглашает вас в ${player.family.name}`);
        }
        await this.refreshTablet(player);
    },

    async acceptInvite(player, inviteId) {
        const invite = await db.Models.FamilyInvite.findByPk(inviteId);
        if (!invite || invite.characterId !== player.character.id) {
            this.notify(player, 'error', 'Приглашение не найдено');
            return;
        }
        if (!this.isInviteActive(invite)) {
            await invite.destroy();
            this.notify(player, 'error', 'Приглашение устарело');
            return;
        }
        if (await db.Models.FamilyMember.findOne({ where: { characterId: player.character.id } })) {
            await invite.destroy();
            this.notify(player, 'error', 'Вы уже состоите в семье');
            return;
        }
        const familyMembers = await db.Models.FamilyMember.count({ where: { familyId: invite.familyId } });
        if (familyMembers >= this.maxMembers) {
            await invite.destroy();
            this.notify(player, 'error', 'В семье нет свободных мест');
            return;
        }
        const ranks = await db.Models.FamilyRank.findAll({ where: { familyId: invite.familyId }, order: [['order', 'ASC']] });
        const baseRank = ranks[ranks.length - 1];
        await db.Models.FamilyMember.create({ familyId: invite.familyId, characterId: player.character.id, rankId: baseRank ? baseRank.id : null });
        await invite.destroy();
        if (player.familyInvite && player.familyInvite.id === inviteId) player.familyInvite = null;
        await this.loadPlayerFamily(player);
        this.notify(player, 'success', 'Вы вступили в семью');
        player.call('families.tablet.close');
    },

    async declineInvite(player, inviteId) {
        const invite = await db.Models.FamilyInvite.findByPk(inviteId);
        if (!invite || invite.characterId !== player.character.id) return;
        await invite.destroy();
        if (player.familyInvite && player.familyInvite.id === inviteId) player.familyInvite = null;
        this.notify(player, 'info', 'Приглашение отклонено');
    },

    async cancelInvite(player, inviteId) {
        if (!player.family || !player.family.permissions.canInvite) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const invite = await db.Models.FamilyInvite.findByPk(inviteId);
        if (!invite || invite.familyId !== player.family.id) {
            this.notify(player, 'error', 'Приглашение не найдено');
            return;
        }
        await invite.destroy();
        const targetPlayer = this.getOnlinePlayerByCharacterId(invite.characterId);
        if (targetPlayer && targetPlayer.familyInvite && targetPlayer.familyInvite.id === inviteId) {
            targetPlayer.familyInvite = null;
            targetPlayer.call('offerDialog.close');
        }
        this.notify(player, 'info', 'Приглашение отменено');
        await this.refreshTablet(player);
    },

    async kickMember(player, characterId) {
        if (!player.family || !player.family.permissions.canKick) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        if (player.character.id === characterId) {
            this.notify(player, 'error', 'Нельзя исключить себя');
            return;
        }
        const member = await db.Models.FamilyMember.findOne({
            where: { familyId: player.family.id, characterId },
            include: [{ model: db.Models.FamilyRank, as: 'Rank' }],
        });
        if (!member) {
            this.notify(player, 'error', 'Игрок не состоит в семье');
            return;
        }
        const myRank = player.family.rank;
        if (!this.canAffectRank(myRank, member.Rank, characterId === player.family.ownerId)) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        await member.destroy();
        const targetPlayer = this.getOnlinePlayerByCharacterId(characterId);
        if (targetPlayer) {
            targetPlayer.family = null;
            targetPlayer.familyMember = null;
            targetPlayer.call('families.tablet.close');
            this.notify(targetPlayer, 'warning', `${player.name} исключил вас из семьи`);
        }
        this.notify(player, 'success', 'Участник исключен');
        await this.refreshTablet(player);
    },

    async setMemberRank(player, characterId, direction, rankId) {
        if (!player.family || !player.family.permissions.canManageRanks) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const member = await db.Models.FamilyMember.findOne({
            where: { familyId: player.family.id, characterId },
            include: [{ model: db.Models.FamilyRank, as: 'Rank' }],
        });
        if (!member) {
            this.notify(player, 'error', 'Игрок не состоит в семье');
            return;
        }
        if (player.character.id === characterId) {
            this.notify(player, 'error', 'Нельзя изменять свой ранг');
            return;
        }
        const myRank = player.family.rank;
        if (!this.canAffectRank(myRank, member.Rank, characterId === player.family.ownerId)) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const ranks = await db.Models.FamilyRank.findAll({ where: { familyId: player.family.id }, order: [['order', 'ASC']] });
        if (!ranks.length) return;
        let targetRank;
        if (direction === 'up' || direction === 'down') {
            const sorted = ranks.sort(compareRanks);
            const index = sorted.findIndex(r => r.id === (member.rankId || 0));
            if (index === -1) {
                targetRank = direction === 'up' ? sorted[sorted.length - 1] : sorted[0];
            } else {
                const nextIndex = direction === 'up' ? index - 1 : index + 1;
                if (nextIndex < 0 || nextIndex >= sorted.length) {
                    this.notify(player, 'error', 'Дальнейшее изменение невозможно');
                    return;
                }
                targetRank = sorted[nextIndex];
            }
        } else if (direction === 'set') {
            const desiredRankId = parseInt(rankId, 10);
            if (Number.isNaN(desiredRankId)) {
                this.notify(player, 'error', 'Ранг не найден');
                return;
            }
            targetRank = ranks.find(r => r.id === desiredRankId);
            if (!targetRank) {
                this.notify(player, 'error', 'Ранг не найден');
                return;
            }
            if (!this.canAffectRank(myRank, targetRank, false)) {
                this.notify(player, 'error', 'Недостаточно прав');
                return;
            }
        }
        if (!targetRank) return;
        await member.update({ rankId: targetRank.id });
        const targetPlayer = this.getOnlinePlayerByCharacterId(characterId);
        if (targetPlayer) {
            await this.loadPlayerFamily(targetPlayer);
            this.notify(targetPlayer, 'info', `Ваш ранг: ${targetRank.name}`);
        }
        this.notify(player, 'success', `Новый ранг: ${targetRank.name}`);
        await this.refreshTablet(player);
    },

    canAffectRank(myRank, targetRank, isOwner) {
        if (!myRank) return false;
        if (isOwner) return false;
        if (!targetRank) return true;
        return compareRanks(myRank, targetRank) < 0;
    },

    async createRank(player, data) {
        if (!player.family || !player.family.permissions.canManageRanks) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const currentCount = await db.Models.FamilyRank.count({ where: { familyId: player.family.id } });
        if (currentCount >= this.maxRanks) {
            this.notify(player, 'error', 'Достигнут лимит рангов');
            return;
        }
        const payload = typeof data === 'string' ? JSON.parse(data) : data;
        const name = (payload.name || '').trim();
        if (name.length < 2 || name.length > 32) {
            this.notify(player, 'error', 'Название ранга от 2 до 32 символов');
            return;
        }
        const order = parseInt(payload.order) || currentCount + 1;
        await db.Models.FamilyRank.create({
            familyId: player.family.id,
            name,
            order,
            canInvite: !!payload.canInvite,
            canKick: !!payload.canKick,
            canManageRanks: !!payload.canManageRanks,
            canEditInfo: !!payload.canEditInfo,
            canDisband: !!payload.canDisband,
        });
        this.notify(player, 'success', 'Ранг создан');
        await this.refreshTablet(player);
    },

    async updateRank(player, rankId, data) {
        if (!player.family || !player.family.permissions.canManageRanks) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const rank = await db.Models.FamilyRank.findOne({ where: { id: rankId, familyId: player.family.id } });
        if (!rank) {
            this.notify(player, 'error', 'Ранг не найден');
            return;
        }
        const payload = typeof data === 'string' ? JSON.parse(data) : data;
        const updates = {};
        if (payload.name) {
            const name = payload.name.trim();
            if (name.length < 2 || name.length > 32) {
                this.notify(player, 'error', 'Название ранга от 2 до 32 символов');
                return;
            }
            updates.name = name;
        }
        if (payload.order != null) updates.order = parseInt(payload.order) || rank.order;
        ['canInvite', 'canKick', 'canManageRanks', 'canEditInfo', 'canDisband'].forEach(key => {
            if (payload[key] != null) updates[key] = !!payload[key];
        });
        if (rank.order === 1) {
            updates.canInvite = true;
            updates.canKick = true;
            updates.canManageRanks = true;
            updates.canEditInfo = true;
            updates.canDisband = true;
        }
        await rank.update(updates);
        this.notify(player, 'success', 'Ранг обновлён');
        await this.refreshTablet(player);
    },

    async deleteRank(player, rankId) {
        if (!player.family || !player.family.permissions.canManageRanks) {
            this.notify(player, 'error', 'Недостаточно прав');
            return;
        }
        const rank = await db.Models.FamilyRank.findOne({ where: { id: rankId, familyId: player.family.id } });
        if (!rank) {
            this.notify(player, 'error', 'Ранг не найден');
            return;
        }
        if (rank.order === 1) {
            this.notify(player, 'error', 'Нельзя удалить основной ранг');
            return;
        }
        const members = await db.Models.FamilyMember.count({ where: { familyId: player.family.id, rankId: rank.id } });
        if (members > 0) {
            this.notify(player, 'error', 'В ранге есть участники');
            return;
        }
        await rank.destroy();
        this.notify(player, 'success', 'Ранг удален');
        await this.refreshTablet(player);
    },

    getOnlinePlayerByCharacterId(characterId) {
        if (!characterId) return null;
        return mp.players.toArray().find(p => p.character && p.character.id === characterId) || null;
    },

    decoratePayloadForPlayer(player, payload) {
        if (!payload) return;
        payload.self = {
            characterId: player.character.id,
            permissions: player.family ? player.family.permissions : {},
            rankId: player.family && player.family.rank ? player.family.rank.id : null,
        };
        payload.limits = {
            maxMembers: this.maxMembers,
            maxRanks: this.maxRanks,
        };
    },

    async refreshTablet(player) {
        if (!player.family) return;
        const payload = await this.buildFamilyPayload(player.family.id, player.character.id);
        if (!payload) {
            player.call('families.tablet.close');
            return;
        }
        this.decoratePayloadForPlayer(player, payload);
        player.call('families.tablet.refresh', [payload]);
    },

    sendCreationNpc(player) {
        if (!player) return;
        player.call('families.creation.npc', [{
            model: CREATION_NPC_MODEL,
            heading: CREATION_NPC_HEADING,
            position: { x: CREATION_NPC_POS.x, y: CREATION_NPC_POS.y, z: CREATION_NPC_POS.z },
            defaultScenario: 'WORLD_HUMAN_CLIPBOARD',
        }]);
    },

    createCreationSpot() {
        this.ensureServices();
        const marker = mp.markers.new(1, CREATION_MARKER_POS, 1.0, { color: CREATION_MARKER_COLOR, visible: true, dimension: 0 });
        const colshape = mp.colshapes.newSphere(CREATION_MARKER_POS.x, CREATION_MARKER_POS.y, CREATION_MARKER_POS.z, 1.5);
        colshape.onEnter = (player) => {
            if (!player.character) return;
            player.setVariable('familiesCreation', true);
            if (prompt && typeof prompt.show === 'function') {
                prompt.show(player, '<span>E</span> Оформить семью');
            }
        };
        colshape.onExit = (player) => {
            if (!player.character) return;
            player.setVariable('familiesCreation', undefined);
            if (prompt && typeof prompt.hide === 'function') {
                prompt.hide(player);
            }
            player.call('families.creation.close');
        };
        this.creationMarker = marker;
        this.creationColshape = colshape;
    },
};
