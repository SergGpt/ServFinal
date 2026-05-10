import React, { useEffect, useState } from 'react';
import styles from '../../phone.module.scss';

const standardWeaponSkins = [
    { id: 0, name: 'Стандартный', source: 'Игра' },
    { id: 1, name: 'Зелёный', source: 'Игра' },
    { id: 2, name: 'Золотой', source: 'Игра' },
    { id: 3, name: 'Розовый', source: 'Игра' },
    { id: 4, name: 'Армейский', source: 'Игра' },
    { id: 5, name: 'LSPD', source: 'Игра' },
    { id: 6, name: 'Оранжевый', source: 'Игра' },
    { id: 7, name: 'Платиновый', source: 'Игра' }
];

const mk2WeaponSkins = [
    'Классический чёрный', 'Классический серый', 'Классический двухцветный', 'Классический белый',
    'Классический бежевый', 'Классический зелёный', 'Классический синий', 'Классический земляной',
    'Классический коричневый/чёрный', 'Красный контраст', 'Синий контраст', 'Жёлтый контраст',
    'Оранжевый контраст', 'Яркий розовый', 'Яркий фиолетовый/жёлтый', 'Яркий оранжевый',
    'Яркий зелёный/фиолетовый', 'Яркий красный', 'Яркий зелёный', 'Яркий голубой',
    'Яркий жёлтый', 'Яркий красный/белый', 'Яркий синий/белый', 'Металлик золото',
    'Металлик платина', 'Металлик серый/сиреневый', 'Металлик фиолетовый/лайм', 'Металлик красный',
    'Металлик зелёный', 'Металлик синий', 'Металлик белый/аква', 'Металлик красный/жёлтый'
].map((name, id) => ({ id, name, source: 'DLC / Mk II' }));

const triggerClientEvent = (eventName, payload) => {
    const rageMp = typeof window !== 'undefined' ? window.mp : null;
    if (!rageMp || !rageMp.trigger) return;

    rageMp.trigger(eventName, JSON.stringify(payload));
};

const CustomizationApp = () => {
    const [section, setSection] = useState('menu');
    const [weaponType, setWeaponType] = useState('standard');
    const [weaponIndex, setWeaponIndex] = useState(0);

    const weaponSkins = weaponType === 'standard' ? standardWeaponSkins : mk2WeaponSkins;
    const selectedWeapon = weaponSkins[weaponIndex];

    const cycleWeapon = direction => {
        setWeaponIndex((weaponIndex + direction + weaponSkins.length) % weaponSkins.length);
    };

    const setWeaponSkinType = type => {
        setWeaponType(type);
        setWeaponIndex(0);
    };

    const previewWeaponSkin = () => {
        triggerClientEvent('phone.customization.weapon.preview', {
            tintId: selectedWeapon.id,
            skinType: weaponType,
            name: selectedWeapon.name
        });
    };

    useEffect(() => {
        if (section !== 'skins') return;
        previewWeaponSkin();
    }, [section, weaponType, weaponIndex]);

    return (
        <div className={[styles.app, styles.customizationApp].join(' ')}>
            <div className={styles.customizationHeader}>
                <span>Кастомизация</span>
                {section !== 'menu' && <button onClick={() => setSection('menu')}>Назад</button>}
            </div>

            {section === 'menu' && (
                <div className={styles.customizationMenu}>
                    <div className={styles.customizationHero}>
                        <div className={styles.customizationHeroIcon}>✦</div>
                        <b>Скины оружия</b>
                        <p>Выберите раскраску для текущего оружия. Скин сохраняется за персонажем и оружием.</p>
                    </div>
                    <button onClick={() => setSection('skins')}>Скины</button>
                </div>
            )}

            {section === 'skins' && (
                <div className={styles.customizationContent}>
                    <div className={styles.skinTypeSwitch}>
                        <button
                            className={weaponType === 'standard' ? styles.activeCustomizationTab : ''}
                            onClick={() => setWeaponSkinType('standard')}
                        >
                            Обычные
                        </button>
                        <button
                            className={weaponType === 'mk2' ? styles.activeCustomizationTab : ''}
                            onClick={() => setWeaponSkinType('mk2')}
                        >
                            Mk II / DLC
                        </button>
                    </div>
                    <div className={styles.skinPreviewCard}>
                        <div className={styles.weaponPreview} style={{ background: getWeaponGradient(selectedWeapon.id) }} />
                        <h3>{selectedWeapon.name}</h3>
                        <p>{selectedWeapon.source}</p>
                        <div className={styles.skinMeta}>Tint ID: <b>{selectedWeapon.id}</b></div>
                    </div>
                    <div className={styles.skinControls}>
                        <button onClick={() => cycleWeapon(-1)}>← Пред.</button>
                        <span>{weaponIndex + 1}/{weaponSkins.length}</span>
                        <button onClick={() => cycleWeapon(1)}>След. →</button>
                    </div>
                    <button className={styles.skinApplyButton} onClick={previewWeaponSkin}>Примерить и сохранить</button>
                </div>
            )}
        </div>
    );
};

const getWeaponGradient = id => {
    const colors = [
        '#24252b', '#30794b', '#d9a441', '#f06ab4', '#596b42', '#2f4c9d', '#ef7d22', '#bcc5d0',
        '#575b66', '#96a4bf', '#e7e1ce', '#70513b', '#bc2f35', '#2262d4', '#f4cc2d', '#852cb8'
    ];
    const primary = colors[id % colors.length];
    const secondary = colors[(id + 5) % colors.length];

    return 'linear-gradient(135deg, ' + primary + ' 0%, ' + primary + ' 42%, ' + secondary + ' 43%, ' + secondary + ' 100%)';
};

export default CustomizationApp;
