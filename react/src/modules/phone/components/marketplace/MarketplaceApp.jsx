/* eslint-disable no-undef */
import React from 'react';
import { closeApp } from '../../actions/apps.actions';
import { connect } from 'react-redux';

const btnStyle = {
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer'
};

const MarketplaceApp = ({ closeAppAction }) => {
    const onOpenFullscreen = () => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.open.fullscreen');
        }
        closeAppAction();
    };

    return (
        <div style={{ padding: 12, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong>Маркетплейс</strong>
                <button style={btnStyle} onClick={closeAppAction}>Назад</button>
            </div>

            <div style={{ background: 'rgba(0,0,0,.35)', borderRadius: 10, padding: 12 }}>
                <div style={{ marginBottom: 10, opacity: 0.9 }}>
                    Полноценный маркетплейс открывается отдельным большим окном.
                </div>
                <button style={{ ...btnStyle, width: '100%' }} onClick={onOpenFullscreen}>
                    Открыть маркетплейс
                </button>
            </div>
        </div>
    );
};

const mapDispatchToProps = (dispatch) => ({
    closeAppAction: () => dispatch(closeApp())
});

export default connect(null, mapDispatchToProps)(MarketplaceApp);
