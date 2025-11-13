const createQuickSlot = (key, item = null) => ({
    key,
    item
});

const createInventorySlot = (id, item = null) => ({
    id,
    item
});

const createEquipmentSlot = (id, label, item = null) => ({
    id,
    label,
    item
});

const createSection = (id, title, slots = []) => ({
    id,
    title,
    slots
});

const initialState = {
    weight: {
        current: 2.45,
        max: 40,
    },
    quickSlots: [
        createQuickSlot(1),
        createQuickSlot(2, { name: 'Смартфон', weight: 0.18, icon: '📱' }),
        createQuickSlot(3),
        createQuickSlot(4, { name: 'Аптечка', weight: 1.2, icon: '✚' }),
        createQuickSlot(5),
        createQuickSlot(6),
        createQuickSlot(7),
    ],
    inventorySlots: [
        createInventorySlot('inv-1', { name: 'Футболка', weight: 0.2, initials: 'Ф', rarity: 'common' }),
        ...Array.from({ length: 23 }).map((_, index) => createInventorySlot(`inv-${index + 2}`)),
    ],
    sections: [
        createSection('armor', 'Броня', [
            createInventorySlot('armor-1'),
            createInventorySlot('armor-2'),
            createInventorySlot('armor-3'),
        ]),
    ],
    equipment: {
        leftColumn: [
            createEquipmentSlot('head', 'Голова'),
            createEquipmentSlot('glasses', 'Очки'),
            createEquipmentSlot('ears', 'Уши'),
            createEquipmentSlot('gloves', 'Перчатки'),
        ],
        rightColumn: [
            createEquipmentSlot('mask', 'Маска'),
            createEquipmentSlot('torso', 'Верх', { name: 'Футболка' }),
            createEquipmentSlot('legs', 'Низ', { name: 'Джинсы' }),
            createEquipmentSlot('shoes', 'Обувь', { name: 'Кеды' }),
        ],
        bottomRow: [
            createEquipmentSlot('bag', 'Сумка'),
            createEquipmentSlot('watch', 'Часы'),
            createEquipmentSlot('bracelet', 'Браслет'),
            createEquipmentSlot('accessory', 'Аксессуар'),
        ],
        hands: [
            createEquipmentSlot('leftHand', 'Левая рука'),
            createEquipmentSlot('rightHand', 'Правая рука'),
        ],
        stats: [
            { id: 'temperature', label: 'Температура', value: '22°' },
            { id: 'hydration', label: 'Гидратация', value: '74%' },
            { id: 'energy', label: 'Энергия', value: '58%' },
        ],
    },
};

export default function inventory(state = initialState, action) {
    const { type, payload } = action;

    switch (type) {
        case 'INVENTORY_SET_STATE':
            return {
                ...state,
                ...payload,
            };
        case 'INVENTORY_SET_WEIGHT':
            return {
                ...state,
                weight: payload,
            };
        default:
            return state;
    }
}
