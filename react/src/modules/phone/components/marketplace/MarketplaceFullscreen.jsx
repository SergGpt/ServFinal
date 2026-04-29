/* eslint-disable no-undef */
import React, { useEffect, useMemo, useState } from 'react';
import { connect } from 'react-redux';

const CATEGORIES = [
    'Аукция',
    'Транспорт',
    'Недвижимость',
    'Бизнесы',
    'Банкомат',
    'Предметы',
    'Одежда и аксессуары',
    'Услуги'
];

const shellStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(5, 9, 18, 0.75)',
    padding: 12,
    boxSizing: 'border-box',
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif'
};

const windowStyle = {
    width: 'min(1760px, 98vw)',
    height: 'min(940px, 94vh)',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#f2f3f5',
    display: 'grid',
    gridTemplateColumns: '220px 1fr',
    border: '1px solid #d3d7dc'
};

const sidebarStyle = {
    background: '#fff',
    borderRight: '1px solid #e2e4e8',
    display: 'flex',
    flexDirection: 'column'
};

const logoStyle = {
    padding: '18px 18px 10px',
    fontWeight: 900,
    fontSize: 30,
    letterSpacing: 0.5,
    color: '#20252b'
};

const categoryItem = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '3px 10px',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    color: active ? '#fff' : '#2e3640',
    background: active ? '#3a7ed3' : 'transparent',
    cursor: 'pointer'
});

const topBarStyle = {
    background: '#f9f9fb',
    borderBottom: '1px solid #e2e4e8',
    display: 'grid',
    gridTemplateColumns: '260px 220px 1fr auto auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px'
};

const boxStyle = {
    height: 40,
    borderRadius: 8,
    border: '1px solid #d8dde4',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    color: '#59616b',
    fontSize: 14
};

const cardsWrap = {
    padding: 12,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
    overflowY: 'auto'
};

const cardStyle = {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #e2e4e8',
    overflow: 'hidden'
};

const imgStyle = {
    height: 140,
    width: '100%',
    objectFit: 'cover',
    background: 'linear-gradient(135deg,#b6c3d6,#d5dee8)'
};

