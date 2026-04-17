"use strict";

const controller = require('./security.controller');

module.exports = {
    init() {
        if (controller && typeof controller.init === 'function') {
            return controller.init();
        }
        console.log('[SECURITY] module loaded (controller init is not implemented yet).');
    }
};
