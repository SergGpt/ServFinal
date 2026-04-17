const { SECURITY_STATE, setSecurityState } = require('./security.state');

function createSecurityControllerManager(deps) {
    const { chooseController, getZone, logger, timers, restoreTask } = deps;

    function beginSwitch(st, reason = 'unknown') {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return false;
        const zone = getZone(st.zoneId);
        if (!zone) return false;

        const now = Date.now();
        if (st.switching && now - (st.switchStartAt || 0) < (timers.switchCooldownMs || 800)) {
            return false;
        }

        const next = chooseController(zone, st.ped, st.targetRid);
        if (!next) {
            st.controllerRid = null;
            st.switching = false;
            setSecurityState(st, SECURITY_STATE.IDLE, logger, `${reason}: no-controller`);
            return false;
        }

        st.switching = true;
        st.switchStartAt = now;
        st.ctrlVer = (st.ctrlVer || 0) + 1;
        st.controllerRid = next.id;

        try {
            st.ped.controller = next;
            st.ped.setVariable('controllerRid', next.id);
            st.ped.setVariable('ctrlVer', st.ctrlVer);
            st.ped.setVariable('secCtrlState', 'switching');
        } catch {}

        try {
            next.call('sec:assignController', [st.nid, st.ctrlVer]);
        } catch {}

        setSecurityState(st, SECURITY_STATE.SWITCH_CONTROLLER, logger, reason);
        logger(`switch start nid=${st.nid} controller=${next.id} ver=${st.ctrlVer} reason=${reason}`);
        return true;
    }

    function onControllerAck(st, playerId, ver) {
        if (!st) return false;
        if (st.controllerRid !== playerId) return false;
        if ((st.ctrlVer || 0) !== ver) return false;

        st.switching = false;
        st.lastHeartbeatAt = Date.now();
        try { st.ped.setVariable('secCtrlState', 'ready'); } catch {}
        restoreTask(st);
        logger(`switch done nid=${st.nid} controller=${playerId} ver=${ver}`);
        return true;
    }

    function onHeartbeat(st, playerId) {
        if (!st) return false;
        if (st.controllerRid !== playerId) return false;
        st.lastHeartbeatAt = Date.now();
        return true;
    }

    function checkTimeout(st) {
        if (!st) return;
        const now = Date.now();

        if (st.switching && now - (st.switchStartAt || 0) >= (timers.controllerTimeoutMs || 5000)) {
            logger(`switch timeout nid=${st.nid}`);
            beginSwitch(st, 'switch-timeout');
            return;
        }

        if (!st.switching && st.controllerRid !== null && now - (st.lastHeartbeatAt || 0) >= (timers.controllerTimeoutMs || 5000)) {
            logger(`heartbeat timeout nid=${st.nid}`);
            beginSwitch(st, 'heartbeat-timeout');
        }
    }

    return {
        beginSwitch,
        onControllerAck,
        onHeartbeat,
        checkTimeout,
    };
}

module.exports = { createSecurityControllerManager };
