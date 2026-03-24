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
            id: "bronze",
            name: "Bronze Case",
            priceDon: 50,
            icon: "img/playerMenu/cases/bronze.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((rarity, index) => ({
                ...rarity,
                chance: [65, 22, 9, 3, 1][index],
            })),
            pity: {
                threshold: 10,
                minRarity: "epic",
            },
            duplicatesPolicy: {
                type: "donateRefund",
                percentageByRarity: {
                    rare: 10,
                    epic: 20,
                    legendary: 40,
                },
            },
            pool: [
                { type: "money", rarity: "common", weight: 40, amount: { min: 2500, max: 4000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "money", rarity: "uncommon", weight: 30, amount: { min: 4000, max: 6000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "money", rarity: "rare", weight: 15, amount: { min: 6000, max: 9000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "rare", weight: 8, amount: { min: 75, max: 120 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "epic", weight: 5, amount: { min: 20, max: 30 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "money", rarity: "epic", weight: 4, amount: { min: 12000, max: 16000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "legendary", weight: 2, amount: { min: 35, max: 50 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
            ],
        },
        {
            id: "silver",
            name: "Silver Case",
            priceDon: 120,
            icon: "img/playerMenu/cases/silver.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((rarity, index) => ({
                ...rarity,
                chance: [55, 26, 12, 5, 2][index],
            })),
            pity: {
                threshold: 9,
                minRarity: "epic",
            },
            duplicatesPolicy: {
                type: "donateRefund",
                percentageByRarity: {
                    rare: 12,
                    epic: 25,
                    legendary: 45,
                },
            },
            pool: [
                { type: "money", rarity: "common", weight: 30, amount: { min: 5000, max: 7000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "uncommon", weight: 22, amount: { min: 120, max: 200 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "money", rarity: "uncommon", weight: 18, amount: { min: 7500, max: 9500 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "money", rarity: "rare", weight: 14, amount: { min: 12000, max: 16000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "rare", weight: 10, amount: { min: 25, max: 35 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "donate", rarity: "epic", weight: 6, amount: { min: 45, max: 60 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "chips", rarity: "epic", weight: 4, amount: { min: 250, max: 400 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "legendary", weight: 2, amount: { min: 80, max: 100 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
            ],
        },
        {
            id: "gold",
            name: "Gold Case",
            priceDon: 220,
            icon: "img/playerMenu/cases/gold.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((rarity, index) => ({
                ...rarity,
                chance: [45, 28, 15, 8, 4][index],
            })),
            pity: {
                threshold: 8,
                minRarity: "epic",
            },
            duplicatesPolicy: {
                type: "donateRefund",
                percentageByRarity: {
                    rare: 15,
                    epic: 30,
                    legendary: 50,
                },
            },
            pool: [
                { type: "money", rarity: "common", weight: 22, amount: { min: 9000, max: 13000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "uncommon", weight: 20, amount: { min: 250, max: 400 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "uncommon", weight: 16, amount: { min: 35, max: 45 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "money", rarity: "rare", weight: 14, amount: { min: 16000, max: 22000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "rare", weight: 10, amount: { min: 450, max: 600 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "epic", weight: 9, amount: { min: 70, max: 90 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "donate", rarity: "legendary", weight: 5, amount: { min: 110, max: 140 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
            ],
        },
        {
            id: "platinum",
            name: "Platinum Case",
            priceDon: 360,
            icon: "img/playerMenu/cases/platinum.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((rarity, index) => ({
                ...rarity,
                chance: [35, 28, 18, 12, 7][index],
            })),
            pity: {
                threshold: 7,
                minRarity: "epic",
            },
            duplicatesPolicy: {
                type: "donateRefund",
                percentageByRarity: {
                    rare: 18,
                    epic: 35,
                    legendary: 55,
                },
            },
            pool: [
                { type: "money", rarity: "common", weight: 18, amount: { min: 14000, max: 20000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "uncommon", weight: 18, amount: { min: 500, max: 750 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "uncommon", weight: 16, amount: { min: 55, max: 70 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "money", rarity: "rare", weight: 12, amount: { min: 22000, max: 32000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "rare", weight: 11, amount: { min: 85, max: 110 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "chips", rarity: "epic", weight: 8, amount: { min: 900, max: 1200 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "epic", weight: 9, amount: { min: 120, max: 150 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "donate", rarity: "legendary", weight: 8, amount: { min: 170, max: 210 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
            ],
        },
        {
            id: "diamond",
            name: "Diamond Case",
            priceDon: 520,
            icon: "img/playerMenu/cases/diamond.svg",
            multiOpenMax: 10,
            rarities: BASE_RARITIES.map((rarity, index) => ({
                ...rarity,
                chance: [25, 25, 20, 18, 12][index],
            })),
            pity: {
                threshold: 6,
                minRarity: "epic",
            },
            duplicatesPolicy: {
                type: "donateRefund",
                percentageByRarity: {
                    rare: 20,
                    epic: 40,
                    legendary: 60,
                },
            },
            pool: [
                { type: "money", rarity: "common", weight: 12, amount: { min: 20000, max: 30000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "chips", rarity: "uncommon", weight: 14, amount: { min: 800, max: 1200 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "uncommon", weight: 12, amount: { min: 70, max: 100 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "money", rarity: "rare", weight: 12, amount: { min: 32000, max: 45000 }, name: "Наличными $", icon: "img/playerMenu/cases/rewards/cash.svg" },
                { type: "donate", rarity: "rare", weight: 12, amount: { min: 120, max: 160 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "chips", rarity: "epic", weight: 12, amount: { min: 1300, max: 1800 }, name: "Фишки казино", icon: "img/playerMenu/cases/rewards/chips.svg" },
                { type: "donate", rarity: "epic", weight: 10, amount: { min: 180, max: 230 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
                { type: "donate", rarity: "legendary", weight: 8, amount: { min: 260, max: 320 }, name: "Донат-валюта", icon: "img/playerMenu/coins.svg" },
            ],
        },
    ],
};
