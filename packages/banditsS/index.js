const { initZombieController } = require('./controller');

initZombieController().catch((error) => {
    console.error('[Z] Failed to initialize zombie controller:', error);
});
