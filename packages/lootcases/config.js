"use strict";

const BASE_RARITIES = [
    { id: "common", name: "Обычный", chance: 55, color: "#8F9AAD" },
    { id: "uncommon", name: "Необычный", chance: 25, color: "#42B983" },
    { id: "rare", name: "Редкий", chance: 12, color: "#2D8CFF" },
    { id: "epic", name: "Эпический", chance: 6, color: "#9C27B0" },
    { id: "legendary", name: "Легендарный", chance: 2, color: "#FFC400" },
];

module.exports = {
    currency: "donate",
    rateLimit: {
        windowMs: 1000,
        maxOpens: 5,
    },
    cases: [
        {
            id: "budget",
            name: "Бюджет",
            priceDon: 50,
            icon: "img/playerMenu/cases/budget.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((r, i) => ({ ...r, chance: [65, 22, 9, 3, 1][i] })),
            pity: { threshold: 10, minRarity: "epic" },
            pool: [
                { type: "money", rarity: "common", weight: 40, amount: { min: 2500, max: 4000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "money", rarity: "uncommon", weight: 30, amount: { min: 4000, max: 6500 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "rare", weight: 14, amount: { min: 10, max: 20 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" }
            ],
        },
        {
            id: "standard",
            name: "Стандарт",
            priceDon: 120,
            icon: "img/playerMenu/cases/standard.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((r, i) => ({ ...r, chance: [55, 26, 12, 5, 2][i] })),
            pity: { threshold: 9, minRarity: "epic" },
            pool: [
                { type: "money", rarity: "common", weight: 30, amount: { min: 5000, max: 8000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "uncommon", weight: 22, amount: { min: 20, max: 30 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "money", rarity: "rare", weight: 14, amount: { min: 9000, max: 14000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" }
            ],
        },
        {
            id: "gold",
            name: "Золото",
            priceDon: 220,
            icon: "img/playerMenu/cases/gold_custom.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((r, i) => ({ ...r, chance: [45, 28, 15, 8, 4][i] })),
            pity: { threshold: 8, minRarity: "epic" },
            pool: [
                { type: "money", rarity: "common", weight: 22, amount: { min: 10000, max: 15000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "uncommon", weight: 16, amount: { min: 35, max: 50 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "donate", rarity: "epic", weight: 9, amount: { min: 70, max: 95 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" }
            ],
        },
    ],
};
