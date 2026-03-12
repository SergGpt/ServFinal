import React from 'react';
import { useSelector } from 'react-redux';

import styles from '../styles/inventory.module.scss';

const getItemSize = (item) => ({
    width: Math.max(1, item?.sizeX || 1),
    height: Math.max(1, item?.sizeY || 1),
});

const getItemDescription = (item) => {
    if (!item) return 'Выберите предмет, чтобы увидеть его подробные характеристики, размер, вес и дополнительные параметры.';

    return item.description ||
        'Надёжный предмет для выживания в полевых условиях. Подходит для длительных рейдов и тактических выходов.';
};

const QuickSlot = ({ slot }) => (
    <div className={styles.hotbarSlot}>
        <span className={styles.hotbarKey}>{slot.key}</span>
        <div className={`${styles.hotbarBody} ${slot.item ? styles.hotbarBodyFilled : ''}`}>
            {slot.item ? (
                <>
                    <div className={styles.hotbarIcon}>{slot.item.icon || slot.item.initials || slot.item.name[0]}</div>
                    <div className={styles.hotbarInfo}>
                        <span className={styles.hotbarName}>{slot.item.name}</span>
                        {slot.item.weight !== undefined && <span className={styles.hotbarMeta}>{slot.item.weight.toFixed(2)} кг</span>}
                    </div>
                </>
            ) : (
                <span className={styles.hotbarEmpty}>Пусто</span>
            )}
        </div>
    </div>
);

const InventorySlot = ({ slot, index }) => {
    const itemSize = getItemSize(slot.item);

    return (
        <div
            className={`${styles.inventorySlot} ${slot.item ? styles.inventorySlotFilled : ''}`}
            style={{
                gridColumn: `span ${itemSize.width}`,
                gridRow: `span ${itemSize.height}`,
            }}
        >
            <span className={styles.slotIndex}>{index + 1}</span>
            {slot.item ? (
                <>
                    <div className={styles.itemIcon}>{slot.item.icon || slot.item.initials || slot.item.name[0]}</div>
                    <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{slot.item.name}</span>
                        {slot.item.weight !== undefined && <span className={styles.itemWeight}>{slot.item.weight.toFixed(2)} кг</span>}
                    </div>
                </>
            ) : (
                <span className={styles.emptyPlaceholder}>Свободно</span>
            )}
        </div>
    );
};

const EquipmentSlot = ({ slot }) => (
    <div className={`${styles.equipmentSlot} ${slot.item ? styles.equipmentSlotFilled : ''}`}>
        <div className={styles.equipmentLabel}>{slot.label}</div>
        <div className={styles.equipmentValue}>{slot.item ? slot.item.name : <span className={styles.equipmentEmpty}>Пусто</span>}</div>
    </div>
);

