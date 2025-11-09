/* global mp */
import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import '../styles/families.css';

class FamiliesApp extends Component {
    constructor(props) {
        super(props);
        this.state = {
            tabletTab: 'home',
            creationTab: 'home',
            motd: '',
            description: '',
            logo: '',
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
            creationForm: {
                name: '',
                logo: '',
                motd: '',
                description: '',
            }
        };

        this.handleTabletTabChange = this.handleTabletTabChange.bind(this);
        this.handleCreationTabChange = this.handleCreationTabChange.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleRankFieldChange = this.handleRankFieldChange.bind(this);
        this.handleNewRankFieldChange = this.handleNewRankFieldChange.bind(this);
        this.handleCreationFieldChange = this.handleCreationFieldChange.bind(this);
    }

    componentDidUpdate(prevProps) {
        if (this.props.tabletData !== prevProps.tabletData) {
            const { tabletData } = this.props;
            if (tabletData && tabletData.family) {
                const { family, ranks } = tabletData;
                this.setState({
                    motd: family.motd || '',
                    description: family.description || '',
                    logo: family.logo || '',
                    rankEdits: this.buildRankEdits(ranks),
                    newRank: {
                        name: '',
                        order: ranks ? ranks.length + 1 : 1,
                        canInvite: false,
                        canKick: false,
                        canManageRanks: false,
                        canEditInfo: false,
                        canDisband: false,
                    }
                });
            }
        } else if (prevProps.tabletData && !this.props.tabletData) {
            this.setState({
                tabletTab: 'home',
            });
        }
        if (!prevProps.showCreation && this.props.showCreation) {
            this.setState({
                creationTab: 'home',
                creationForm: {
                    name: '',
                    logo: '',
                    motd: '',
                    description: '',
                }
            });
        }
    }

    buildRankEdits(ranks) {
        if (!Array.isArray(ranks)) return {};
        const map = {};
        ranks.forEach(rank => {
            map[rank.id] = {
                name: rank.name,
                order: rank.order,
                canInvite: rank.canInvite,
                canKick: rank.canKick,
                canManageRanks: rank.canManageRanks,
                canEditInfo: rank.canEditInfo,
                canDisband: rank.canDisband,
            };
        });
        return map;
    }

    handleTabletTabChange(tab) {
        this.setState({ tabletTab: tab });
    }

    handleCreationTabChange(tab) {
        this.setState({ creationTab: tab });
    }

    handleInputChange(event) {
        const { name, value } = event.target;
        this.setState({ [name]: value });
    }

    handleRankFieldChange(rankId, field, value) {
        this.setState(prevState => ({
            rankEdits: {
                ...prevState.rankEdits,
                [rankId]: {
                    ...prevState.rankEdits[rankId],
                    [field]: value,
                }
            }
        }));
    }

    handleNewRankFieldChange(field, value) {
        this.setState(prevState => ({
            newRank: {
                ...prevState.newRank,
                [field]: value,
            }
        }));
    }

    handleCreationFieldChange(field, value) {
        this.setState(prevState => ({
            creationForm: {
                ...prevState.creationForm,
                [field]: value,
            }
        }));
    }

    closeTablet() {
        mp.events.call('families.tablet.hide');
    }

    closeCreation() {
        mp.events.call('families.creation.hide');
    }

    saveInfo() {
        const { motd, description } = this.state;
        mp.trigger('callRemote', 'families.text.save', JSON.stringify({ motd, description }));
    }

    saveLogo() {
        mp.trigger('callRemote', 'families.logo.save', this.state.logo);
    }

    sendInvite(event) {
        event.preventDefault();
        const { inviteInput } = this.state;
        if (!inviteInput.trim()) return;
        mp.trigger('callRemote', 'families.invite.send', inviteInput.trim());
        this.setState({ inviteInput: '' });
    }

    cancelInvite(inviteId) {
        mp.trigger('callRemote', 'families.invite.cancel', inviteId);
    }

    promoteMember(characterId) {
        mp.trigger('callRemote', 'families.member.rank', characterId, 'up', 0);
    }

    demoteMember(characterId) {
        mp.trigger('callRemote', 'families.member.rank', characterId, 'down', 0);
    }

    setMemberRank(characterId, rankId) {
        mp.trigger('callRemote', 'families.member.rank', characterId, 'set', rankId);
    }

    kickMember(characterId) {
        mp.trigger('callRemote', 'families.member.kick', characterId);
    }

    saveRank(rankId) {
        const data = this.state.rankEdits[rankId];
        if (!data) return;
        mp.trigger('callRemote', 'families.rank.update', rankId, JSON.stringify(data));
    }

