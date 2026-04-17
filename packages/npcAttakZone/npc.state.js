const NPCAZ_STATE = {
    IDLE: 'idle',
    FOLLOW: 'follow',
    HOLD: 'hold',
    SWITCH_CONTROLLER: 'switch_controller',
    DEAD: 'dead',
};

function setNpcState(st, nextState, logger, reason = '') {
    if (!st || !nextState) return;
    if (st.state === nextState) return;
    const prev = st.state || 'unknown';
    st.state = nextState;

    if (typeof logger === 'function') {
        logger(`state nid=${st.nid} ${prev} -> ${nextState}${reason ? ` (${reason})` : ''}`);
    }

    try {
        if (st.ped && mp.peds.exists(st.ped)) {
            st.ped.setVariable('npcazState', nextState);
        }
    } catch (e) {}
}

module.exports = {
    NPCAZ_STATE,
    setNpcState,
};
