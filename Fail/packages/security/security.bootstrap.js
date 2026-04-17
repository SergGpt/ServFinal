const { initSecurityController } = require('./security.controller');

initSecurityController().catch((error) => {
    console.error('[SECURITY] Failed to initialize security controller:', error);
});
