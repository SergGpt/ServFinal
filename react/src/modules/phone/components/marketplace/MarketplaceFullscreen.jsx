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

const MarketplaceFullscreen = ({ isOpen, marketplaceLots, inventoryItems, closeFullscreen }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [activeCategory, setActiveCategory] = useState('Аукция');
    const [selectedItemId, setSelectedItemId] = useState('');

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

    if (!isOpen) return null;

    const onCreate = () => {
        const selectedItem = inventoryItems.find((item) => String(item.id) === String(selectedItemId));
        const finalTitle = (title || '').trim() || (selectedItem ? selectedItem.name : '');

        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.create', finalTitle, description, price);
        }
        setTitle('');
        setDescription('');
        setPrice('');
        setSelectedItemId('');
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
                        <button style={{ width: '100%', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }} onClick={closeFullscreen}>
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
                            Создать лот
                        </button>
                        <button style={{ border: 'none', borderRadius: 8, background: '#2d2f36', color: '#fff', padding: '10px 16px', cursor: 'pointer' }} onClick={closeFullscreen}>
                            Закрыть
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 180px', gap: 10, padding: 12, borderBottom: '1px solid #e2e4e8', background: '#fff' }}>
                            <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} style={{ ...boxStyle, width: '100%', outline: 'none' }}>
                                <option value=''>Выбрать предмет</option>
                                {inventoryItems.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Название лота' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder='Описание' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder='Цена' style={{ ...boxStyle, width: '100%', outline: 'none' }} />
                        </div>

                        <div style={cardsWrap}>
                            {renderLots.map((lot) => (
                                <div key={lot.id} style={cardStyle}>
                                    {lot.img ? <img src={lot.img} alt='' style={imgStyle} /> : <div style={imgStyle} />}
                                    <div style={{ padding: 10 }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#212a35' }}>{lot.title}</div>
                                        <div style={{ fontSize: 12, color: '#7a838f', marginTop: 2 }}>{lot.category}</div>
                                        <div style={{ fontSize: 27, fontWeight: 800, color: '#222f3c', marginTop: 8 }}>${lot.price}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button style={{ border: 'none', borderRadius: 8, background: '#3f8f3f', color: '#fff', padding: '9px 12px', cursor: 'pointer', flex: 1 }} onClick={() => onBuy(lot.id)}>Купить</button>
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
    inventoryItems: state.inventory && Array.isArray(state.inventory.sections)
        ? state.inventory.sections
            .flatMap((section) => Array.isArray(section.slots) ? section.slots : [])
            .filter((slot) => slot && slot.item)
            .map((slot, index) => ({
                id: slot.id || `slot-${index}`,
                name: slot.item.name || 'Без названия'
            }))
        : []
});

const mapDispatchToProps = (dispatch) => ({
    closeFullscreen: () => dispatch({ type: 'PHONE_MARKETPLACE_FULLSCREEN', payload: false })
});

export default connect(mapStateToProps, mapDispatchToProps)(MarketplaceFullscreen);
