const formatZero = (dight) => {
    if (dight > 9)
        return dight;

    return `0${dight}`;
}

export const calculateDateDifference = (time, currentTime, returnNonNegative = false) => {
    const start = currentTime;
    const end = new Date(time);

    const differenceInSeconds = Math.floor((end - start) / 1000);
    if (returnNonNegative) {
        return differenceInSeconds >= 0 ? Math.abs(differenceInSeconds) : 0;
    }

    return Math.abs(differenceInSeconds);
}

export const convertMilesecondsToString = (mileseconds) => {
    const date = new Date(mileseconds);
    
    let options = { day: '2-digit', month: 'long' };
    let formattedDate = date.toLocaleDateString('ru-RU', options);

    return `${formattedDate} ${formatZero(date.getHours())}:${formatZero(date.getMinutes())}`;
}

export const formatAuctionTime = (time) => {
    var date = new Date(time);
    return `${formatZero(date.getHours())}:${formatZero(date.getMinutes())}:${formatZero(date.getSeconds())}`;
}

export const convertSecondsToString = (totalSeconds, timezone = true) => {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const timeParts = [];

    if (days > 0) {
        timeParts.push(`${days} д.`);
    }

    if (hours > 0) {
        timeParts.push(`${hours} ч.`);
    }

    timeParts.push(`${minutes} м.`);
    timeParts.push(`${seconds} с.`);

    return timeParts.slice(0, 2).join(" ");
};