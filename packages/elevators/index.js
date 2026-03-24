const utils = call('utils');

const elevatorFloors = [
    { name: "Парковка", pos: new mp.Vector3(-664.33, 326.55, 78.12) },
    { name: "1 этаж", pos: new mp.Vector3(-664.36, 326.18, 83.08) },
    { name: "2 этаж", pos: new mp.Vector3(-664.36, 326.23, 88.01) },
    { name: "3 этаж", pos: new mp.Vector3(-664.36, 326.23, 92.72) },
    { name: "Крыша", pos: new mp.Vector3(-664.34, 326.46, 140.12) },
];

module.exports = {
    init() {
        this.createElevator();
    },

    createElevator() {
        elevatorFloors.forEach(floor => {
            const colshape = mp.colshapes.newSphere(floor.pos.x, floor.pos.y, floor.pos.z, 1.2);
            
            colshape.onEnter = (player) => {
                if (player.vehicle) return;

                // Отправляем игроку текущий этаж и список этажей
                const floorNames = elevatorFloors.map(f => f.name);
                player.call('elevators.inside', [floor.name, floorNames]);
                player.elevatorId = 1; // один лифт
            };

            colshape.onExit = (player) => {
                player.call('elevators.inside', [null]);
                player.elevatorId = null;
            };

            mp.markers.new(1, new mp.Vector3(floor.pos.x, floor.pos.y, floor.pos.z - 1), 1, {
                direction: new mp.Vector3(floor.pos.x, floor.pos.y, floor.pos.z),
                rotation: 0,
                color: [4, 100, 217, 100],
                visible: true,
                dimension: 0
            });

            mp.labels.new(`Нажмите ~g~E`, new mp.Vector3(floor.pos.x, floor.pos.y, floor.pos.z + 0.3), {
                los: false,
                font: 0,
                drawDistance: 10,
            });
        });
    },

    teleport(player, floorName) {
        const floor = elevatorFloors.find(f => f.name === floorName);
        if (!floor) return;
        utils.setPlayerPosition(player, floor.pos);
    }
};

// Обработка события от клиента
mp.events.add('elevator.teleport', (player, floorName) => {
    require('./elevator').teleport(player, floorName);
});
