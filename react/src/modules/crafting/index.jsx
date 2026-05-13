/* eslint-disable no-undef */
import React, { Component } from 'react';
import myEventEmmiter from '../../helpers/events';
import './style.css';

const DEFAULT_STATE = {
    visible: false,
    crafting: false,
    progressUntil: 0,
    title: 'Кулинарный стол',
    type: 'food',
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
            type: payload.type || DEFAULT_STATE.type,
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
        this.setState({ crafting: true, progressUntil: Date.now() + durationMs });
        this.progressTimer = setInterval(() => this.forceUpdate(), 80);
    };

    finishProgress = () => {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
        this.setState({ crafting: false, progressUntil: 0 });
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
        const { crafting, progressUntil } = this.state;
        if (!crafting || !progressUntil) return 0;
        const left = Math.max(progressUntil - Date.now(), 0);
        return Math.max(0, Math.min(100, 100 - (left / 4500) * 100));
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
                <span className="crafting-skewer__smoke crafting-skewer__smoke--one" />
                <span className="crafting-skewer__smoke crafting-skewer__smoke--two" />
            </div>
        );
    }

    renderIngredient(ingredient) {
        return (
            <div className="crafting-ingredient" key={ingredient.itemId}>
                <div className="crafting-ingredient__id">#{ingredient.itemId}</div>
                <div>
                    <div className="crafting-ingredient__name">{ingredient.name}</div>
                    <div className="crafting-ingredient__count">x{ingredient.count}</div>
                </div>
            </div>
        );
    }

    renderRecipe(recipe) {
        return (
            <div className="crafting-recipe" key={recipe.id}>
                <div className="crafting-recipe__visual">
                    {this.renderSkewerIcon()}
                    <div className="crafting-recipe__shine" />
                </div>
                <div className="crafting-recipe__content">
                    <div className="crafting-recipe__kicker">Рецепт еды</div>
                    <h2>{recipe.title}</h2>
                    <p>{recipe.description}</p>
                    <div className="crafting-ingredients">
                        {recipe.ingredients.map((ingredient) => this.renderIngredient(ingredient))}
                    </div>
                    <div className="crafting-result">
                        <span>Результат</span>
                        <strong>#{recipe.result.itemId} · {recipe.result.name} x{recipe.result.count}</strong>
                    </div>
                    <button
                        type="button"
                        className="crafting-button"
                        disabled={this.state.crafting}
                        onClick={() => this.handleCraft(recipe.id)}
                    >
                        {this.state.crafting ? 'Готовится...' : 'Приготовить'}
                    </button>
                </div>
            </div>
        );
    }

    render() {
        const { visible, title, recipes, crafting } = this.state;
        if (!visible) return null;

        const progress = this.getProgressPercent();

        return (
            <div className="crafting-overlay">
                <div className="crafting-panel">
                    <button type="button" className="crafting-close" onClick={this.handleClose}>×</button>
                    <div className="crafting-header">
                        <div>
                            <div className="crafting-eyebrow">Профессиональная кухня</div>
                            <h1>{title}</h1>
                            <p>Подготовьте ингредиенты, выберите рецепт и создайте готовое блюдо.</p>
                        </div>
                        <div className="crafting-heat">
                            <span />
                            <strong>FOOD</strong>
                        </div>
                    </div>

                    <div className="crafting-worktop">
                        <div className="crafting-board">
                            <span />
                            <span />
                            <span />
                        </div>
                        <div className="crafting-flame crafting-flame--one" />
                        <div className="crafting-flame crafting-flame--two" />
                    </div>

                    <div className="crafting-recipes">
                        {recipes.length ? recipes.map((recipe) => this.renderRecipe(recipe)) : (
                            <div className="crafting-empty">Для этой точки пока нет рецептов.</div>
                        )}
                    </div>

                    <div className={`crafting-progress ${crafting ? 'crafting-progress--active' : ''}`}>
                        <div style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>
        );
    }
}

export default CraftingTable;
