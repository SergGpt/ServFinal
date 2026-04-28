import { ItemId } from "../../../../json/itemsInfo";

export const getPicture = (type, data) => {
    switch(type) {
        case "vehicle":
            return `https://cdn.majestic-files.com/img/vehicles/${data.params.model.toLowerCase()}.png`;
        case "business":
            return "https://cdn.majestic-files.com/img/playermenu/property/item_shops/2.jpg";
        case "house":
            return "https://cdn.majestic-files.com/img/property/houses/exteriors/1554.jpg";
        case "item":
            return `${document.cloud}inventoryItems/items/${data.params.itemId}.png`;
        case "clothes":
            let pngDirectory = "inventoryItems/clothes";
            
            let dataParse;
            if (data.params.itemData.split("_").length) 
                dataParse = data.params.itemData.split("_");
    
            
            let drawableId = 0;
            let textureId = 0;

            if (dataParse[0] != undefined)
                drawableId = Number (dataParse[0]);

            if (dataParse[1] != undefined)
                textureId = Number (dataParse[1]);

            if (dataParse[2].toLowerCase() === "true") 
                pngDirectory += "/male"
            else 
                pngDirectory += "/female"
            
            switch (data.params.itemId) {
                case ItemId.Mask:
                    pngDirectory += "/masks"
                    break;
                case ItemId.Glasses:
                    pngDirectory += "/glasses"
                    break;                 
                case ItemId.Ears:
                    pngDirectory += "/ears"
                    break;
                case ItemId.Jewelry:
                    pngDirectory += "/accessories"
                    break;                   
                case ItemId.Bracelets:
                    pngDirectory += "/bracelets"
                    break;
                case ItemId.Hat:
                    pngDirectory += "/hats"
                    break;
                case ItemId.Leg:
                    pngDirectory += "/legs"
                    break;
                case ItemId.Feet:
                    pngDirectory += "/shoes"
                    break;  
                case ItemId.Top:
                    pngDirectory += "/tops"
                    break;
                case ItemId.Undershit:
                    pngDirectory += "/undershit"
                    break;
                case ItemId.Watches:
                    pngDirectory += "/watches"
                    break;                    
                case ItemId.Bag:
                    pngDirectory += "/bags"
                    break;
                case ItemId.Gloves:
                    pngDirectory += "/gloves"
                    break;
            }
            pngDirectory += `/${drawableId}_${textureId}`
            return document.cloud + pngDirectory + '.png';
    }

    return null;
}