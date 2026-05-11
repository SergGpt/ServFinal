/* eslint-disable no-undef */
import React, { Component } from 'react';
import events from '../../helpers/events';
import './style.css';

const DEFAULT_INFO = {
    employed: false,
    level: 0,
    maxLevel: 20,
    progress: 0,
    seeds: 0,
    harvest: 0,
    toNext: 0,
    exchangeRate: 0,
    estimatedReward: 0,
    seedTypes: [],
    marketHistory: [],
};

class FarmJob extends Component {
    constructor(props) {
        super(props);
        this.state = {
            visible: false,
            tab: 'job',
            buyAmount: 1,
            selectedSeed: 'potato',
            info: DEFAULT_INFO,
        };

        this.open = this.open.bind(this);
        this.update = this.update.bind(this);
        this.close = this.close.bind(this);
    }

    componentDidMount() {
        events.on('farms.ui.open', this.open);
        events.on('farms.ui.update', this.update);
        events.on('farms.ui.close', this.close);
    }

    componentWillUnmount() {
        events.remove('farms.ui.open', this.open);
        events.remove('farms.ui.update', this.update);
        events.remove('farms.ui.close', this.close);
    }

    parsePayload(payload) {
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch (e) {
                return {};
            }
        }
        return payload || {};
    }

    getNextState(payload) {
        const data = this.parsePayload(payload);
        const info = Object.assign({}, this.state.info, data);
        if (!Array.isArray(info.seedTypes)) info.seedTypes = [];
        if (!Array.isArray(info.marketHistory)) info.marketHistory = [];

        let selectedSeed = this.state.selectedSeed;
        if (!selectedSeed && info.seedTypes[0]) selectedSeed = info.seedTypes[0].id;
        if (info.seedTypes[0] && !info.seedTypes.find(seed => seed.id === selectedSeed)) {
            selectedSeed = info.seedTypes[0].id;
        }

        return { info, selectedSeed };
    }

    open(payload) {
        const next = this.getNextState(payload);
        this.setState({
            visible: true,
            info: next.info,
            selectedSeed: next.selectedSeed,
            tab: next.info.employed ? this.state.tab : 'job',
        }, () => this.sendSelectedSeed());
    }

    update(payload) {
        const next = this.getNextState(payload);
        this.setState({
            info: next.info,
            selectedSeed: next.selectedSeed,
        }, () => this.sendSelectedSeed());
    }

    close() {
        if (!this.state.visible) return;
        this.setState({ visible: false }, () => mp.trigger('farms.ui.closed'));
    }

    sendSelectedSeed() {
        if (!this.state.selectedSeed) return;
        mp.trigger('farms.seed.select', this.state.selectedSeed);
    }

    toggleJob() {
        mp.trigger('callRemote', 'farms.employment');
    }

    selectSeed(seedId) {
        this.setState({ selectedSeed: seedId }, () => this.sendSelectedSeed());
    }

    changeAmount(delta) {
        this.setState(prev => ({ buyAmount: Math.max(1, Math.min(100, prev.buyAmount + delta)) }));
    }

    buySeeds() {
        const { selectedSeed, buyAmount } = this.state;
        if (!selectedSeed) return;
        mp.trigger('callRemote', 'farms.seed.buy', JSON.stringify({
            seedId: selectedSeed,
            amount: Number(buyAmount) || 1,
        }));
    }

    sellHarvest() {
        mp.trigger('callRemote', 'farms.sell');
    }

    getHistoryLabel() {
        const history = this.state.info.marketHistory || [];
        const values = history.slice(-8).map(item => `$${item.rate}`);
        return values.length ? values.join(' → ') : 'нет данных';
    }

    renderStats() {
        const { info } = this.state;
        const stats = [
            ['Статус', info.employed ? 'Работаете' : 'Без работы'],
            ['Уровень', `${info.level} / ${info.maxLevel}`],
            ['Прогресс', `${info.progress}%`],
            ['Семена', info.seeds],
            ['Урожай', info.harvest],
            ['Курс', `$${info.exchangeRate}`],
        ];

        return (
            <div className="farm-job-stats">
                {stats.map(([label, value]) => (
                    <div className="farm-job-stat" key={label}>
                        <span>{label}</span>
                        <b>{value}</b>
                    </div>
                ))}
            </div>
        );
    }

    renderJobTab() {
        const { info } = this.state;
        return (
            <div className="farm-job-section farm-job-intro">
                <div>
                    <span className="farm-job-kicker">Трудоустройство</span>
                    <h3>{info.employed ? 'Смена фермера активна' : 'Начните смену у фермера'}</h3>
                    <p>Покупайте семена, выращивайте урожай на грядках и сдавайте его по текущему рыночному курсу.</p>
                </div>
                <div className="farm-job-progress">
                    <div><span style={{ width: `${Math.max(0, Math.min(100, info.progress || 0))}%` }} /></div>
                    <p>До следующего уровня: {info.toNext}</p>
                </div>
                <button className="farm-job-primary" onClick={() => this.toggleJob()}>
                    {info.employed ? 'Завершить смену' : 'Устроиться на работу'}
                </button>
            </div>
        );
    }

    renderBuyTab() {
        const { info, selectedSeed, buyAmount } = this.state;
        return (
            <div className="farm-job-section">
                <div className="farm-job-seeds">
                    {(info.seedTypes || []).map(seed => (
                        <button
                            key={seed.id}
                            className={selectedSeed === seed.id ? 'active' : ''}
                            onClick={() => this.selectSeed(seed.id)}
                        >
                            <span>{seed.name}</span>
                            <b>${seed.buyPrice}</b>
                            <small>Урожайность x{seed.harvestYield}</small>
                        </button>
                    ))}
                </div>
                <div className="farm-job-buybar">
                    <button onClick={() => this.changeAmount(-1)}>-</button>
                    <strong>{buyAmount}</strong>
                    <button onClick={() => this.changeAmount(1)}>+</button>
                    <button className="farm-job-primary" onClick={() => this.buySeeds()}>Купить семена</button>
                </div>
            </div>
        );
    }

    renderSellTab() {
        const { info } = this.state;
        return (
            <div className="farm-job-section farm-job-sell">
                <div className="farm-job-sell-card">
                    <span>Расчетная выплата</span>
                    <b>${info.estimatedReward}</b>
                </div>
                <div className="farm-job-sell-card muted">
                    <span>Динамика курса</span>
                    <b>{this.getHistoryLabel()}</b>
                </div>
                <button className="farm-job-primary" onClick={() => this.sellHarvest()}>Продать урожай</button>
            </div>
        );
    }

    renderContent() {
        if (this.state.tab === 'buy') return this.renderBuyTab();
        if (this.state.tab === 'sell') return this.renderSellTab();
        return this.renderJobTab();
    }

    render() {
        if (!this.state.visible) return null;
        const tabs = [
            ['job', 'Работа'],
            ['buy', 'Семена'],
            ['sell', 'Сбыт'],
        ];

        return (
            <div className="farm-job-root">
                <div className="farm-job-backdrop" onClick={this.close} />
                <div className="farm-job-window">
                    <div className="farm-job-hero">
                        <div>
                            <span>TRIBUNAL FARMING</span>
                            <h2>Фермер</h2>
                            <p>Работа на поле, семена и продажа урожая в одном терминале.</p>
                        </div>
                        <button onClick={this.close}>×</button>
                    </div>
                    {this.renderStats()}
                    <div className="farm-job-tabs">
                        {tabs.map(([id, label]) => (
                            <button
                                key={id}
                                className={this.state.tab === id ? 'active' : ''}
                                onClick={() => this.setState({ tab: id })}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {this.renderContent()}
                </div>
            </div>
        );
    }
}

export default FarmJob;
