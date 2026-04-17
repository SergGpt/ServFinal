const SECURITY_STATE = {
    IDLE: 'idle',
    HOLDING: 'holding',
    APPROACH: 'approach',
    FRISK: 'frisk',
    SWITCH_CONTROLLER: 'switch_controller',
};

function setSecurityState(st, nextState, logger, reason = '') {
    if (!st || !nextState) return;
    if (st.state === nextState) return;
    const prev = st.state || 'unknown';
    st.state = nextState;
    if (typeof logger === 'function') {
        logger(`state nid=${st.nid} ${prev} -> ${nextState}${reason ? ` (${reason})` : ''}`);
    }
    try {
        if (st.ped && mp.peds.exists(st.ped)) {
            st.ped.setVariable('secState', nextState);
        }
    } catch {}
}

module.exports = {
    SECURITY_STATE,
    setSecurityState,
};
