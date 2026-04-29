/* eslint-disable no-undef */
import React, { useEffect } from 'react';
import { closeApp } from '../../actions/apps.actions';
import { connect } from 'react-redux';

const MarketplaceApp = ({ closeAppAction }) => {
    useEffect(() => {
        if (typeof mp !== 'undefined' && mp.trigger) {
            mp.trigger('callRemote', 'marketplace.phone.open.fullscreen');
        }
        closeAppAction();
    }, [closeAppAction]);

    return null;
};

const mapDispatchToProps = (dispatch) => ({
    closeAppAction: () => dispatch(closeApp())
});

export default connect(null, mapDispatchToProps)(MarketplaceApp);
