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
    recipes: [],
    selectedRecipeId: null,
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
            recipes: payload.recipes || [],
            selectedRecipeId: payload.recipes && payload.recipes.length ? payload.recipes[0].id : null,
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

    handleRecipeSelect = (recipeId) => {
        if (this.state.crafting) return;
        this.setState({ selectedRecipeId: recipeId });
    };

    getProgressPercent() {
        const { crafting, progressStartedAt, progressDuration } = this.state;
        if (!crafting || !progressStartedAt) return 0;
        const passed = Date.now() - progressStartedAt;
        return Math.max(0, Math.min(100, (passed / progressDuration) * 100));
    }

    renderBurner(recipe) {
        return (
            <div className="crafting-burner" aria-hidden="true">
                <div className="crafting-burner__ring crafting-burner__ring--outer" />
                <div className="crafting-burner__ring crafting-burner__ring--inner" />
                <div className="crafting-burner__embers">
                    <span />
                    <span />
                    <span />
                    <span />
                </div>
                <div className="crafting-burner__pan">
                    <div className="crafting-burner__meat crafting-burner__meat--one" />
                    <div className="crafting-burner__meat crafting-burner__meat--two" />
                    <div className="crafting-burner__steam crafting-burner__steam--one" />
                    <div className="crafting-burner__steam crafting-burner__steam--two" />
                </div>
                <div className="crafting-burner__stamp">#{recipe.result.itemId}</div>
            </div>
        );
    }

    renderIngredient(ingredient) {
        return (
            <div className="crafting-supply" key={ingredient.itemId}>
                <div className="crafting-supply__code">#{ingredient.itemId}</div>
                <div className="crafting-supply__body">
                    <strong>{ingredient.name}</strong>
                    <span>расход x{ingredient.count}</span>
                </div>
                <div className="crafting-supply__mark">REQ</div>
            </div>
        );
    }

    renderRecipeNav(recipe) {
        const isActive = this.state.selectedRecipeId === recipe.id;
        const timeSec = Math.ceil((recipe.craftTime || recipe.durationMs || 0) / 1000);

        return (
            <button
                type="button"
                key={recipe.id}
                className={`crafting-recipe-tab ${isActive ? 'crafting-recipe-tab--active' : ''}`}
                disabled={this.state.crafting}
                onClick={() => this.handleRecipeSelect(recipe.id)}
            >
                <span className="crafting-recipe-tab__name">{recipe.title}</span>
                <span className="crafting-recipe-tab__meta">#{recipe.result.itemId} · {timeSec} сек · {recipe.consumableType === 'drink' ? 'вода' : 'еда'}</span>
                {recipe.infectionStub && <span className="crafting-recipe-tab__risk">заражение: заглушка</span>}
            </button>
        );
    }

    renderRecipe(recipe) {
        const progress = this.getProgressPercent();

        return (
            <div className="crafting-recipe" key={recipe.id}>
                <div className="crafting-recipe__left">
                    <div className="crafting-zone-card">
                        <span>FOOD NODE</span>
                        <strong>Карантинный рацион</strong>
                    </div>
                    {this.renderBurner(recipe)}
                    <div className="crafting-readout">
                        <span>thermal cycle</span>
                        <strong>{this.state.crafting ? `${Math.round(progress)}%` : 'standby'}</strong>
                    </div>
                </div>

                <div className="crafting-recipe__right">
                    <div className="crafting-recipe__meta">
                        <span>BLACK ZONE RECIPE</span>
                        <em>ручная готовка / без стерильной линии</em>
                    </div>
                    <h2>{recipe.title}</h2>
                    <p>{recipe.description}</p>
                    <div className="crafting-effect-row">
                        <span>{recipe.consumableType === 'drink' ? 'Напиток' : 'Еда'}</span>
                        <strong>{recipe.effect}</strong>
                        {recipe.infectionStub && <em>Заражение пока без действия</em>}
                    </div>

                    <div className="crafting-supplies">
                        {recipe.ingredients.map((ingredient) => this.renderIngredient(ingredient))}
                    </div>

                    <div className="crafting-output">
                        <span>получится</span>
                        <strong>#{recipe.result.itemId} · {recipe.result.name} x{recipe.result.count}</strong>
                    </div>

                    <button
                        type="button"
                        className="crafting-button"
                        disabled={this.state.crafting}
                        onClick={() => this.handleCraft(recipe.id)}
                    >
                        {this.state.crafting ? 'Термоцикл запущен...' : 'Запустить готовку'}
                    </button>
                </div>
            </div>
        );
    }

    render() {
        const { visible, title, subtitle, recipes, crafting, selectedRecipeId } = this.state;
        if (!visible) return null;

        const progress = this.getProgressPercent();
        const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0];

        return (
            <div className="crafting-overlay">
                <div className="crafting-shell">
                    <button type="button" className="crafting-close" onClick={this.handleClose}>×</button>

                    <aside className="crafting-side">
                        <div className="crafting-side__brand">BZ</div>
                        <div className="crafting-side__line" />
                        <div className="crafting-side__text">FOOD<br />CRAFT</div>
                        <div className={`crafting-side__pulse ${crafting ? 'crafting-side__pulse--active' : ''}`} />
                    </aside>

                    <main className="crafting-terminal">
                        <header className="crafting-header">
                            <div>
                                <div className="crafting-eyebrow">BLACK ZONE RP / SURVIVAL KITCHEN</div>
                                <h1>{title}</h1>
                                <p>{subtitle}</p>
                            </div>
                            <div className="crafting-chip">
                                <span>{crafting ? 'COOKING' : 'READY'}</span>
                                <strong>{Math.round(progress)}%</strong>
                            </div>
                        </header>

                        <div className="crafting-alert">
                            <span>⚠</span>
                            <p>Пища готовится на аварийной горелке. Ингредиенты списываются после завершения цикла.</p>
                        </div>

                        <section className="crafting-recipes">
                            {recipes.length ? (
                                <div className="crafting-recipe-browser">
                                    <div className="crafting-recipe-list">
                                        {recipes.map((recipe) => this.renderRecipeNav(recipe))}
                                    </div>
                                    {selectedRecipe && this.renderRecipe(selectedRecipe)}
                                </div>
                            ) : (
                                <div className="crafting-empty">Нет доступных рецептов для этой кухни.</div>
                            )}
                        </section>

                        <footer className="crafting-footer">
                            <span>COOKING PROGRESS</span>
                            <div className="crafting-progress"><i style={{ width: `${progress}%` }} /></div>
                        </footer>
                    </main>
                </div>
            </div>
        );
    }
}

export default CraftingTable;
