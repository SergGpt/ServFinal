/* eslint-disable no-undef */
import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';

const overlayStyle = {
    position: 'fixed',
    left: 0,
    top: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(10, 12, 18, 0.92)',
    zIndex: 9999,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    padding: 24,
    boxSizing: 'border-box'
};

const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
    overflowY: 'auto',
    paddingRight: 6
};

const cardStyle = {
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.15)',
    padding: 12,
    background: 'rgba(255,255,255,0.05)'
};

const inputStyle = {
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.2)',
    color: '#fff',
    padding: '10px 12px'
};

const buttonStyle = {
    border: 'none',
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer'
};

const MarketplaceFullscreen = ({ isOpen, marketplaceLots, closeFullscreen }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.open');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const onCreate = () => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.create', title, description, price);
        }
        setTitle('');
        setDescription('');
        setPrice('');
    };

    const onBuy = (id) => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.buy', id);
        }
    };

    return (
        <div style={overlayStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Маркетплейс</h2>
                <button style={{ ...buttonStyle, background: '#2d2f36', color: '#fff' }} onClick={closeFullscreen}>Закрыть</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 16, minHeight: 0, flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3 style={{ margin: 0 }}>Создать лот</h3>
                    <input style={inputStyle} placeholder='Название' value={title} onChange={(e) => setTitle(e.target.value)} />
                    <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} placeholder='Описание' value={description} onChange={(e) => setDescription(e.target.value)} />
                    <input style={inputStyle} placeholder='Цена' value={price} onChange={(e) => setPrice(e.target.value)} />
                    <button style={{ ...buttonStyle, background: '#2b76d2', color: '#fff' }} onClick={onCreate}>Опубликовать</button>
                </div>

                <div style={gridStyle}>
                    {(marketplaceLots || []).map((lot) => (
                        <div key={lot.id} style={cardStyle}>
                            <div style={{ fontWeight: 700 }}>{lot.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.85 }}>Продавец: {lot.sellerName}</div>
                            <div style={{ marginTop: 8 }}>{lot.description || 'Без описания'}</div>
                            <div style={{ marginTop: 8, fontWeight: 700 }}>${lot.price}</div>
                            <button style={{ ...buttonStyle, marginTop: 8, background: '#3f8f3f', color: '#fff' }} onClick={() => onBuy(lot.id)}>Купить</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const mapStateToProps = (state) => ({
    isOpen: !!(state.info && state.info.marketplaceFullscreen),
    marketplaceLots: state.info && Array.isArray(state.info.marketplaceLots) ? state.info.marketplaceLots : []
});

const mapDispatchToProps = (dispatch) => ({
    closeFullscreen: () => dispatch({ type: 'PHONE_MARKETPLACE_FULLSCREEN', payload: false })
});

export default connect(mapStateToProps, mapDispatchToProps)(MarketplaceFullscreen);
