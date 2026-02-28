-- Seed script for cargo delivery rental mules.
-- Run this once in your MySQL database.
-- NOTE: table name is expected to be `Vehicles` (Sequelize default for model Vehicle).

-- Ensure vehicle properties for Mule exist (prevents undefined vehicle.properties errors)
INSERT INTO `VehicleProperties` (`model`, `name`, `vehType`, `price`, `maxFuel`, `consumption`, `license`, `isElectric`, `trunkType`)
VALUES ('mule', 'Mule', 1, 48000, 120, 3, 2, 0, 3)
ON DUPLICATE KEY UPDATE
`name` = VALUES(`name`),
`vehType` = VALUES(`vehType`),
`maxFuel` = VALUES(`maxFuel`),
`consumption` = VALUES(`consumption`),
`license` = VALUES(`license`),
`isElectric` = VALUES(`isElectric`),
`trunkType` = VALUES(`trunkType`);

INSERT INTO `Vehicles`
(`key`, `owner`, `modelName`, `plate`, `regDate`, `owners`, `color1`, `color2`, `x`, `y`, `z`, `h`, `fuel`, `health`, `destroys`, `engineState`, `steeringState`, `fuelState`, `brakeState`, `dimension`, `mileage`, `parkingId`, `parkingDate`)
VALUES
('job', 13, 'mule', 'CRG001', NOW(), 1, 111, 111, 133.58, -3244.29, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL),
('job', 13, 'mule', 'CRG002', NOW(), 1, 111, 111, 133.64, -3250.66, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL),
('job', 13, 'mule', 'CRG003', NOW(), 1, 111, 111, 133.72, -3257.03, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL),
('job', 13, 'mule', 'CRG004', NOW(), 1, 111, 111, 140.45, -3244.29, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL),
('job', 13, 'mule', 'CRG005', NOW(), 1, 111, 111, 140.52, -3250.66, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL),
('job', 13, 'mule', 'CRG006', NOW(), 1, 111, 111, 140.60, -3257.03, 5.86, 270.00, 70, 1000, 0, 0, 0, 0, 0, 0, 0, 1, NULL);
