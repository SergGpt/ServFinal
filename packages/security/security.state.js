const SECURITY_STATE = {
    IDLE: 'idle',
};

function setSecurityState(npcState, nextState) {
    if (!npcState || !nextState) return;
    npcState.state = nextState;

    try {
        if (npcState.ped && mp.peds.exists(npcState.ped)) {
            npcState.ped.setVariable('secState', nextState);
        }
    } catch {}
}

module.exports = {
    SECURITY_STATE,
    setSecurityState,
};
