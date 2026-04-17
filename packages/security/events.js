"use strict";

module.exports = {
    init: () => {
        require('./security.bootstrap');
        inited(__dirname);
    },
};
