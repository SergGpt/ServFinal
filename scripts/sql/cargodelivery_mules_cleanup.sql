-- Rollback script for cargo delivery rental mules.
-- Removes vehicles added by cargodelivery_mules_seed.sql

DELETE FROM `Vehicles`
WHERE `key` = 'job'
  AND `owner` = 13
  AND `modelName` = 'mule'
  AND `plate` IN ('CRG001', 'CRG002', 'CRG003', 'CRG004', 'CRG005', 'CRG006');
