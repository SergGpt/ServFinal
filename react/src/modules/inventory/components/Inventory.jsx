import React from 'react';
import { useSelector } from 'react-redux';

import styles from '../styles/inventory.module.scss';

const QuickSlot = ({ slot }) => (
    <div className={styles.quickSlot}>
        <span className={styles.quickSlotIndex}>{slot.key}</span>
        <div className={styles.quickSlotBody}>
            {slot.item ? (
                <>
                    <div className={styles.quickSlotIcon}>{slot.item.icon || slot.item.initials || slot.item.name[0]}</div>
                    <div className={styles.quickSlotInfo}>
                        <span className={styles.quickSlotName}>{slot.item.name}</span>
                        {slot.item.weight !== undefined && (
                            <span className={styles.quickSlotWeight}>{slot.item.weight.toFixed(2)} кг</span>
                        )}
                    </div>
                </>
            ) : (
                <span className={styles.quickSlotEmpty}>Пусто</span>
            )}
        </div>
    </div>
);

const InventorySlot = ({ slot, index }) => (
    <div className={`${styles.inventorySlot} ${slot.item ? styles.inventorySlotFilled : ''}`}>
        <span className={styles.slotIndex}>{index + 1}</span>
        {slot.item ? (
            <>
                <div className={styles.itemIcon}>{slot.item.icon || slot.item.initials || slot.item.name[0]}</div>
                <div className={styles.itemInfo}>
                    <span className={styles.itemName}>{slot.item.name}</span>
                    {slot.item.weight !== undefined && (
                        <span className={styles.itemWeight}>{slot.item.weight.toFixed(2)} кг</span>
                    )}
                </div>
            </>
        ) : (
            <span className={styles.emptyPlaceholder}>Свободно</span>
        )}
    </div>
);

const EquipmentSlot = ({ slot }) => (
    <div className={`${styles.equipmentSlot} ${slot.item ? styles.equipmentSlotFilled : ''}`}>
        <div className={styles.equipmentLabel}>{slot.label}</div>
        <div className={styles.equipmentBody}>
            {slot.item ? (
                <span>{slot.item.name}</span>
            ) : (
                <span className={styles.equipmentEmpty}>Пусто</span>
            )}
        </div>
    </div>
);

const StatBlock = ({ stat }) => (
    <div className={styles.statBlock}>
        <span className={styles.statDot} />
        <div>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statValue}>{stat.value}</div>
        </div>
    </div>
);

const Inventory = () => {
    const { weight, quickSlots, inventorySlots, sections, equipment } = useSelector((state) => state.inventory);

    return (
        <div className={styles.overlay}>
            <div className={styles.container}>
                <aside className={styles.quickSlots}>
                    <div className={styles.sectionHeading}>Быстрые слоты</div>
                    {quickSlots.map((slot) => (
                        <QuickSlot key={slot.key} slot={slot} />
                    ))}
                </aside>

                <section className={styles.inventorySection}>
                    <header className={styles.inventoryHeader}>
                        <div>
                            <h2>Инвентарь</h2>
                            <div className={styles.weightLabel}>
                                {weight.current.toFixed(2)} / {weight.max} кг
                            </div>
                        </div>
                        <div className={styles.filters}>
                            <button className={styles.filterActive}>Все</button>
                            <button>Одежда</button>
                            <button>Еда</button>
                            <button>Разное</button>
                        </div>
                    </header>

                    <div className={styles.inventoryGrid}>
                        {inventorySlots.map((slot, index) => (
                            <InventorySlot key={slot.id} slot={slot} index={index} />
                        ))}
                    </div>

                    {sections.map((section) => (
                        <div key={section.id} className={styles.sectionGroup}>
                            <div className={styles.sectionHeading}>{section.title}</div>
                            <div className={styles.sectionSlots}>
                                {section.slots.map((slot) => (
                                    <div key={slot.id} className={`${styles.inventorySlot} ${styles.sectionSlot}`}>
                                        {slot.item ? (
                                            <div className={styles.itemInfo}>
                                                <span className={styles.itemName}>{slot.item.name}</span>
                                                {slot.item.weight !== undefined && (
                                                    <span className={styles.itemWeight}>{slot.item.weight.toFixed(2)} кг</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className={styles.emptyPlaceholder}>Свободно</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>

                <aside className={styles.equipmentSection}>
                    <div className={styles.sectionHeading}>Экипировка</div>
                    <div className={styles.equipmentLayout}>
                        <div className={styles.equipmentColumn}>
                            {equipment.leftColumn.map((slot) => (
                                <EquipmentSlot key={slot.id} slot={slot} />
                            ))}
                        </div>
                        <div className={styles.avatarPlaceholder}>
                            <div className={styles.avatarCore} />
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

                    <div className={styles.handsSection}>
                        {equipment.hands.map((slot) => (
                            <div key={slot.id} className={`${styles.inventorySlot} ${styles.handSlot}`}>
                                <div className={styles.equipmentLabel}>{slot.label}</div>
                                <div className={styles.equipmentBody}>
                                    {slot.item ? slot.item.name : <span className={styles.equipmentEmpty}>Свободно</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.statsPanel}>
                        {equipment.stats.map((stat) => (
                            <StatBlock key={stat.id} stat={stat} />
                        ))}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default Inventory;
