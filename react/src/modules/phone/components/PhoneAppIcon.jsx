import React from 'react';
import styles from '@phone/phone.module.scss';

const PhoneAppIcon = ({ image, name, handleClick, app, notifs, onClick }) => {
    const handlePress = () => {
        if (onClick) {
            onClick();
            return;
        }

        handleClick(app);
    };

    return (
        <div className={styles.appIcon} onClick={handlePress}>
            <img src={image} alt="img"/>
            {notifs > 0 && <div className={styles.notifications}>{ notifs }</div> }
            <span>{ name }</span>
        </div>
    );
};

export default PhoneAppIcon;
