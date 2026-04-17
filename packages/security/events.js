"use strict";

const security = require('./index');

module.exports = {
    init: async () => {
        await Promise.resolve(security.init());
        inited(__dirname);
    }
};
