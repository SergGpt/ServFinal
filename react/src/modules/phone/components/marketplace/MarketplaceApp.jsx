/* eslint-disable no-undef */
import React, {useEffect, useState} from 'react';
import {closeApp} from '../../actions/apps.actions';
import {connect} from 'react-redux';

const cardStyle = {
    background: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    color: '#fff'
};

const inputStyle = {
    width: '100%',
    marginBottom: 6,
    borderRadius: 6,
    border: 'none',
    padding: '8px 10px'
};

const btnStyle = {
    border: 'none',
    borderRadius: 6,
    padding: '8px 10px',
    cursor: 'pointer'
};

const MarketplaceApp = ({closeAppAction, marketplaceLots}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');

    useEffect(() => {
        mp.trigger('callRemote', 'marketplace.phone.open');
    }, []);

    const onCreate = () => {
        mp.trigger('callRemote', 'marketplace.phone.create', title, description, price);
        setTitle('');
        setDescription('');
        setPrice('');
    };

    const onBuy = (id) => {
        mp.trigger('callRemote', 'marketplace.phone.buy', id);
    };

    return (
        <div style={{padding: 12, color: '#fff'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                <strong>Маркетплейс</strong>
                <button style={btnStyle} onClick={closeAppAction}>Назад</button>
            </div>

            <div style={cardStyle}>
                <div style={{marginBottom: 8}}>Создать лот</div>
                <input style={inputStyle} placeholder='Название' value={title} onChange={e => setTitle(e.target.value)} />
                <input style={inputStyle} placeholder='Описание' value={description} onChange={e => setDescription(e.target.value)} />
                <input style={inputStyle} placeholder='Цена' value={price} onChange={e => setPrice(e.target.value)} />
                <button style={{...btnStyle, width: '100%'}} onClick={onCreate}>Опубликовать</button>
            </div>

            <div style={{maxHeight: 360, overflowY: 'auto'}}>
                {(marketplaceLots || []).map((lot) => (
                    <div key={lot.id} style={cardStyle}>
                        <div><strong>{lot.title}</strong></div>
                        <div style={{opacity: 0.8, fontSize: 12}}>Продавец: {lot.sellerName}</div>
                        <div style={{marginTop: 6}}>{lot.description || 'Без описания'}</div>
                        <div style={{marginTop: 6}}>Цена: ${lot.price}</div>
                        <button style={{...btnStyle, marginTop: 6, width: '100%'}} onClick={() => onBuy(lot.id)}>
                            Купить
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const mapStateToProps = state => ({
    marketplaceLots: state.info.marketplaceLots || []
});

const mapDispatchToProps = dispatch => ({
    closeAppAction: () => dispatch(closeApp())
});

export default connect(mapStateToProps, mapDispatchToProps)(MarketplaceApp);
