const security = require('./index');

module.exports = {
    init: async () => {
        await security.initSecurityController();
        inited(__dirname);
    },
};
