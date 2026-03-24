const ZOMBIE_STATE = {
    SLEEP: 'sleep',
    IDLE: 'idle',
    CHASE: 'chase',
    ATTACK: 'attack',
    DEAD: 'dead',
    LOST_TARGET: 'lostTarget',
    SWITCH_CONTROLLER: 'switch_controller',
};

function setZombieState(st, nextState, zlog, reason = '') {
    if (!st || !nextState) return;
    if (st.state === nextState) return;
    const prev = st.state || 'unknown';
    st.state = nextState;
    if (typeof zlog === 'function') {
        zlog(`state zid=${st.zid} ${prev} -> ${nextState}${reason ? ` (${reason})` : ''}`);
    }

    try {
        if (st.ped && mp.peds.exists(st.ped)) {
            st.ped.setVariable('zState', nextState);
        }
    } catch {}
}

module.exports = {
    ZOMBIE_STATE,
    setZombieState,
};