const MarketplaceFullscreen = ({ isOpen, marketplaceLots, sellOptions, closeFullscreen, characterId }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [activeCategory, setActiveCategory] = useState('Предметы');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [isSelectorOpen, setSelectorOpen] = useState(false);
    const [isCreateMode, setCreateMode] = useState(false);
    const [createError, setCreateError] = useState('');
    const [showDebug, setShowDebug] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.open');
        }
    }, [isOpen]);

    const renderLots = useMemo(() => {
        return (marketplaceLots || []).map((lot) => ({
            ...lot,
            category: activeCategory,
            img: lot.image || ''
        }));
    }, [marketplaceLots, activeCategory]);

    const resolveLotType = () => {
        if (activeCategory === 'Транспорт') return 'vehicle';
        if (activeCategory === 'Недвижимость') return 'house';
        if (activeCategory === 'Бизнесы') return 'biz';
        return 'item';
    };


    const activeType = resolveLotType();
    const activeOptions = sellOptions[activeType] || [];
    const selectorPlaceholder = activeType === 'item' ? 'Выбрать предмет' : activeType === 'vehicle' ? 'Выбрать транспорт' : activeType === 'house' ? 'Выбрать недвижимость' : activeType === 'biz' ? 'Выбрать бизнес' : 'Выбрать объект';

    useEffect(() => {
        setSelectorOpen(false);
        setSelectedItemId('');
        setCreateError('');
    }, [activeType]);

    if (!isOpen) return null;

    const onClose = () => {
        if (typeof mp !== 'undefined' && mp.trigger) mp.trigger('marketplace.fullscreen.close');
        closeFullscreen();
    };

    const onCreate = () => {
        if (!isCreateMode) {
            setCreateMode(true);
            setCreateError('');
            if (typeof mp !== 'undefined' && mp.trigger) mp.trigger('callRemote', 'marketplace.phone.open');
            return;
        }

        const selectedItem = activeOptions.find((item) => String(item.id) === String(selectedItemId));
        const finalTitle = (title || '').trim() || (selectedItem ? selectedItem.name : '');
        const normalizedPrice = parseInt(String(price || '').replace(/[^\d]/g, ''), 10);

        if (!selectedItemId) {
            setCreateError('Сначала выберите объект для продажи');
            return;
        }
        if (!Number.isFinite(normalizedPrice) || normalizedPrice < 1) {
            setCreateError('Укажите корректную цену (минимум 1)');
            return;
        }

        setCreateError('');
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.create', finalTitle, description, normalizedPrice, resolveLotType(), selectedItemId);
        }
        setTitle('');
        setDescription('');
        setPrice('');
        setSelectedItemId('');
        setSelectorOpen(false);
        setCreateMode(false);
    };

    const onBuy = (id) => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.buy', id);
        }
    };

    return (
        <div style={shellStyle}>
            <div style={windowStyle}>
                <div style={sidebarStyle}>
                    <div style={logoStyle}>WIWANG</div>
                    <div style={{ padding: '0 0 10px' }}>
                        {CATEGORIES.map((category) => (
                            <div key={category} style={categoryItem(category === activeCategory)} onClick={() => setActiveCategory(category)}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: category === activeCategory ? '#fff' : '#5c6b7c' }} />
                                <span>{category}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 'auto', padding: 10 }}>
                        <button style={{ width: '100%', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }} onClick={onClose}>
                            Выйти
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateRows: '60px 1fr' }}>
                    <div style={topBarStyle}>
                        <div style={boxStyle}>Выбор категории</div>
                        <div style={boxStyle}>Сортировка</div>
                        <div />
                        <button style={{ border: 'none', borderRadius: 8, background: '#3a7ed3', color: '#fff', padding: '10px 16px', cursor: 'pointer' }} onClick={onCreate}>
                            {isCreateMode ? 'Опубликовать' : 'Создать лот'}
                        </button>
                        <button style={{ border: 'none', borderRadius: 8, background: '#2d2f36', color: '#fff', padding: '10px 16px', cursor: 'pointer' }} onClick={onClose}>
                            Закрыть
                        </button>

                        <button style={{ border: 'none', borderRadius: 8, background: '#7c5cff', color: '#fff', padding: '10px 12px', cursor: 'pointer' }} onClick={() => setShowDebug((v) => !v)}>
                            {showDebug ? 'Скрыть debug' : 'Показать debug'}
                        </button>

                    </div>

                    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
                        {isCreateMode && <div style={{ fontSize: 12, color: '#5c6470', padding: '8px 12px 0' }}>Режим продажи: выберите объект и заполните цену, затем нажмите «Опубликовать».</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 180px', gap: 10, padding: 12, borderBottom: '1px solid #e2e4e8', background: '#fff', opacity: isCreateMode ? 1 : 0.55, pointerEvents: isCreateMode ? 'auto' : 'none' }}>
                            <div style={{ position: 'relative', width: '100%' }}>
                                <button
                                    type='button'
                                    onClick={() => setSelectorOpen((prev) => !prev)}
                                    style={{ ...boxStyle, width: '100%', outline: 'none', justifyContent: 'space-between', cursor: 'pointer' }}
                                >
                                    <span>{selectedItemId ? ((activeOptions.find((item) => String(item.id) === String(selectedItemId)) || {}).name || selectorPlaceholder) : selectorPlaceholder}</span>
                                    <span style={{ marginLeft: 8 }}>▾</span>
                                </button>
                                {isSelectorOpen && (
                                    <div style={{ position: 'absolute', top: 44, left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #d8dde4', borderRadius: 8, zIndex: 10002 }}>
                                        {!activeOptions.length && <div style={{ padding: '10px 12px', color: '#8a9099' }}>Нет доступных объектов для этой категории</div>}
                                        {activeOptions.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => { setSelectedItemId(String(item.id)); setSelectorOpen(false); }}
                                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #eef1f5' }}
                                            >
                                                {item.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Название лота' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder='Описание' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder='Цена' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                        </div>
                        {createError && <div style={{ color: '#c93434', fontSize: 13, padding: '6px 12px' }}>{createError}</div>}

                        {showDebug && <div style={{ margin: '8px 12px', padding: '10px 12px', background: '#10151f', color: '#cce3ff', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
                            <div>DEBUG marketplace</div>
                            <div>category: {activeCategory} | type: {activeType}</div>
                            <div>items: {sellOptions.item ? sellOptions.item.length : 0} | vehicles: {sellOptions.vehicle ? sellOptions.vehicle.length : 0} | houses: {sellOptions.house ? sellOptions.house.length : 0} | biz: {sellOptions.biz ? sellOptions.biz.length : 0}</div>
                            <div>activeOptions: {activeOptions.length} | selectedItemId: {String(selectedItemId || '-')}</div>
                            <div>createMode: {String(isCreateMode)} | error: {createError || '-'}</div>
                        </div>}

                        <div style={cardsWrap}>
                            {renderLots.map((lot) => (
                                <div key={lot.id} style={cardStyle}>
                                    {lot.img ? <img src={lot.img} alt='' style={imgStyle} /> : <div style={imgStyle} />}
                                    <div style={{ padding: 10 }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#212a35' }}>{lot.title}</div>
                                        <div style={{ fontSize: 12, color: '#7a838f', marginTop: 2 }}>{lot.category}</div>
                                        <div style={{ fontSize: 27, fontWeight: 800, color: '#222f3c', marginTop: 8 }}>${lot.price}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            {lot.sellerCharacterId === characterId ? (
                                                <button style={{ border: 'none', borderRadius: 8, background: '#50545c', color: '#fff', padding: '9px 12px', cursor: 'pointer', flex: 1 }} onClick={() => mp.trigger('callRemote', 'marketplace.phone.remove', lot.id)}>Снять</button>
                                            ) : (
                                                <button style={{ border: 'none', borderRadius: 8, background: '#3f8f3f', color: '#fff', padding: '9px 12px', cursor: 'pointer', flex: 1 }} onClick={() => onBuy(lot.id)}>Купить</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!renderLots.length && <div style={{ color: '#58606a', padding: 16 }}>Пока нет лотов. Создай первый лот.</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const mapStateToProps = (state) => ({
    isOpen: !!(state.info && state.info.marketplaceFullscreen),
    marketplaceLots: state.info && Array.isArray(state.info.marketplaceLots) ? state.info.marketplaceLots : [],
    sellOptions: state.info && state.info.marketplaceSellOptions ? state.info.marketplaceSellOptions : { item: [], vehicle: [], house: [], biz: [] },
    characterId: state.info && state.info.id ? state.info.id : 0
});

const mapDispatchToProps = (dispatch) => ({
    closeFullscreen: () => dispatch({ type: 'PHONE_MARKETPLACE_FULLSCREEN', payload: false })
});

export default connect(mapStateToProps, mapDispatchToProps)(MarketplaceFullscreen);
