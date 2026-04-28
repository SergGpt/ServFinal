// ищем
export const serverDateTime = writable(new Date().getTime());
// добавляем после
export const serverTime = writable(new Date());

setInterval(() => {
    var date = new Date(localDateTime);
    date.setSeconds(new Date().getSeconds());

    serverTime.set(date);
}, 1000);