const Inventory = () => {
    const { weight, quickSlots, inventorySlots, sections, equipment } = useSelector((state) => state.inventory);

    const equipmentItems = [
        ...equipment.leftColumn,
        ...equipment.rightColumn,
        ...equipment.bottomRow,
        ...equipment.hands,
    ].map((slot) => slot.item).filter(Boolean);

    const selectedItem = inventorySlots.find((slot) => slot.item)?.item || equipmentItems[0] || quickSlots.find((slot) => slot.item)?.item || null;
    const selectedItemSize = getItemSize(selectedItem);

    return (
        <div className={styles.overlay}>
            <div className={styles.container}>
                <div className={styles.mainLayout}>
                    <aside className={styles.equipmentPanel}>
                        <div className={styles.panelTitle}>Персонаж</div>
                        <div className={styles.equipmentLayout}>
                            <div className={styles.equipmentColumn}>
                                {equipment.leftColumn.map((slot) => (
                                    <EquipmentSlot key={slot.id} slot={slot} />
                                ))}
                            </div>

                            <div className={styles.characterSilhouette}>
                                <div className={styles.characterGlow} />
                                <div className={styles.characterBody} />
                            </div>

                            <div className={styles.equipmentColumn}>
                                {equipment.rightColumn.map((slot) => (
                                    <EquipmentSlot key={slot.id} slot={slot} />
                                ))}
                            </div>
                        </div>

                        <div className={styles.equipmentBottom}>
                            {equipment.bottomRow.map((slot) => (
                                <EquipmentSlot key={slot.id} slot={slot} />
                            ))}
                        </div>

                        <div className={styles.equipmentBottom}>
                            {equipment.hands.map((slot) => (
                                <EquipmentSlot key={slot.id} slot={slot} />
                            ))}
                        </div>

                        <div className={styles.statsPanel}>
                            {equipment.stats.map((stat) => (
                                <div key={stat.id} className={styles.statRow}>
                                    <span className={styles.statName}>{stat.label}</span>
                                    <span className={styles.statValue}>{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <section className={styles.inventoryPanel}>
                        <header className={styles.inventoryHeader}>
                            <div>
                                <h2>Инвентарь</h2>
                                <p>
                                    Вес: {weight.current.toFixed(2)} / {weight.max} кг
                                </p>
                            </div>
                            <div className={styles.filters}>
                                <button className={styles.filterActive}>Все</button>
                                <button>Одежда</button>
                                <button>Еда</button>
                                <button>Разное</button>
                            </div>
                        </header>

                        <div className={styles.inventoryGridFrame}>
                            <div className={styles.inventoryGrid}>
                                {inventorySlots.map((slot, index) => (
                                    <InventorySlot key={slot.id} slot={slot} index={index} />
                                ))}
                            </div>
                        </div>

                        {sections.map((section) => (
                            <div key={section.id} className={styles.sectionBlock}>
                                <div className={styles.sectionTitle}>{section.title}</div>
                                <div className={styles.sectionSlots}>
                                    {section.slots.map((slot, index) => (
                                        <div key={slot.id} className={`${styles.inventorySlot} ${styles.sectionSlot}`}>
                                            <span className={styles.slotIndex}>{index + 1}</span>
                                            {slot.item ? <span className={styles.itemName}>{slot.item.name}</span> : <span className={styles.emptyPlaceholder}>Свободно</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>

                    <aside className={styles.infoPanel}>
                        <div className={styles.panelTitle}>Детали предмета</div>

                        <div className={styles.itemPreview}>
                            {selectedItem ? selectedItem.icon || selectedItem.initials || selectedItem.name[0] : '—'}
                        </div>

                        <div className={styles.itemHeadline}>{selectedItem ? selectedItem.name : 'Ничего не выбрано'}</div>
                        <div className={styles.itemSubline}>{selectedItem ? 'Инвентарь персонажа' : 'Выберите предмет в сетке или экипировке'}</div>

                        <div className={styles.detailsGrid}>
                            <div className={styles.detailCard}>
                                <span>Тип</span>
                                <strong>{selectedItem?.type || 'Снаряжение'}</strong>
                            </div>
                            <div className={styles.detailCard}>
                                <span>Вес</span>
                                <strong>{selectedItem?.weight !== undefined ? `${selectedItem.weight.toFixed(2)} кг` : '—'}</strong>
                            </div>
                            <div className={styles.detailCard}>
                                <span>Размер</span>
                                <strong>{selectedItem ? `${selectedItemSize.width}x${selectedItemSize.height}` : '—'}</strong>
                            </div>
                            <div className={styles.detailCard}>
                                <span>Класс</span>
                                <strong>{selectedItem?.rarity || 'Обычный'}</strong>
                            </div>
                        </div>

                        <div className={styles.descriptionBlock}>
                            <div className={styles.descriptionTitle}>Описание</div>
                            <p>{getItemDescription(selectedItem)}</p>
                        </div>
                    </aside>
                </div>

                <footer className={styles.hotbarPanel}>
                    <div className={styles.panelTitle}>Быстрый доступ</div>
                    <div className={styles.hotbarRow}>
                        {quickSlots.map((slot) => (
                            <QuickSlot key={slot.key} slot={slot} />
                        ))}
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default Inventory;
