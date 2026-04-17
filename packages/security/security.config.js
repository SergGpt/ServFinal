const SECURITY_CONFIG = {
    debug: false,
    defaultRadius: 100,
    stage1Preset: {
        guardCount: 3,
        chiefCount: 1,
    },
    models: {
        guard: ['s_m_m_security_01', 's_m_y_blackops_01'],
        chief: ['s_m_m_highsec_01'],
    },
    weapons: {
        guard: 'WEAPON_CARBINERIFLE',
        chief: 'WEAPON_PISTOL',
    },
    npcHealth: 200,
};

module.exports = { SECURITY_CONFIG };
