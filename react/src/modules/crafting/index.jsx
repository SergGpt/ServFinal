/* eslint-disable no-undef */
import React, { Component } from 'react';
import myEventEmmiter from '../../helpers/events';
import './style.css';

const DEFAULT_STATE = {
    visible: false,
    crafting: false,
    progressStartedAt: 0,
    progressDuration: 4500,
    title: 'Полевая кухня выживших',
    subtitle: 'Самодельная кухня Black Zone RP',
    type: 'food',
    variant: 'survivor_camp',
    recipes: [],
};

class CraftingTable extends Component {
    constructor(props) {
        super(props);
        this.state = DEFAULT_STATE;
        this.progressTimer = null;
    }

    componentDidMount() {
        myEventEmmiter.on('crafting.open', this.open);
        myEventEmmiter.on('crafting.close', this.close);
        myEventEmmiter.on('crafting.progress', this.startProgress);
        myEventEmmiter.on('crafting.done', this.finishProgress);
    }

    componentWillUnmount() {
        myEventEmmiter.remove('crafting.open', this.open);
        myEventEmmiter.remove('crafting.close', this.close);
        myEventEmmiter.remove('crafting.progress', this.startProgress);
        myEventEmmiter.remove('crafting.done', this.finishProgress);
        if (this.progressTimer) clearInterval(this.progressTimer);
    }

    open = (payload = {}) => {
        this.setState({
            ...DEFAULT_STATE,
            visible: true,
            title: payload.title || DEFAULT_STATE.title,
            subtitle: payload.subtitle || DEFAULT_STATE.subtitle,
            type: payload.type || DEFAULT_STATE.type,
            variant: payload.variant || DEFAULT_STATE.variant,
            recipes: payload.recipes || [],
        });
    };

    close = () => {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
        this.setState(DEFAULT_STATE);
    };

    startProgress = (durationMs = 4500) => {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.setState({
            crafting: true,
            progressStartedAt: Date.now(),
            progressDuration: durationMs,
        });
        this.progressTimer = setInterval(() => this.forceUpdate(), 80);
    };

    finishProgress = () => {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
        this.setState({ crafting: false, progressStartedAt: 0 });
    };

    handleClose = () => {
        if (typeof mp !== 'undefined' && mp.trigger) mp.trigger('callRemote', 'crafting.close');
        this.close();
    };

    handleCraft = (recipeId) => {
        if (this.state.crafting) return;
        if (typeof mp !== 'undefined' && mp.trigger) mp.trigger('callRemote', 'crafting.craft', recipeId);
    };

    getProgressPercent() {
        const { crafting, progressStartedAt, progressDuration } = this.state;
        if (!crafting || !progressStartedAt) return 0;
        const passed = Date.now() - progressStartedAt;
        return Math.max(0, Math.min(100, (passed / progressDuration) * 100));
    }

    renderSkewerIcon() {
        return (
            <div className="crafting-skewer" aria-hidden="true">
                <span className="crafting-skewer__stick" />
                <span className="crafting-skewer__meat crafting-skewer__meat--one" />
                <span className="crafting-skewer__pepper crafting-skewer__pepper--one" />
                <span className="crafting-skewer__meat crafting-skewer__meat--two" />
                <span className="crafting-skewer__pepper crafting-skewer__pepper--two" />
                <span className="crafting-skewer__meat crafting-skewer__meat--three" />
                <span className="crafting-skewer__ash crafting-skewer__ash--one" />
                <span className="crafting-skewer__ash crafting-skewer__ash--two" />
            </div>
        );
    }

    renderIngredient(ingredient) {
        return (
            <div className="crafting-ingredient" key={ingredient.itemId}>
                <div className="crafting-ingredient__id">#{ingredient.itemId}</div>
                <div>
                    <div className="crafting-ingredient__name">{ingredient.name}</div>
                    <div className="crafting-ingredient__count">Нужно x{ingredient.count}</div>
                </div>
            </div>
        );
    }

    renderRecipe(recipe) {
        return (
            <div className="crafting-recipe" key={recipe.id}>
                <div className="crafting-recipe__visual">
                    <div className="crafting-warning-strip">QUARANTINE FOOD PREP</div>
                    {this.renderSkewerIcon()}
                    <div className="crafting-ration-card">
                        <span>RATION</span>
                        <strong>#{recipe.result.itemId}</strong>
                    </div>
                </div>
                <div className="crafting-recipe__content">
                    <div className="crafting-recipe__kicker">Рецепт кухни выживших</div>
                    <h2>{recipe.title}</h2>
                    <p>{recipe.description}</p>
                    <div className="crafting-ingredients">
                        {recipe.ingredients.map((ingredient) => this.renderIngredient(ingredient))}
                    </div>
                    <div className="crafting-result">
                        <span>Выход</span>
                        <strong>#{recipe.result.itemId} · {recipe.result.name} x{recipe.result.count}</strong>
                    </div>
                    <button
                        type="button"
                        className="crafting-button"
                        disabled={this.state.crafting}
                        onClick={() => this.handleCraft(recipe.id)}
                    >
                        {this.state.crafting ? 'Идёт готовка...' : 'Готовить на горелке'}
                    </button>
                </div>
            </div>
        );
    }

    render() {
        const { visible, title, subtitle, recipes, crafting, variant } = this.state;
        if (!visible) return null;

        const progress = this.getProgressPercent();

        return (
            <div className={`crafting-overlay crafting-overlay--${variant}`}>
                <div className="crafting-panel">
                    <div className="crafting-noise" />
                    <button type="button" className="crafting-close" onClick={this.handleClose}>×</button>

                    <div className="crafting-header">
                        <div>
                            <div className="crafting-eyebrow">BLACK ZONE RP · LOS SANTOS QUARANTINE</div>
                            <h1>{title}</h1>
                            <p>{subtitle}</p>
                        </div>
                        <div className="crafting-status">
                            <span className="crafting-status__lamp" />
                            <strong>GENERATOR</strong>
                            <em>{crafting ? 'LOAD HIGH' : 'LOW POWER'}</em>
                        </div>
                    </div>

                    <div className="crafting-worktop">
                        <div className="crafting-worktop__tag">FIELD KITCHEN / CONTAMINATED ZONE</div>
                        <div className="crafting-board"><span /><span /><span /></div>
                        <div className="crafting-can crafting-can--one" />
                        <div className="crafting-can crafting-can--two" />
                        <div className="crafting-flame crafting-flame--one" />
                        <div className="crafting-flame crafting-flame--two" />
                    </div>

                    <div className="crafting-recipes">
                        {recipes.length ? recipes.map((recipe) => this.renderRecipe(recipe)) : (
                            <div className="crafting-empty">Нет доступных рецептов для этой кухни.</div>
                        )}
                    </div>

                    <div className={`crafting-progress ${crafting ? 'crafting-progress--active' : ''}`}>
                        <span>COOKING CYCLE</span>
                        <div><i style={{ width: `${progress}%` }} /></div>
                    </div>
                </div>
            </div>
        );
    }
}

export default CraftingTable;
