(function () {
    const state = {
        tabletVisible: false,
        tabletTab: 'home',
        tabletData: null,
        motdDraft: '',
        descriptionDraft: '',
        logoDraft: '',
        inviteInput: '',
        rankEdits: {},
        newRank: {
            name: '',
            order: 1,
            canInvite: false,
            canKick: false,
            canManageRanks: false,
            canEditInfo: false,
            canDisband: false,
        },
        creationVisible: false,
        creationTab: 'home',
        creationData: null,
        creationForm: {
            name: '',
            logo: '',
            motd: '',
            description: '',
        },
    };

    let tabletContainer;
    let creationContainer;

    function escapeHtml(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function ensureTabletContainer() {
        if (tabletContainer) return;
        tabletContainer = document.createElement('div');
        tabletContainer.id = 'familiesTablet';
        tabletContainer.className = 'families-overlay families-hidden';
        document.body.appendChild(tabletContainer);

        tabletContainer.addEventListener('click', handleTabletClick);
        tabletContainer.addEventListener('input', handleTabletInput);
        tabletContainer.addEventListener('change', handleTabletChange);
        tabletContainer.addEventListener('submit', handleTabletSubmit);
    }

    function ensureCreationContainer() {
        if (creationContainer) return;
        creationContainer = document.createElement('div');
        creationContainer.id = 'familiesCreation';
        creationContainer.className = 'families-overlay families-hidden';
        document.body.appendChild(creationContainer);

        creationContainer.addEventListener('click', handleCreationClick);
        creationContainer.addEventListener('input', handleCreationInput);
        creationContainer.addEventListener('submit', handleCreationSubmit);
    }

    function hydrateTabletDrafts() {
        const family = (state.tabletData && state.tabletData.family) || {};
        const ranks = (state.tabletData && state.tabletData.ranks) || [];
        state.motdDraft = family.motd || '';
        state.descriptionDraft = family.description || '';
        state.logoDraft = family.logo || '';
        state.inviteInput = '';
        state.rankEdits = {};
        ranks.forEach(rank => {
            state.rankEdits[rank.id] = {
                name: rank.name || '',
                order: rank.order || 1,
                canInvite: !!rank.canInvite,
                canKick: !!rank.canKick,
                canManageRanks: !!rank.canManageRanks,
                canEditInfo: !!rank.canEditInfo,
                canDisband: !!rank.canDisband,
            };
        });
        state.newRank = {
            name: '',
            order: ranks.length + 1,
            canInvite: false,
            canKick: false,
            canManageRanks: false,
            canEditInfo: false,
            canDisband: false,
        };
    }

    function hydrateCreationForm() {
        state.creationForm = {
            name: '',
            logo: '',
            motd: '',
            description: '',
        };
    }

    function renderTablet() {
        ensureTabletContainer();
        if (!state.tabletVisible || !state.tabletData) {
            tabletContainer.classList.add('families-hidden');
            tabletContainer.innerHTML = '';
            return;
        }

        const { family = {}, ranks = [], members = [], invites = [], limits = {}, self = {} } = state.tabletData;
        const permissions = (self && self.permissions) || {};
        const limitData = {
            maxMembers: limits.maxMembers != null ? limits.maxMembers : '-'.toString(),
            maxRanks: limits.maxRanks != null ? limits.maxRanks : '-'.toString(),
        };

        let contentHtml = '';
        if (state.tabletTab === 'home') {
            contentHtml = renderTabletHome(family, permissions);
        } else if (state.tabletTab === 'members') {
            contentHtml = renderTabletMembers(members, ranks, permissions, self);
        } else if (state.tabletTab === 'invites') {
            contentHtml = renderTabletInvites(invites, permissions, limitData);
        } else if (state.tabletTab === 'settings') {
            contentHtml = renderTabletSettings(ranks, permissions, limitData);
        }

        tabletContainer.innerHTML = `
            <div class="families-window">
                <div class="families-header">
                    <div class="title">${escapeHtml(family.name || 'Семья')}</div>
                    <button class="families-close" data-action="tablet-close" type="button">×</button>
                </div>
                <div class="families-tabs">
                    ${renderTabButton('home', 'Главная')}
                    ${renderTabButton('members', 'Участники')}
                    ${renderTabButton('invites', 'Пригласить')}
                    ${renderTabButton('settings', 'Настройки')}
                </div>
                <div class="families-content">
                    ${contentHtml}
                </div>
            </div>
        `;
        tabletContainer.classList.remove('families-hidden');
    }

    function renderTabButton(tab, label) {
        const active = state.tabletTab === tab ? 'active' : '';
        return `<button class="${active}" data-action="tablet-tab" data-tab="${tab}" type="button">${label}</button>`;
    }

    function renderTabletHome(family, permissions) {
        return `
            <div class="families-section families-home">
                <div class="families-columns">
                    <div>
                        <h3>Описание</h3>
                        ${permissions.canEditInfo
                            ? `<textarea data-field="motd" placeholder="Опишите вашу семью">${escapeHtml(state.motdDraft)}</textarea>`
                            : `<p>${escapeHtml(family.motd || '')}</p>`}
                    </div>
                    <div>
                        <h3>Правила</h3>
                        ${permissions.canEditInfo
                            ? `<textarea data-field="description" placeholder="Укажите правила">${escapeHtml(state.descriptionDraft)}</textarea>`
                            : `<p>${escapeHtml(family.description || '')}</p>`}
                    </div>
                </div>
                ${permissions.canEditInfo
                    ? `<div class="families-actions"><button data-action="tablet-save-info" type="button">Сохранить информацию</button></div>`
                    : ''}
                <div class="families-summary">
                    <div><span>Основатель:</span> ${escapeHtml(family.ownerName || '—')}</div>
                    <div><span>Участников:</span> ${family.membersCount != null ? escapeHtml(family.membersCount) : '—'}</div>
                </div>
            </div>
        `;
    }

    function renderTabletMembers(members, ranks, permissions, self) {
        const rows = members.map(member => {
            const isSelf = self && member.characterId === self.characterId;
            const isOwner = member.isOwner;
            const actions = [];
            if (permissions.canManageRanks && !isOwner && !isSelf) {
                actions.push(`<button type="button" data-action="tablet-promote" data-character-id="${member.characterId}">▲</button>`);
                actions.push(`<button type="button" data-action="tablet-demote" data-character-id="${member.characterId}">▼</button>`);
                if (ranks && ranks.length) {
                    const options = ranks
                        .map(rank => `<option value="${rank.id}">${escapeHtml(rank.name)}</option>`)
                        .join('');
                    actions.push(`<select data-action="tablet-assign-select" data-character-id="${member.characterId}">
                        <option value="">Назначить</option>
                        ${options}
                    </select>`);
                }
            }
            if (permissions.canKick && !isOwner && !isSelf) {
                actions.push(`<button type="button" class="danger" data-action="tablet-kick" data-character-id="${member.characterId}">Исключить</button>`);
            }
            return `
                <tr class="${member.online ? 'online' : 'offline'}">
                    <td>${escapeHtml(member.name)}${member.isOwner ? ' (Основатель)' : ''}</td>
                    <td>${escapeHtml(member.rankName || '—')}</td>
                    <td>${member.online ? 'В игре' : 'Не в сети'}</td>
                    ${(permissions.canManageRanks || permissions.canKick) ? `<td>${actions.join('')}</td>` : ''}
                </tr>
            `;
        }).join('');

        return `
            <div class="families-section families-members">
                <table>
                    <thead>
                        <tr>
                            <th>Игрок</th>
                            <th>Ранг</th>
                            <th>Статус</th>
                            ${(permissions.canManageRanks || permissions.canKick) ? '<th>Действия</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function renderTabletInvites(invites, permissions, limitData) {
        const inviteItems = invites.map(invite => {
            const expiresAt = invite.expiresAt ? new Date(invite.expiresAt) : null;
            const expiresLabel = expiresAt && !Number.isNaN(expiresAt.valueOf()) ? expiresAt.toLocaleString() : '—';
            return `
                <div class="families-invite-item">
                    <div class="info">
                        <div>${escapeHtml(invite.name || 'Неизвестно')}</div>
                        <div class="meta">Истекает: ${escapeHtml(expiresLabel)}</div>
                    </div>
                    ${permissions.canInvite ? `<button type="button" data-action="tablet-cancel-invite" data-invite-id="${invite.id}">Отменить</button>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="families-section families-invites">
                ${permissions.canInvite ? `
                    <form class="families-invite-form" data-action="tablet-invite-form">
                        <label>Введите ID игрока</label>
                        <input type="text" data-field="inviteInput" placeholder="ID" value="${escapeHtml(state.inviteInput)}" />
                        <button type="submit">Отправить приглашение</button>
                        <div class="families-hint">Максимум участников: ${escapeHtml(limitData.maxMembers)}</div>
                    </form>
                ` : ''}
                <div class="families-invite-list">
                    <h4>Отправленные приглашения</h4>
                    ${invites.length === 0 ? '<div class="families-empty">Нет активных приглашений</div>' : inviteItems}
                </div>
            </div>
        `;
    }

    function renderTabletSettings(ranks, permissions, limitData) {
        const rankCards = ranks.map(rank => {
            const form = state.rankEdits[rank.id] || {
                name: rank.name || '',
                order: rank.order || 1,
                canInvite: !!rank.canInvite,
                canKick: !!rank.canKick,
                canManageRanks: !!rank.canManageRanks,
                canEditInfo: !!rank.canEditInfo,
                canDisband: !!rank.canDisband,
            };
            const disabled = !permissions.canManageRanks || rank.order === 1;
            const checkboxes = ['canInvite', 'canKick', 'canManageRanks', 'canEditInfo', 'canDisband']
                .map(key => `
                    <label>
                        <input type="checkbox" data-rank-id="${rank.id}" data-rank-field="${key}" ${form[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
                        ${permissionName(key)}
                    </label>
                `).join('');
            return `
                <div class="families-rank">
                    <div class="rank-header">
                        <input type="text" data-rank-id="${rank.id}" data-rank-field="name" value="${escapeHtml(form.name)}" ${!permissions.canManageRanks ? 'disabled' : ''} />
                        <input type="number" data-rank-id="${rank.id}" data-rank-field="order" value="${escapeHtml(form.order)}" ${!permissions.canManageRanks ? 'disabled' : ''} />
                    </div>
                    <div class="rank-perms">${checkboxes}</div>
                    ${permissions.canManageRanks ? `
                        <div class="rank-actions">
                            <button type="button" data-action="tablet-save-rank" data-rank-id="${rank.id}">Сохранить</button>
                            ${rank.order !== 1 ? `<button type="button" class="danger" data-action="tablet-delete-rank" data-rank-id="${rank.id}">Удалить</button>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        const newRankCheckboxes = ['canInvite', 'canKick', 'canManageRanks', 'canEditInfo', 'canDisband']
            .map(key => `
                <label>
                    <input type="checkbox" data-new-rank-field="${key}" ${state.newRank[key] ? 'checked' : ''} />
                    ${permissionName(key)}
                </label>
            `).join('');

        return `
            <div class="families-section families-settings">
                ${permissions.canEditInfo ? `
                    <div class="families-logo">
                        <label>Логотип (URL)</label>
                        <input type="text" data-field="logo" placeholder="https://" value="${escapeHtml(state.logoDraft)}" />
                        <button type="button" data-action="tablet-save-logo">Сохранить логотип</button>
                    </div>
                ` : ''}
                <div class="families-ranks">
                    <h4>Ранги</h4>
                    ${rankCards || '<div class="families-empty">Рангов нет</div>'}
                </div>
                ${permissions.canManageRanks ? `
                    <form class="families-rank-create" data-action="tablet-new-rank">
                        <h4>Новый ранг</h4>
                        <input type="text" placeholder="Название" data-new-rank-field="name" value="${escapeHtml(state.newRank.name)}" required />
                        <input type="number" placeholder="Порядок" data-new-rank-field="order" value="${escapeHtml(state.newRank.order)}" min="1" />
                        <div class="rank-perms">${newRankCheckboxes}</div>
                        <button type="submit">Создать ранг</button>
                        <div class="families-hint">Максимум рангов: ${escapeHtml(limitData.maxRanks)}</div>
                    </form>
                ` : ''}
                ${permissions.canDisband ? `
                    <div class="families-actions">
                        <button type="button" class="danger" data-action="tablet-disband">Расформировать семью</button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function permissionName(key) {
        switch (key) {
            case 'canInvite': return 'Приглашения';
            case 'canKick': return 'Исключения';
            case 'canManageRanks': return 'Управление рангами';
            case 'canEditInfo': return 'Редактирование инфо';
            case 'canDisband': return 'Расформирование';
            default: return key;
        }
    }

    function renderCreation() {
        ensureCreationContainer();
        if (!state.creationVisible || !state.creationData) {
            creationContainer.classList.add('families-hidden');
            creationContainer.innerHTML = '';
            return;
        }

        let contentHtml = '';
        if (state.creationTab === 'home') {
            contentHtml = renderCreationHome();
        } else if (state.creationTab === 'create') {
            contentHtml = renderCreationForm();
        } else if (state.creationTab === 'list') {
            contentHtml = renderCreationList();
        }

        creationContainer.innerHTML = `
            <div class="families-window">
                <div class="families-header">
                    <div class="title">Оформление семьи</div>
                    <button class="families-close" data-action="creation-close" type="button">×</button>
                </div>
                <div class="families-tabs">
                    ${renderCreationTab('home', 'Главная')}
                    ${renderCreationTab('create', 'Создать')}
                    ${renderCreationTab('list', 'Список')}
                </div>
                <div class="families-content">
                    ${contentHtml}
                </div>
            </div>
        `;
        creationContainer.classList.remove('families-hidden');
    }

    function renderCreationTab(tab, label) {
        const active = state.creationTab === tab ? 'active' : '';
        return `<button class="${active}" data-action="creation-tab" data-tab="${tab}" type="button">${label}</button>`;
    }

    function renderCreationHome() {
        const info = (state.creationData && state.creationData.info) || {};
        const cost = Number(state.creationData && state.creationData.cost) || 0;
        const minHours = Number(state.creationData && state.creationData.minHours) || 0;
        return `
            <div class="families-section families-home">
                <p>${escapeHtml(info.about || '')}</p>
                <p>${escapeHtml(info.rules || '')}</p>
                <div class="families-summary">
                    <div><span>Стоимость:</span> $${escapeHtml(cost.toLocaleString())}</div>
                    <div><span>Минимум часов:</span> ${escapeHtml(minHours)}</div>
                </div>
            </div>
        `;
    }

    function renderCreationForm() {
        const data = state.creationData || {};
        const cost = Number(data.cost) || 0;
        return `
            <form class="families-section families-create" data-action="creation-form">
                <label>Название</label>
                <input type="text" data-creation-field="name" value="${escapeHtml(state.creationForm.name)}" maxlength="32" required />
                <label>Ссылка на логотип (необязательно)</label>
                <input type="text" data-creation-field="logo" value="${escapeHtml(state.creationForm.logo)}" maxlength="256" placeholder="https://" />
                <label>Описание</label>
                <textarea data-creation-field="motd" placeholder="${escapeHtml((data.info && data.info.about) || '')}">${escapeHtml(state.creationForm.motd)}</textarea>
                <label>Правила</label>
                <textarea data-creation-field="description" placeholder="${escapeHtml((data.info && data.info.rules) || '')}">${escapeHtml(state.creationForm.description)}</textarea>
                <button type="submit">Создать семью за $${escapeHtml(cost.toLocaleString())}</button>
            </form>
        `;
    }

    function renderCreationList() {
        const families = (state.creationData && state.creationData.families) || [];
        const cards = families.map(item => `
            <div class="families-card">
                ${item.logo ? `<img src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.name)}" />` : ''}
                <div class="card-name">${escapeHtml(item.name)}</div>
                <div class="card-info">Участники: ${escapeHtml(item.members || 0)}</div>
                <div class="card-info">Основатель: ${escapeHtml(item.owner || '—')}</div>
            </div>
        `).join('');
        return `
            <div class="families-section families-list">
                ${families.length === 0 ? '<div class="families-empty">Семей пока нет</div>' : `<div class="families-grid">${cards}</div>`}
            </div>
        `;
    }

    function handleTabletClick(event) {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        switch (action) {
            case 'tablet-close':
                closeTablet();
                mp.trigger('families.tablet.hide');
                break;
            case 'tablet-tab':
                state.tabletTab = actionEl.getAttribute('data-tab');
                renderTablet();
                break;
            case 'tablet-save-info':
                mp.trigger('callRemote', 'families.text.save', JSON.stringify({
                    motd: state.motdDraft,
                    description: state.descriptionDraft,
                }));
                break;
            case 'tablet-save-logo':
                mp.trigger('callRemote', 'families.logo.save', state.logoDraft || '');
                break;
            case 'tablet-cancel-invite':
                mp.trigger('callRemote', 'families.invite.cancel', parseInt(actionEl.getAttribute('data-invite-id'), 10));
                break;
            case 'tablet-promote':
                mp.trigger('callRemote', 'families.member.rank', parseInt(actionEl.getAttribute('data-character-id'), 10), 'up');
                break;
            case 'tablet-demote':
                mp.trigger('callRemote', 'families.member.rank', parseInt(actionEl.getAttribute('data-character-id'), 10), 'down');
                break;
            case 'tablet-kick':
                mp.trigger('callRemote', 'families.member.kick', parseInt(actionEl.getAttribute('data-character-id'), 10));
                break;
            case 'tablet-save-rank': {
                const rankId = parseInt(actionEl.getAttribute('data-rank-id'), 10);
                const payload = state.rankEdits[rankId];
                if (payload) {
                    mp.trigger('callRemote', 'families.rank.update', rankId, JSON.stringify(payload));
                }
                break;
            }
            case 'tablet-delete-rank': {
                const rankId = parseInt(actionEl.getAttribute('data-rank-id'), 10);
                mp.trigger('callRemote', 'families.rank.delete', rankId);
                break;
            }
            case 'tablet-disband':
                if (confirm('Вы уверены, что хотите расформировать семью?')) {
                    mp.trigger('callRemote', 'families.disband');
                }
                break;
            default:
                break;
        }
    }

    function handleTabletInput(event) {
        const field = event.target.getAttribute('data-field');
        if (field) {
            if (field === 'motd') state.motdDraft = event.target.value;
            else if (field === 'description') state.descriptionDraft = event.target.value;
            else if (field === 'logo') state.logoDraft = event.target.value;
            else if (field === 'inviteInput') state.inviteInput = event.target.value;
            return;
        }
        const rankField = event.target.getAttribute('data-rank-field');
        if (rankField) {
            const rankId = parseInt(event.target.getAttribute('data-rank-id'), 10);
            if (!state.rankEdits[rankId]) state.rankEdits[rankId] = {};
            if (rankField === 'order') state.rankEdits[rankId][rankField] = parseInt(event.target.value, 10) || 1;
            else state.rankEdits[rankId][rankField] = event.target.value;
            return;
        }
        const newRankField = event.target.getAttribute('data-new-rank-field');
        if (newRankField) {
            if (newRankField === 'order') state.newRank.order = parseInt(event.target.value, 10) || 1;
            else state.newRank[newRankField] = event.target.value;
        }
    }

    function handleTabletChange(event) {
        const rankField = event.target.getAttribute('data-rank-field');
        if (rankField && event.target.type === 'checkbox') {
            const rankId = parseInt(event.target.getAttribute('data-rank-id'), 10);
            if (!state.rankEdits[rankId]) state.rankEdits[rankId] = {};
            state.rankEdits[rankId][rankField] = event.target.checked;
            return;
        }
        const newRankField = event.target.getAttribute('data-new-rank-field');
        if (newRankField && event.target.type === 'checkbox') {
            state.newRank[newRankField] = event.target.checked;
            return;
        }
        if (event.target.getAttribute('data-action') === 'tablet-assign-select') {
            const characterId = parseInt(event.target.getAttribute('data-character-id'), 10);
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value)) {
                mp.trigger('callRemote', 'families.member.rank', characterId, 'set', value);
            }
            event.target.value = '';
        }
    }

    function handleTabletSubmit(event) {
        const action = event.target.getAttribute('data-action');
        if (!action) return;
        event.preventDefault();
        if (action === 'tablet-invite-form') {
            const targetId = parseInt(state.inviteInput, 10);
            if (!Number.isNaN(targetId)) {
                mp.trigger('callRemote', 'families.invite.send', targetId);
            }
            state.inviteInput = '';
            renderTablet();
        } else if (action === 'tablet-new-rank') {
            mp.trigger('callRemote', 'families.rank.create', JSON.stringify(state.newRank));
            state.newRank = {
                name: '',
                order: ((state.tabletData && state.tabletData.ranks ? state.tabletData.ranks.length : 0) || 0) + 1,
                canInvite: false,
                canKick: false,
                canManageRanks: false,
                canEditInfo: false,
                canDisband: false,
            };
            renderTablet();
        }
    }

    function handleCreationClick(event) {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        switch (action) {
            case 'creation-close':
                closeCreation();
                mp.trigger('families.creation.hide');
                break;
            case 'creation-tab':
                state.creationTab = actionEl.getAttribute('data-tab');
                renderCreation();
                break;
            default:
                break;
        }
    }

    function handleCreationInput(event) {
        const field = event.target.getAttribute('data-creation-field');
        if (!field) return;
        state.creationForm[field] = event.target.value;
    }

    function handleCreationSubmit(event) {
        const action = event.target.getAttribute('data-action');
        if (action !== 'creation-form') return;
        event.preventDefault();
        mp.trigger('callRemote', 'families.creation.create', JSON.stringify(state.creationForm));
    }

    function closeTablet() {
        state.tabletVisible = false;
        state.tabletData = null;
        renderTablet();
    }

    function closeCreation() {
        state.creationVisible = false;
        state.creationData = null;
        renderCreation();
    }

    window.familiesUI = {
        openTablet(data) {
            state.tabletVisible = true;
            state.tabletData = data || null;
            state.tabletTab = 'home';
            hydrateTabletDrafts();
            renderTablet();
        },
        refreshTablet(data) {
            if (!state.tabletVisible) return;
            state.tabletData = data || null;
            hydrateTabletDrafts();
            renderTablet();
        },
        closeTablet,
        openCreation(data) {
            state.creationVisible = true;
            state.creationData = data || null;
            state.creationTab = 'home';
            hydrateCreationForm();
            renderCreation();
        },
        closeCreation,
    };
})();
