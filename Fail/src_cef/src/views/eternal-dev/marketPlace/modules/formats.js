import { itemsInfo, ItemType } from "../../../../json/itemsInfo";
import { clothesName, clothes } from '@/views/player/menu/elements/inventory/functions.js';
import { ITEM_TYPES } from "../configs/sort";
import marketPlaceConfig from "../configs/settings";
import { favourites } from "store/marketPlace";

export const getType = (type) => {
    switch(type) {
        case "business": return "Бизнес";
        case "house": return "Недвижимость";
        case "vehicle": return "Транспорт";
        case "item": return "Предмет";
        case "clothes": return "Одежда";
        case "service": return "Услуги и прочее";
    }
};

export const calculatedColumnCount = () => {
    const e = window.innerHeight / 1080
        , t = window.innerWidth - 280 * e - 60 * e;
    return Math.floor(t / (306 * e))
};

export const calculateMinPrice = (data) => {
    switch(data.type) {
        case "service":
            return 1000;
        default: 
            return data.params && data.params.cost * marketPlaceConfig.minPriceMultiplier || 100;
    }
};

export const getName = (data) => {
    switch(data.type) {
        case "vehicle": return data.params.modelName;
        case "house": 
            return `Дом #${data.params.id}`;
        
        case "business": 
            return `${data.params.name} #${data.params.id}`
        
        case "clothes":
            const clothesTypeName = Object.entries(clothes).find(x => x[1].itemId == data.params.itemId)[0];
            const drawable = data.params.drawable;
            const gender = data.params.gender == "True" ? "M" : "F";

            if (clothesName [`${clothesTypeName}_${drawable}_${gender}`]) 
                return clothesName[`${clothesTypeName}_${drawable}_${gender}`];

            else if (clothesName [`${clothesTypeName}_${drawable}`]) 
                return clothesName [`${clothesTypeName}_${drawable}`];

            else 
                return `Комплект #${drawable}`

        case "item":
            return itemsInfo[data.params.itemId].Name
        
        case "service": return data.params.name;
    }

    return "name";
}

export const getSubname = (data) => {
    switch(data.type) {
        case "house":
        case "business":
            return data.params.area;
        case "vehicle":
            return data.params.motorShow;
        case "clothes":
            return itemsInfo[data.params.itemId].Name;
        case "item":
            return ITEM_TYPES[Object.entries(ItemType).find(x => x[1] == [itemsInfo[data.params.itemId].functionType])[0]].label;
        case "service":
            return "Услуги и прочее";
    }
}

export const getFavouriteData = (data) => {
    if (data == null)
        return null;

    const isGrouped = ["item", "clothes"].includes(data.type);
    return {
        type: data.hasOwnProperty("participants") ? "auction" : isGrouped ? data.type : "market",
        id: isGrouped ? data.params.itemId : data.id,
        subData: isGrouped ? data.params.itemData : ""
    }
}

let marketFavourites = [];
favourites.subscribe((data) => marketFavourites = data);

export const inFavourite = (data) => {
    const favouriteData = getFavouriteData(data);
    if (favouriteData == null)
        return false;

    const isGrouped = ["item", "clothes"].includes(favouriteData.type);
    return marketFavourites.find(x => x.type == favouriteData.type 
        && (isGrouped ? data.params.itemId : data.id) == x.id && (isGrouped ? x.subData == data.params.itemData : true)) != null;
}