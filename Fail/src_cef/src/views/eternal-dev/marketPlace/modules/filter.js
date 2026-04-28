import { ItemId, itemsInfo, ItemType } from "../../../../json/itemsInfo";

export const filterItems = (items, filterType, selectedFilter) => {
    if (selectedFilter == null)
        return items;

    const array = [...items];
    switch(filterType) {
        case "sort": {
            switch(selectedFilter) {
                case "priceUp":
                    return array.sort(((a, b) => Number(a.hasOwnProperty("currentBet") ? a.currentBet : a.cost) - Number(b.hasOwnProperty("currentBet") ? b.currentBet : b.cost)));
                case "priceDown":
                    return array.sort(((a, b) => Number(b.hasOwnProperty("currentBet") ? b.currentBet : b.cost) - Number(a.hasOwnProperty("currentBet") ? a.currentBet : a.cost)));
                case "popular":
                    return array.sort(((a, b) => Number(b.views) - Number(a.views)));
                case "startDate":
                    return array.sort(((a, b) => new Date(a.date) - new Date(b.date)));
                case "endDate":
                    return array.sort(((a, b) => new Date(a.endDate) - new Date(b.endDate)));
            }
        }
        case "categories": {
            return array.filter(x => x.type == selectedFilter);
        }
        case "businesses": {
            let types = [];
            switch(selectedFilter) {
                case "gun-shop": types = [6]; break;
                case "auto-shop": types = [2, 3, 4, 5, 15]; break;
                case "barber-shop": types = [10]; break;
                case "carwash": types = [13]; break;
                case "clothes-shop": types = [7]; break;
                case "tuning": types = [12]; break;
                case "gas-station": types = [1]; break;
                case "item-shop": types = [0, 8]; break;
                case "tattoo-shop": types = [9]; break;
            }

            return array.filter(x => types.includes(x.params.type));
        }
        case "houses": {
            return array.filter(x => x.params.type == selectedFilter);
        }
        case "clothes": {
            return array.filter(x => x.params.itemId == ItemId[selectedFilter]);
        }
        case "clothes_sub": {
            return array.filter(x => x.params.gender == (selectedFilter == "Male" ? "True" : "False"));
        }
        case "item": {
            if (ItemType.hasOwnProperty(selectedFilter))
                return array.filter(x => itemsInfo[x.params.itemId].functionType == ItemType[selectedFilter]);
        }
    }

    return array;
};

// "gun-shop": { label: "Оруженый магазин" },
//     "auto-shop": { label: "Автосалон" },
//     "barber-shop": { label: "Барбершоп" },
//     "carwash": { label: "Автомойка" },
//     "clothes-shop": { label: "Магазин одежды" },
//     "tuning": { label: "Тюнинг салон" },
//     "gas-station": { label: "АЗС" }, 
//     "item-shop": { label: "Магазин 24/7" }, 
//     "tattoo-shop": { label: "Тату салон" }, 