    deleteRank(rankId) {
        mp.trigger('callRemote', 'families.rank.delete', rankId);
    }

    createRank(event) {
        event.preventDefault();
        const { newRank } = this.state;
        if (!newRank.name.trim()) return;
        mp.trigger('callRemote', 'families.rank.create', JSON.stringify(newRank));
        this.setState({
            newRank: {
                name: '',
                order: newRank.order + 1,
                canInvite: false,
                canKick: false,
                canManageRanks: false,
                canEditInfo: false,
                canDisband: false,
            }
        });
    }

    disbandFamily() {
        mp.trigger('callRemote', 'families.disband');
    }

    submitCreation(event) {
        event.preventDefault();
        const { creationForm } = this.state;
        mp.trigger('callRemote', 'families.creation.create', JSON.stringify(creationForm));
    }

    renderTablet() {
        const { tabletData, familiesState } = this.props;
        if (!familiesState.showTablet || !tabletData) return null;
        const { family, ranks, members, invites, limits, self } = tabletData;
        const limitData = limits || { maxMembers: '-', maxRanks: '-' };
        const permissions = (self && self.permissions) || {};
        const { tabletTab, motd, description, logo, inviteInput, rankEdits, newRank } = this.state;

        return (
            <div id="familiesTablet">
                <div className="families-window">
                    <div className="families-header">
                        <div className="title">{family.name}</div>
                        <button className="families-close" onClick={() => this.closeTablet()}>×</button>
                    </div>
                    <div className="families-tabs">
                        <button className={tabletTab === 'home' ? 'active' : ''} onClick={() => this.handleTabletTabChange('home')}>Главная</button>
                        <button className={tabletTab === 'members' ? 'active' : ''} onClick={() => this.handleTabletTabChange('members')}>Участники</button>
                        <button className={tabletTab === 'invites' ? 'active' : ''} onClick={() => this.handleTabletTabChange('invites')}>Пригласить</button>
                        <button className={tabletTab === 'settings' ? 'active' : ''} onClick={() => this.handleTabletTabChange('settings')}>Настройки</button>
                    </div>
                    <div className="families-content">
                        {tabletTab === 'home' && this.renderTabletHome(family, permissions, motd, description)}
                        {tabletTab === 'members' && this.renderTabletMembers(members, ranks, permissions, self)}
                        {tabletTab === 'invites' && this.renderTabletInvites(invites, permissions, inviteInput, limitData)}
                        {tabletTab === 'settings' && this.renderTabletSettings(ranks, permissions, rankEdits, newRank, limitData, logo)}
                    </div>
                </div>
            </div>
        );
    }

    renderTabletHome(family, permissions, motd, description) {
        return (
            <div className="families-section families-home">
                <div className="families-columns">
                    <div>
                        <h3>Описание</h3>
                        {permissions.canEditInfo ? (
                            <textarea name="motd" value={motd} onChange={this.handleInputChange} />
                        ) : (
                            <p>{family.motd}</p>
                        )}
                    </div>
                    <div>
                        <h3>Правила</h3>
                        {permissions.canEditInfo ? (
                            <textarea name="description" value={description} onChange={this.handleInputChange} />
                        ) : (
                            <p>{family.description}</p>
                        )}
                    </div>
                </div>
                {permissions.canEditInfo && (
                    <div className="families-actions">
                        <button onClick={() => this.saveInfo()}>Сохранить информацию</button>
                    </div>
                )}
                <div className="families-summary">
                    <div><span>Основатель:</span> {family.ownerName || '—'}</div>
                    <div><span>Участников:</span> {family.membersCount}</div>
                </div>
            </div>
        );
    }

