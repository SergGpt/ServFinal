/* eslint-disable no-undef */
import React from 'react';
import { closeApp } from '../../actions/apps.actions';
import { connect } from 'react-redux';

const MarketplaceApp = ({ closeAppAction }) => {
    const onOpenFullscreen = () => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.open.fullscreen');
        }
        closeAppAction();
    };

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 999,
                background: 'rgba(9, 14, 28, 0.88)',
                padding: 12,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#fff' }}>Маркетплейс</strong>
                <button
                    style={{ border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
                    onClick={closeAppAction}
                >
                    Назад
                </button>
            </div>
            <div
                style={{
                    marginTop: 12,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: 12,
                    color: '#fff'
                }}
            >
                <div style={{ marginBottom: 10, lineHeight: '18px' }}>
                    Полноценный маркетплейс открывается отдельным большим окном.
                </div>
                <button
                    style={{ width: '100%', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}
                    onClick={onOpenFullscreen}
                >
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
