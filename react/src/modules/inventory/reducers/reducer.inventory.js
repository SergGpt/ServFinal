const createQuickSlot = (key, item = null) => ({
    key,
    item,
});

const createInventorySlot = (id, item = null) => ({
    id,
    item,
});

const createEquipmentSlot = (id, label, item = null) => ({
    id,
    label,
    item,
});

const createSection = (id, title, slots = [], description = '') => ({
    id,
    title,
    slots,
    description,
});

const initialState = {
    weight: {
        current: 15.7,
        max: 40,
    },
    quickSlots: [
        createQuickSlot(1, { name: 'Нож', weight: 0.48, icon: '🗡', sizeX: 1, sizeY: 1 }),
        createQuickSlot(2, { name: 'Смартфон', weight: 0.18, icon: '📱', sizeX: 1, sizeY: 1 }),
        createQuickSlot(3),
        createQuickSlot(4, { name: 'Аптечка', weight: 1.2, icon: '✚', sizeX: 2, sizeY: 1 }),
        createQuickSlot(5),
        createQuickSlot(6),
        createQuickSlot(7),
        createQuickSlot(8),
        createQuickSlot(9),
    ],
    inventorySlots: [],
    sections: [
        createSection(
            'vest',
            'Разгрузка',
            [
                createInventorySlot('vest-1', { name: 'Бинт', weight: 0.1, icon: '🩹', sizeX: 1, sizeY: 1, description: 'Стерильный бинт для остановки кровотечения.' }),
                createInventorySlot('vest-2', { name: 'Патроны 5.45', weight: 0.34, initials: '5.45', sizeX: 2, sizeY: 1, description: 'Магазин с боеприпасами для штурмовой винтовки.' }),
                ...Array.from({ length: 14 }).map((_, index) => createInventorySlot(`vest-empty-${index + 1}`)),
            ],
            'Компактный контейнер быстрого доступа'
        ),
        createSection(
            'shirt',
            'Футболка',
            [
                createInventorySlot('shirt-1', { name: 'Ключ-карта', weight: 0.02, initials: 'KC', sizeX: 1, sizeY: 1, description: 'Ключ доступа к закрытым зонам объекта.' }),
                ...Array.from({ length: 11 }).map((_, index) => createInventorySlot(`shirt-empty-${index + 1}`)),
            ],
            'Легкая одежда с небольшим количеством карманов'
        ),
        createSection(
            'pants',
            'Брюки',
            [
                createInventorySlot('pants-1', { name: 'Фонарик', weight: 0.32, icon: '🔦', sizeX: 1, sizeY: 2, description: 'Тактический фонарик со средним зарядом.' }),
                createInventorySlot('pants-2', { name: 'Консервы', weight: 0.8, icon: '🥫', sizeX: 2, sizeY: 2, description: 'Запас пищи на короткий рейд.' }),
                ...Array.from({ length: 15 }).map((_, index) => createInventorySlot(`pants-empty-${index + 1}`)),
            ],
            'Средний объем хранения и быстрый доступ'
        ),
        createSection(
            'backpack',
            'Рюкзак',
            [
                createInventorySlot('bag-1', { name: 'Рация', weight: 0.41, initials: 'RF', sizeX: 2, sizeY: 1, description: 'Двухканальная рация для командной связи.' }),
                createInventorySlot('bag-2', { name: 'Бутылка воды', weight: 1.1, icon: '💧', sizeX: 1, sizeY: 2, description: 'Питьевая вода, частично заполнена.' }),
                ...Array.from({ length: 22 }).map((_, index) => createInventorySlot(`bag-empty-${index + 1}`)),
            ],
            'Основной контейнер с увеличенной вместимостью'
        ),
    ],
    equipment: {
        leftColumn: [
            createEquipmentSlot('head', 'Голова'),
            createEquipmentSlot('glasses', 'Лицо'),
            createEquipmentSlot('ears', 'Уши'),
            createEquipmentSlot('gloves', 'Руки'),
        ],
        rightColumn: [
            createEquipmentSlot('mask', 'Шея'),
            createEquipmentSlot('torso', 'Броня', { name: 'Легкий бронежилет' }),
            createEquipmentSlot('legs', 'Ноги', { name: 'Тактические штаны' }),
            createEquipmentSlot('shoes', 'Спина', { name: 'Штурмовой рюкзак' }),
        ],
        bottomRow: [],
        hands: [
            createEquipmentSlot('leftHand', 'Левая рука'),
            createEquipmentSlot('rightHand', 'Правая рука', { name: 'АК-12' }),
        ],
        stats: [
            { id: 'health', label: 'Здоровье', value: '82%' },
            { id: 'hydration', label: 'Гидратация', value: '61%' },
            { id: 'energy', label: 'Энергия', value: '47%' },
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
