"use strict";

const utils = call('utils');

const PRICE_PER_KILOMETER = 100;
const RENT_PRICE = 500;
const RESPAWN_TIMEOUT = 60 * 1000;
const TAXI_STATIONS = [
    { x: 895.05, y: -179.25, z: 74.7 },
];

const orders = [];
let nextOrderId = 1;

function getDistanceInMeters(a, b) {
    if (!a || !b) return 0;
    return Math.sqrt(utils.vdistSqr(a, b));
}

module.exports = {
    init() {
        TAXI_STATIONS.forEach(pos => {
            const shape = mp.colshapes.newSphere(pos.x, pos.y, pos.z, 2);
            shape.isTaxiStation = true;
        });
    },
    getPricePerKilometer() {
        return PRICE_PER_KILOMETER;
    },
    getRentPrice() {
        return RENT_PRICE;
    },
    getRespawnTimeout() {
        return RESPAWN_TIMEOUT;
    },
    addOrder(clientId, position) {
        const order = {
            orderId: nextOrderId++,
            clientId,
            position: {
                x: position.x,
                y: position.y,
                z: position.z,
            },
        };
        orders.push(order);
        mp.players.forEach(player => {
            if (!player.character || player.character.job !== 2) return;
            player.call('taxi.driver.orders.add', [order]);
        });
        return order;
    },
    getOrders() {
        return orders.slice();
    },
    getOrderById(orderId) {
        return orders.find(x => x.orderId == orderId);
    },
    deleteOrder(orderId) {
        const index = orders.findIndex(x => x.orderId == orderId);
        if (index === -1) return false;
        orders.splice(index, 1);
        mp.players.forEach(player => {
            if (!player.character || player.character.job !== 2) return;
            player.call('taxi.driver.orders.delete', [orderId]);
        });
        return true;
    },
    deletePlayerOrders(player) {
        if (!player) return;
        const deletedIds = [];
        for (let i = orders.length - 1; i >= 0; i--) {
            if (orders[i].clientId == player.id) {
                deletedIds.push(orders[i].orderId);
                orders.splice(i, 1);
            }
        }
        if (!deletedIds.length) return;
        mp.players.forEach(current => {
            if (!current.character || current.character.job !== 2) return;
            deletedIds.forEach(id => current.call('taxi.driver.orders.delete', [id]));
        });
    },
    doesClientHaveOrders(clientId) {
        return orders.some(x => x.clientId == clientId);
    },
    calculatePrice(player, destination) {
        const distance = getDistanceInMeters(player.position, destination);
        let price = Math.round((distance / 1000) * PRICE_PER_KILOMETER);
        if (price < PRICE_PER_KILOMETER) price = PRICE_PER_KILOMETER;
        return price;
    },
    calculateComission(player) {
        const jobs = call('jobs');
        let exp = 0;
        if (jobs && typeof jobs.getJobSkill === 'function') {
            const skill = jobs.getJobSkill(player, 2);
            if (skill) exp = skill.exp || 0;
        }
        if (exp >= 100) return 0.1;
        if (exp >= 50) return 0.15;
        if (exp >= 25) return 0.2;
        return 0.25;
    },
};