    renderTabletMembers(members = [], ranks = [], permissions, self) {
        return (
            <div className="families-section families-members">
                <table>
                    <thead>
                        <tr>
                            <th>Игрок</th>
                            <th>Ранг</th>
                            <th>Статус</th>
                            {(permissions.canManageRanks || permissions.canKick) && <th>Действия</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {members.map(member => (
                            <tr key={member.characterId} className={member.online ? 'online' : 'offline'}>
                                <td>{member.name}{member.isOwner ? ' (Основатель)' : ''}</td>
                                <td>{member.rankName}</td>
                                <td>{member.online ? 'В игре' : 'Не в сети'}</td>
                                {(permissions.canManageRanks || permissions.canKick) && (
                                    <td>
                                        {permissions.canManageRanks && !member.isOwner && member.characterId !== self.characterId && (
                                            <Fragment>
                                                <button onClick={() => this.promoteMember(member.characterId)}>▲</button>
                                                <button onClick={() => this.demoteMember(member.characterId)}>▼</button>
                                                <select onChange={(e) => this.setMemberRank(member.characterId, parseInt(e.target.value))} value="">
                                                    <option value="" disabled>Назначить</option>
                                                    {ranks.map(rank => (
                                                        <option key={rank.id} value={rank.id}>{rank.name}</option>
                                                    ))}
                                                </select>
                                            </Fragment>
                                        )}
                                        {permissions.canKick && !member.isOwner && member.characterId !== self.characterId && (
                                            <button className="danger" onClick={() => this.kickMember(member.characterId)}>Исключить</button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    renderTabletInvites(invites = [], permissions, inviteInput, limits) {
        return (
            <div className="families-section families-invites">
                {permissions.canInvite && (
                    <form onSubmit={(e) => this.sendInvite(e)} className="families-invite-form">
                        <label>Введите ID игрока</label>
                        <input name="inviteInput" value={inviteInput} onChange={this.handleInputChange} placeholder="ID" />
                        <button type="submit">Отправить приглашение</button>
                        <div className="families-hint">Максимум участников: {limits.maxMembers}</div>
                    </form>
                )}
                <div className="families-invite-list">
                    <h4>Отправленные приглашения</h4>
                    {invites.length === 0 && <div className="families-empty">Нет активных приглашений</div>}
                    {invites.map(invite => {
                        let expiresLabel = '—';
                        if (invite.expiresAt) {
                            const expiresDate = new Date(invite.expiresAt);
                            if (!Number.isNaN(expiresDate.valueOf())) {
                                expiresLabel = expiresDate.toLocaleString();
                            }
                        }
                        return (
                            <div key={invite.id} className="families-invite-item">
                                <div className="info">
                                    <div>{invite.name}</div>
                                    <div className="meta">Истекает: {expiresLabel}</div>
                                </div>
                            {permissions.canInvite && (
                                <button onClick={() => this.cancelInvite(invite.id)}>Отменить</button>
                            )}
                        </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    renderTabletSettings(ranks = [], permissions, rankEdits, newRank, limits, logo) {
        return (
            <div className="families-section families-settings">
                {permissions.canEditInfo && (
                    <div className="families-logo">
                        <label>Логотип (URL)</label>
                        <input name="logo" value={logo} onChange={this.handleInputChange} placeholder="https://" />
                        <button onClick={() => this.saveLogo()}>Сохранить логотип</button>
                    </div>
                )}
                <div className="families-ranks">
                    <h4>Ранги</h4>
                    {ranks.map(rank => {
                        const form = rankEdits[rank.id] || {};
                        const disabled = !permissions.canManageRanks || rank.order === 1;
                        return (
                            <div key={rank.id} className="families-rank">
                                <div className="rank-header">
                                    <input
                                        type="text"
                                        value={form.name || ''}
                                        disabled={!permissions.canManageRanks}
                                        onChange={(e) => this.handleRankFieldChange(rank.id, 'name', e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        value={form.order || 1}
                                        disabled={!permissions.canManageRanks}
                                        onChange={(e) => this.handleRankFieldChange(rank.id, 'order', parseInt(e.target.value) || 1)}
                                    />
                                </div>
                                <div className="rank-perms">
                                    {['canInvite', 'canKick', 'canManageRanks', 'canEditInfo', 'canDisband'].map(key => (
                                        <label key={key}>
                                            <input
                                                type="checkbox"
                                                disabled={disabled}
                                                checked={!!form[key]}
                                                onChange={(e) => this.handleRankFieldChange(rank.id, key, e.target.checked)}
                                            />
                                            {permissionName(key)}
                                        </label>
                                    ))}
                                </div>
                                {permissions.canManageRanks && (
                                    <div className="rank-actions">
                                        <button onClick={() => this.saveRank(rank.id)}>Сохранить</button>
                                        {rank.order !== 1 && (
                                            <button className="danger" onClick={() => this.deleteRank(rank.id)}>Удалить</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {permissions.canManageRanks && (
                    <form className="families-rank-create" onSubmit={(e) => this.createRank(e)}>
                        <h4>Новый ранг</h4>
                        <input
                            type="text"
                            placeholder="Название"
                            value={newRank.name}
                            onChange={(e) => this.handleNewRankFieldChange('name', e.target.value)}
                            required
                        />
                        <input
                            type="number"
                            placeholder="Порядок"
                            value={newRank.order}
                            onChange={(e) => this.handleNewRankFieldChange('order', parseInt(e.target.value) || 1)}
                            min="1"
                        />
                        <div className="rank-perms">
                            {['canInvite', 'canKick', 'canManageRanks', 'canEditInfo', 'canDisband'].map(key => (
                                <label key={key}>
                                    <input
                                        type="checkbox"
                                        checked={!!newRank[key]}
                                        onChange={(e) => this.handleNewRankFieldChange(key, e.target.checked)}
                                    />
                                    {permissionName(key)}
                                </label>
                            ))}
                        </div>
                        <button type="submit">Создать ранг</button>
                        <div className="families-hint">Максимум рангов: {limits.maxRanks}</div>
                    </form>
                )}
                {permissions.canDisband && (
                    <div className="families-actions">
                        <button className="danger" onClick={() => this.disbandFamily()}>Расформировать семью</button>
                    </div>
                )}
            </div>
        );
    }

    renderCreation() {
        const { creationData, familiesState } = this.props;
        if (!familiesState.showCreation || !creationData) return null;
        const { creationTab, creationForm } = this.state;

        return (
            <div id="familiesCreation">
                <div className="families-window">
                    <div className="families-header">
                        <div className="title">Оформление семьи</div>
                        <button className="families-close" onClick={() => this.closeCreation()}>×</button>
                    </div>
                    <div className="families-tabs">
                        <button className={creationTab === 'home' ? 'active' : ''} onClick={() => this.handleCreationTabChange('home')}>Главная</button>
                        <button className={creationTab === 'create' ? 'active' : ''} onClick={() => this.handleCreationTabChange('create')}>Создать</button>
                        <button className={creationTab === 'list' ? 'active' : ''} onClick={() => this.handleCreationTabChange('list')}>Список</button>
                    </div>
                    <div className="families-content">
                        {creationTab === 'home' && this.renderCreationHome(creationData)}
                        {creationTab === 'create' && this.renderCreationForm(creationData, creationForm)}
                        {creationTab === 'list' && this.renderCreationList(creationData.families)}
                    </div>
                </div>
            </div>
        );
    }

    renderCreationHome(data) {
        return (
            <div className="families-section families-home">
                <p>{data.info.about}</p>
                <p>{data.info.rules}</p>
                <div className="families-summary">
                    <div><span>Стоимость:</span> ${data.cost.toLocaleString()}</div>
                    <div><span>Минимум часов:</span> {data.minHours}</div>
                </div>
            </div>
        );
    }

    renderCreationForm(data, form) {
        return (
            <form className="families-section families-create" onSubmit={(e) => this.submitCreation(e)}>
                <label>Название</label>
                <input value={form.name} onChange={(e) => this.handleCreationFieldChange('name', e.target.value)} required maxLength={32} />
                <label>Ссылка на логотип (необязательно)</label>
                <input value={form.logo} onChange={(e) => this.handleCreationFieldChange('logo', e.target.value)} placeholder="https://" maxLength={256} />
                <label>Описание</label>
                <textarea value={form.motd} onChange={(e) => this.handleCreationFieldChange('motd', e.target.value)} placeholder={data.info.about} />
                <label>Правила</label>
                <textarea value={form.description} onChange={(e) => this.handleCreationFieldChange('description', e.target.value)} placeholder={data.info.rules} />
                <button type="submit">Создать семью за ${data.cost.toLocaleString()}</button>
            </form>
        );
    }

    renderCreationList(families = []) {
        return (
            <div className="families-section families-list">
                {families.length === 0 && <div className="families-empty">Семей пока нет</div>}
                <div className="families-grid">
                    {families.map(item => (
                        <div key={item.id} className="families-card">
                            {item.logo && <img src={item.logo} alt={item.name} />}
                            <div className="card-name">{item.name}</div>
                            <div className="card-info">Участники: {item.members}</div>
                            <div className="card-info">Основатель: {item.owner || '—'}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    render() {
        return (
            <Fragment>
                {this.renderTablet()}
                {this.renderCreation()}
            </Fragment>
        );
    }
}

function permissionName(key) {
    switch (key) {
        case 'canInvite':
            return 'Приглашения';
        case 'canKick':
            return 'Исключения';
        case 'canManageRanks':
            return 'Управление рангами';
        case 'canEditInfo':
            return 'Редактирование инфо';
        case 'canDisband':
            return 'Расформирование';
        default:
            return key;
    }
}

const mapStateToProps = state => ({
    familiesState: state.families,
    tabletData: state.families.tabletData,
    creationData: state.families.creationData,
    showCreation: state.families.showCreation,
});

export default connect(mapStateToProps)(FamiliesApp);
