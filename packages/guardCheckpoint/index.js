"use strict";

const { GUARD_CHECKPOINT_CONFIG } = require("./config");
const { CheckpointGuardController } = require("./checkpointGuardController");

const controller = new CheckpointGuardController(GUARD_CHECKPOINT_CONFIG);

module.exports = {
    controller,
    shutdown: () => controller.shutdown(),
};
