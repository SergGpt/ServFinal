import { writable } from 'svelte/store';

let isMultiplayer = window.mp && window.mp.events;

if (window.marketPlace == null)
    window.marketPlace = {};

export const acutionLots = writable(isMultiplayer ? [] : [
    {
        type: "business",
        id: 73,

        currentBet: 200000, betStep: 100000,
        favourites: 2, views: 1430,
        endDate: Date.now() + 1800000, date: Date.now(),

        participants: 0,

        params: { name: "АЗС", id: 3, cost: 150000, area: "Рокфорд" },
    },
    {
        type: "vehicle",
        id: 76,

        currentBet: 200000, betStep: 100000,
        favourites: 2, views: 1430,
        endDate: Date.now() + 1e5, date: Date.now(),

        participants: 2,

       "params": {
            "id": 1,
            "model": "Comet2",
            "modelName": "Pfhister Comet",
            "numberPlate": "C532W",
            "cost": 450000,
            "motorShow": "Luxor Autoroom",
            "mileage": 0,
            "capacity": 15,
            "gas": "Regular",
            "tuning": {
                "engine": 0,
                "brakes": 0,
                "transmission": 0,
                "turbo": 1
            }
        },
    },
    {
        type: "house",
        id: 75,

        currentBet: 400000, betStep: 100000,
        participants: 2,
        
        favourites: 2, views: 5030,

        endDate: Date.now() + 1e4, date: Date.now(),

        params: { "id": 67,
            "cost": 20000,
            "area": "Палето-Бэй",
            "garages": 1,
            "people": 4,
            "position": {
                "x": 31.168524,
                "y": 6596.7974,
                "z": 31.702238
            } 
        },
    }
]);

export const marketItems = writable(isMultiplayer ? [] : [
    {
        "cost": 1111,
        "favourites": 0,
        "views": 0,
        "endDate": 1732620643000,
        "createDate": 1732602643000,
        "author": {
            "id": 1,
            "name": "Ilya_Merumond",
            "phoneNumber": -1
        },
        "photos": [],
        "comment": "",
        "id": 1,
        "type": "item",
        "lotType": 4,
        "params": {
            "itemId": 7,
            "count": 1,
            "itemData": ""
        }
    },
    {
        "cost": 555555,
        "favourites": 0,
        "views": 0,
        "endDate": Date.now() + 10e7,
        "createDate": Date.now(),
        "author": {
            "id": 1,
            "name": "Ilya_Merumond",
            "phoneNumber": -1
        },
        "photos": [],
        "comment": "",
        "id": 3,
        "type": "vehicle",
        "lotType": 1,
        "params": {
            "id": 1,
            "model": "Comet2",
            "modelName": "Pfhister Comet",
            "numberPlate": "C532W",
            "cost": 450000,
            "motorShow": "Luxor Autoroom",
            "mileage": 0,
            "capacity": 15,
            "gas": "Regular",
            "tuning": {
                "engine": 0,
                "brakes": 0,
                "transmission": 0,
                "turbo": 1
            }
        }
    },
    {
        "cost": 5555555,
        "favourites": 0,
        "views": 0,
        "endDate": 1732631234000,
        "createDate": 1732613234000,
        "author": {
            "id": 1,
            "name": "Ilya_Merumond",
            "phoneNumber": -1
        },
        "photos": [],
        "comment": "",
        "id": 8,
        "type": "business",
        "lotType": 3,
        "params": {
            "id": 46,
            "name": "LS Customs",
            "cost": 7000000,
            "area": "Бертон",
            "type": 12,
            "position": {
                "x": -362.32394,
                "y": -132.51367,
                "z": 37.56013
            }
        }
    }
]);

export const marketInventoryItems = writable(isMultiplayer ? [] : [
    {
        id: 5,
        type: "item",
        minPrice: 10000,

        count: 15,

        params: {
            "itemId": 7,
            "count": 2,
            "itemData": ""
        }
    },
    {
        id: 5,
        type: "clothes",
        minPrice: 10000,

        count: 15,

        params: { 
            itemId: -11, 

            itemData: "11_0_True",
            
            drawable: 11,
            texture: 0,
            gender: "True",

            count: 1 
        },
    }
]);

export const marketStorage = writable(isMultiplayer ? [] : [
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    { "onEstate": false, "endDate": 1732590422986, "id": 1, "type": "item", "lotType": 4, "params": { "itemId": 7, "count": 2, "itemData": "" } },
    {
        "onEstate": false,
        "endDate": 1732590422986,
        "id": 2,
        "type": "clothes",
        "lotType": 6,
        "params": {
            itemId: -11, 

            itemData: "11_0_True",
            
            drawable: 11,
            texture: 0,
            gender: "True",

            count: 1 
        }
    },
    {
        "onEstate": true,
        "endDate": 1732590422987,
        "id": 0,
        "type": "vehicle",
        "lotType": 1,
        "params": {
            "id": 1,
            "model": "Comet2",
            "modelName": "Pfhister Comet",
            "numberPlate": "C532W",
            "cost": 450000,
            "motorShow": "Luxor Autoroom",
            "mileage": 0,
            "capacity": 15,
            "gas": "Regular",
            "tuning": {
                "engine": 0,
                "brakes": 0,
                "transmission": 0,
                "turbo": 1
            }
        }
    },
    {
        "onEstate": true,
        "endDate": 1732590422994,
        "id": 0,
        "type": "house",
        "lotType": 2,
        "params": {
            "id": 67,
            "cost": 20000,
            "area": "Палето-Бэй",
            "garages": 1,
            "people": 4,
            "position": {
                "x": 31.168524,
                "y": 6596.7974,
                "z": 31.702238
            }
        }
    }
]);

export const favourites = writable(isMultiplayer ? [] : [
    { id: 73, type: "auction" },
    { id: 3, type: "market" },
    { id: 7, type: "item", subData: "" },
    { id: -11, type: "clothes", subData: "11_0_True" },
]);

window.marketPlace.setItems = (type, items) => {
    switch(type) {
        case "main":
            marketItems.set(items);
            break;
        case "inventory":
            marketInventoryItems.set(items);
            break;
        case "storage":
            marketStorage.set(items);
            break;
        case "auction":
            acutionLots.set(items);
            break; 
        case "favourites":
            favourites.set(items);
            break;
    }
};

window.marketPlace.updateItem = (type, id, data) => {
    let store;

    switch(type) {
        case "main": store = marketItems; break;
        case "inventory": store = marketInventoryItems; break;
        case "auction": store = acutionLots; break;
    }

    store.update(items => {
        const updatedItems = [ ...items ];
        const item = updatedItems.find(x => x.id == id);

        if (item == null)
            return updatedItems;

        for (const key of Object.keys(data)) {
            const value = data[key];

            item[key] = value;
        }

        return updatedItems;
    });
};