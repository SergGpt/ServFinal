import marketPlaceConfig from "../configs/settings";

export const countMoneyToDollar = (amount, showCents = false, convertFromCents = false) => {
    if (!amount) {
        return showCents ? "$0.00" : "$0";
    }

    amount = convertFromCents ? amount / 100 : amount;
    const formattedAmount = new Intl.NumberFormat("en-EN", {
        style: "currency",
        currency: "USD"
    }).format(amount);

    let result = showCents ? formattedAmount : `${formattedAmount.substring(0, formattedAmount.length - 3)}`;
    return result.replace(/,/g, " ").replace(/\./g, ",");
}

export const convertMoney = (amount, threshold = 0, showCents = true) => {
    let formattedAmount = 0;
    const absoluteAmount = Math.abs(amount); 

    if (absoluteAmount < threshold) {
        return showCents ? countMoneyToDollar(absoluteAmount, true, false) : absoluteAmount;
    }

    if (absoluteAmount >= 1e3 && absoluteAmount < 1e4) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e3, true, false).slice(0, 4)}K`;
    } else if (absoluteAmount >= 1e4 && absoluteAmount < 1e5) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e3, true, false).slice(0, 5)}K`;
    } else if (absoluteAmount >= 1e5 && absoluteAmount < 1e6) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e3, true, false).slice(0, 6)}K`;
    } else if (absoluteAmount >= 1e6 && absoluteAmount < 1e7) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e6, true, false).slice(0, 4)}M`;
    } else if (absoluteAmount >= 1e7 && absoluteAmount < 1e8) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e6, true, false).slice(0, 5)}M`;
    } else if (absoluteAmount >= 1e8 && absoluteAmount < 1e9) {
        formattedAmount = `${countMoneyToDollar(absoluteAmount / 1e6, true, false).slice(0, 4)}M`;
    } else if (absoluteAmount >= 1e9 && absoluteAmount < 1e10) {
        formattedAmount = `$${parseFloat((absoluteAmount / 1e9).toString().slice(0, 5))}B`;
    } else if (absoluteAmount >= 1e10 && absoluteAmount < 1e11) {
        formattedAmount = `$${parseFloat((absoluteAmount / 1e9).toString().slice(0, 6))}B`;
    } else {
        formattedAmount = countMoneyToDollar(absoluteAmount, true, false);
    }

    return amount < 0 ? `-${formattedAmount}` : formattedAmount;
}

export const convertMoneyFloatToInteger = (amount) => {
    return convertMoney(amount).replace(/(\d+),(\d+)(\D+)/, "$1$3")
};

export const formatThousands = (amount) => {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export const getPrice = (type, quantity, cost, hours) => {
    if (type != "item" && type != "clothes")
        return Math.round((hours * cost * marketPlaceConfig.servicePercent) / (type == "service" ? 1 : 100))

    const pricePerItem = Number(cost);
    let bodyCost = (1 + 0.25 * (quantity - 1)) * pricePerItem;

    if (bodyCost < marketPlaceConfig.priceLowLimit) {
        bodyCost = marketPlaceConfig.priceLowLimit;
    } else if (bodyCost > marketPlaceConfig.priceHighLimit) {
        bodyCost = marketPlaceConfig.priceHighLimit + 0.2 * (bodyCost - marketPlaceConfig.priceHighLimit);
    }

    return Math.round(bodyCost * marketPlaceConfig.marketPercent * hours);
};