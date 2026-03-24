// packages/drift/server/index.js

// 1) УКАЖИ ТУТ СПИСОК МОДЕЛЕЙ (как в GTA: "futo", "sultan", "elegy2" и т.д.)
const DRIFT_MODELS = [
  "futo",
  "ae86",
  "elegy2",
];

// 2) Делаем Set из hash-ей (надежно, потому что vehicle.model = hash)
const driftHashSet = new Set(DRIFT_MODELS.map((name) => mp.joaat(name.toLowerCase())));

function markVehicle(vehicle) {
  if (!vehicle) return;
  const isDrift = driftHashSet.has(vehicle.model);
  vehicle.setVariable("drift", isDrift); // shared для всех клиентов
}

// Когда создано новое авто
mp.events.add("vehicleCreated", (vehicle) => {
  markVehicle(vehicle);
});

// На случай: если какие-то авто уже есть на момент старта ресурса
mp.events.add("packagesLoaded", () => {
  mp.vehicles.forEach((v) => markVehicle(v));
});

// На всякий случай — при посадке тоже проверяем
mp.events.add("playerEnterVehicle", (player, vehicle) => {
  markVehicle(vehicle);
});

// (опционально) команда /driftmark — перемаркировать все машины (если поменял список и перезапускать не хочешь)
mp.events.addCommand("driftmark", (player) => {
  mp.vehicles.forEach((v) => markVehicle(v));
  player.outputChatBox("Все машины перемаркированы по drift-списку.");
});
