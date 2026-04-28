import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import styles from '../styles/inventory.module.scss';

const getItemSize = (item = {}) => ({
    x: Number(item.sizeX || item.width || 1),
    y: Number(item.sizeY || item.height || 1),
});

const getItemPreview = (item) => item.icon || item.initials || ((item.name && item.name[0]) || '?');

const getSlotWeight = (item) => (item && item.weight !== undefined ? `${item.weight.toFixed(2)} кг` : '0.00 кг');

const QuickSlot = ({ slot }) => (
    <div className={`${styles.quickSlot} ${slot.item ? styles.quickSlotFilled : ''}`}>
        <span className={styles.quickSlotIndex}>{slot.key}</span>
        <div className={styles.quickSlotContent}>
            <div className={styles.quickSlotIcon}>{slot.item ? getItemPreview(slot.item) : '—'}</div>
            <div>
                <div className={styles.quickSlotName}>{slot.item ? slot.item.name : 'Пустой слот'}</div>
                <div className={styles.quickSlotWeight}>{slot.item ? getSlotWeight(slot.item) : 'Назначьте предмет'}</div>
            </div>
        </div>
    </div>
);

const GridCell = ({ cell }) => {
    const itemSize = getItemSize(cell.item);

    return (
        <div
            className={`${styles.gridCell} ${cell.item ? styles.gridCellFilled : ''}`}
            style={{
                gridColumn: `span ${itemSize.x}`,
                gridRow: `span ${itemSize.y}`,
            }}
        >
            <span className={styles.gridCellIndex}>{cell.index + 1}</span>
            {cell.item ? (
                <>
                    <div className={styles.gridItemIcon}>{getItemPreview(cell.item)}</div>
                    <div className={styles.gridItemMeta}>
                        <span className={styles.gridItemName}>{cell.item.name}</span>
                        <span className={styles.gridItemWeight}>{getSlotWeight(cell.item)}</span>
                        <span className={styles.gridItemSize}>{itemSize.x}x{itemSize.y}</span>
                    </div>
                </>
            ) : (
                <span className={styles.gridCellEmpty}>Свободно</span>
            )}
        </div>
    );
};

const ContainerGrid = ({ section, onHoverItem }) => {
    const cells = useMemo(() => section.slots.map((slot, index) => ({ ...slot, index })), [section.slots]);
    const totalWeight = section.slots.reduce((acc, slot) => acc + ((slot.item && slot.item.weight) || 0), 0);

    return (
        <article className={styles.containerPanel}>
            <header className={styles.containerHeader}>
                <div>
                    <h3>{section.title}</h3>
                    <span>{section.description || 'Контейнер с предметами'}</span>
                </div>
                <div className={styles.containerWeight}>{totalWeight.toFixed(2)} кг ▾</div>
            </header>
            <div className={styles.containerGrid}>
                {cells.map((cell) => (
                    <div key={cell.id} onMouseEnter={() => onHoverItem(cell.item)} onMouseLeave={() => onHoverItem(null)}>
                        <GridCell cell={cell} />
                    </div>
                ))}
            </div>
        </article>
    );
};

const EquipmentSlot = ({ slot, className = '' }) => (
    <div className={`${styles.equipmentSlot} ${slot.item ? styles.equipmentSlotFilled : ''} ${className}`}>
        <span className={styles.equipmentSlotLabel}>{slot.label}</span>
        <span className={styles.equipmentSlotValue}>{slot.item ? slot.item.name : 'Пусто'}</span>
    </div>
);

const Inventory = () => {
    const { weight, quickSlots, sections, equipment } = useSelector((state) => state.inventory);
    const [hoveredItem, setHoveredItem] = useState(null);

    return (
        <div className={styles.overlay}>
            <div className={styles.layout}>
                <aside className={styles.leftColumn}>
                    <div className={styles.columnTitle}>Быстрый доступ</div>
                    <div className={styles.quickSlotsList}>
                        {quickSlots.map((slot) => (
                            <QuickSlot key={slot.key} slot={slot} />
                        ))}
                    </div>
                </aside>

                <section className={styles.centerColumn}>
                    <header className={styles.centerHeader}>
                        <div>
                            <p className={styles.kicker}>Character Inventory</p>
                            <h1>Снаряжение и лут</h1>
                        </div>
                        <div className={styles.totalWeight}>{weight.current.toFixed(2)} / {weight.max.toFixed(2)} кг</div>
                    </header>

                    <div className={styles.containersWrap}>
                        {sections.map((section) => (
                            <ContainerGrid key={section.id} section={section} onHoverItem={setHoveredItem} />
                        ))}
                    </div>
                </section>

                <aside className={styles.rightColumn}>
                    <div className={styles.columnTitle}>Экипировка</div>
                    <div className={styles.paperDoll}>
                        <div className={styles.paperDollSilhouette} />
                        {equipment.leftColumn.map((slot) => (
                            <EquipmentSlot key={slot.id} slot={slot} className={styles[`slot${slot.id}`]} />
                        ))}
                        {equipment.rightColumn.map((slot) => (
                            <EquipmentSlot key={slot.id} slot={slot} className={styles[`slot${slot.id}`]} />
                        ))}
                    </div>

                    <div className={styles.handsBlock}>
                        {equipment.hands.map((slot) => (
                            <EquipmentSlot key={slot.id} slot={slot} />
                        ))}
                    </div>

                    <div className={styles.statusBars}>
                        {equipment.stats.map((stat) => (
                            <div key={stat.id} className={styles.statusBarRow}>
                                <span>{stat.label}</span>
                                <div className={styles.statusTrack}><div className={styles.statusFill} style={{ width: stat.value }} /></div>
                                <strong>{stat.value}</strong>
                            </div>
                        ))}
                    </div>

                    <div className={styles.infoPanel}>
                        <h4>Информация о предмете</h4>
                        {hoveredItem ? (
                            <>
                                <div className={styles.infoName}>{hoveredItem.name}</div>
                                <p className={styles.infoDescription}>
                                    {hoveredItem.description || 'Описание отсутствует. Предмет готов к использованию или перемещению.'}
                                </p>
                                <div className={styles.infoMeta}>Вес: {getSlotWeight(hoveredItem)}</div>
                            </>
                        ) : (
                            <p className={styles.infoDescription}>Наведите курсор на предмет, чтобы увидеть описание без обрезки текста.</p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default Inventory;
