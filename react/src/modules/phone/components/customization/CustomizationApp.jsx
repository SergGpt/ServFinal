import React, { useState } from 'react';
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

const armourSkins = [
    { id: 0, component: 9, drawable: 0, texture: 0, name: 'Без бронежилета', source: 'Игра' },
    { id: 1, component: 9, drawable: 1, texture: 0, name: 'Лёгкий чёрный', source: 'Игра' },
    { id: 2, component: 9, drawable: 2, texture: 0, name: 'Средний чёрный', source: 'Игра' },
    { id: 3, component: 9, drawable: 3, texture: 0, name: 'Тяжёлый чёрный', source: 'Игра' },
    { id: 4, component: 9, drawable: 4, texture: 0, name: 'Тактический', source: 'Игра' },
    { id: 5, component: 9, drawable: 5, texture: 0, name: 'Разгрузочный', source: 'Игра' },
    { id: 6, component: 9, drawable: 6, texture: 0, name: 'Полицейский', source: 'DLC' },
    { id: 7, component: 9, drawable: 7, texture: 0, name: 'Военный', source: 'DLC' },
    { id: 8, component: 9, drawable: 8, texture: 0, name: 'Охрана', source: 'DLC' },
    { id: 9, component: 9, drawable: 9, texture: 0, name: 'Разведка', source: 'DLC' },
    { id: 10, component: 9, drawable: 10, texture: 0, name: 'Штурмовой', source: 'DLC' },
    { id: 11, component: 9, drawable: 11, texture: 0, name: 'Плитник', source: 'DLC' },
    { id: 12, component: 9, drawable: 12, texture: 0, name: 'Камуфляжный', source: 'DLC' }
];

const donateIdeas = [
    { id: 'donate-01', name: 'Уникальные раскраски оружия', description: 'Редкие цвета, градиенты и сезонные камуфляжи для донат-режима.' },
    { id: 'donate-02', name: 'Наклейки / декали', description: 'Логотипы фракций, номера, ранги и кастомные эмблемы.' },
    { id: 'donate-03', name: 'Комплекты брони', description: 'Премиальные варианты бронежилетов с texture ID и drawable ID.' },
    { id: 'donate-04', name: 'Избранное', description: 'Быстрый список купленных и часто используемых скинов.' }
];

const tabs = [
    { id: 'weapons', name: 'Оружие' },
    { id: 'armour', name: 'Амуниция' },
    { id: 'custom', name: 'Кастом' }
];

const CustomizationApp = () => {
    const [section, setSection] = useState('menu');
    const [tab, setTab] = useState('weapons');
    const [weaponType, setWeaponType] = useState('standard');
    const [weaponIndex, setWeaponIndex] = useState(0);
    const [armourIndex, setArmourIndex] = useState(0);

    const weaponSkins = weaponType === 'standard' ? standardWeaponSkins : mk2WeaponSkins;
    const selectedWeapon = weaponSkins[weaponIndex];
    const selectedArmour = armourSkins[armourIndex];

    const cycleWeapon = direction => {
        setWeaponIndex((weaponIndex + direction + weaponSkins.length) % weaponSkins.length);
    };

    const cycleArmour = direction => {
        setArmourIndex((armourIndex + direction + armourSkins.length) % armourSkins.length);
    };

    const setWeaponSkinType = type => {
        setWeaponType(type);
        setWeaponIndex(0);
    };

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
                        <b>Просмотр внешнего вида</b>
                        <p>Каталог всех игровых и DLC-скинов оружия и бронежилетов для разработки кастом-режима.</p>
                    </div>
                    <button onClick={() => setSection('skins')}>Скины</button>
                </div>
            )}

            {section === 'skins' && (
                <div className={styles.customizationContent}>
                    <div className={styles.customizationTabs}>
                        {tabs.map(item => (
                            <button
                                key={item.id}
                                className={tab === item.id ? styles.activeCustomizationTab : ''}
                                onClick={() => setTab(item.id)}
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>

                    {tab === 'weapons' && (
                        <div className={styles.skinPanel}>
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
                        </div>
                    )}

                    {tab === 'armour' && (
                        <div className={styles.skinPanel}>
                            <div className={styles.skinPreviewCard}>
                                <div className={styles.armourPreview}>
                                    <span>{selectedArmour.drawable}</span>
                                </div>
                                <h3>{selectedArmour.name}</h3>
                                <p>{selectedArmour.source}</p>
                                <div className={styles.skinMeta}>ID: <b>{selectedArmour.id}</b></div>
                                <div className={styles.skinMeta}>Component: <b>{selectedArmour.component}</b></div>
                                <div className={styles.skinMeta}>Drawable / Texture: <b>{selectedArmour.drawable}/{selectedArmour.texture}</b></div>
                            </div>
                            <div className={styles.skinControls}>
                                <button onClick={() => cycleArmour(-1)}>← Пред.</button>
                                <span>{armourIndex + 1}/{armourSkins.length}</span>
                                <button onClick={() => cycleArmour(1)}>След. →</button>
                            </div>
                        </div>
                    )}

                    {tab === 'custom' && (
                        <div className={styles.customIdeas}>
                            {donateIdeas.map(item => (
                                <div key={item.id} className={styles.customIdeaCard}>
                                    <b>{item.name}</b>
                                    <span>{item.id}</span>
                                    <p>{item.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
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
