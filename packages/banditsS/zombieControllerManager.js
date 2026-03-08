const { ZOMBIE_STATE, setZombieState } = require('./zombie.state');

function createControllerManager(deps) {
    const {
        zlog,
        chooseController,
        setTaskIdle,
        restoreTask,
        getZone,
        timers,
    } = deps;

    function beginSwitch(st, reason = 'unknown') {
        if (!st || st.dead) return false;
        if (!mp.peds.exists(st.ped)) return false;

        const zone = getZone(st.zoneId);
        if (!zone) return false;

        if (st.switching && Date.now() - (st.switchStartAt || 0) < (timers.switchCooldownMs || 200)) {
            return false;
        }

        const nextController = chooseController(zone, st.ped, null);
        if (!nextController) {
            st.switching = false;
            st.controllerRid = null;
            setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, `switch-no-controller ${reason}`);
            setTaskIdle(st, 'switch-no-controller');
            return false;
        }

        const now = Date.now();
        const sameController = st.controllerRid === nextController.id;
        const recentlySwitched = now - (st.lastControllerSwitchAt || 0) < (timers.switchCooldownMs || 200);
        if (sameController && recentlySwitched) {
            return false;
        }

        st.switching = true;
        st.switchStartAt = now;
        st.switchReason = reason;
        st.switchAttempts = (st.switchAttempts || 0) + 1;

        setZombieState(st, ZOMBIE_STATE.SWITCH_CONTROLLER, zlog, reason);

        try {
            st.ped.controller = undefined;
            st.ped.setVariable('controllerRid', -1);
            st.ped.setVariable('ctrlState', 'switching');
            st.ped.setVariable('command', 'idle');
            st.ped.setVariable('commandExtra', { reason: 'switching' });
        } catch {}

        try {
            const prevCtrl = st.ped.controller;
            if (prevCtrl && mp.players.exists(prevCtrl)) {
                prevCtrl.call('z:executeCommand', [st.zid, 'idle', JSON.stringify({ reason: 'switching' })]);
            }
        } catch {}

        const ver = (st.ctrlVer || 0) + 1;
        st.ctrlVer = ver;
        st.ped.setVariable('ctrlVer', ver);
        st.ped.dimension = nextController.dimension;
        st.ped.controller = nextController;
        st.ped.setVariable('controllerRid', nextController.id);

        st.controllerRid = nextController.id;
        st.lastControllerSwitchAt = now;
        st.lastHeartbeatAt = 0;

        const sendAssign = () => {
            try {
                nextController.call('z:assignController', [st.zid, ver]);
            } catch {}
            zlog(`switch start zid=${st.zid} -> controller=${nextController.id} ver=${ver} reason=${reason}`);
        };

        const jitter = Number(st.switchAssignDelayMs || 0);
        if (jitter > 0) setTimeout(sendAssign, jitter); else sendAssign();
        return true;
    }

    function onControllerAck(st, playerId, ver) {
        if (!st || st.dead) return false;
        if (!st.switching) return true;
        if (st.controllerRid !== playerId) return false;
        if ((st.ctrlVer || 0) !== ver) return false;

        st.switching = false;
        st.switchReason = null;
        st.switchAttempts = 0;
        st.lastHeartbeatAt = Date.now();
        try {
            st.ped.setVariable('ctrlState', 'ready');
        } catch {}

        const restored = restoreTask(st);
        zlog(`switch done zid=${st.zid} controller=${playerId} restored=${restored}`);
        return true;
    }

    function checkTimeout(st) {
        if (!st || !st.switching) return;
        const timeoutMs = timers.switchAckTimeoutMs || 2000;
        if (Date.now() - (st.switchStartAt || 0) < timeoutMs) return;

        zlog(`switch timeout zid=${st.zid} reason=${st.switchReason || 'unknown'}`);
        if ((st.switchAttempts || 0) >= (timers.maxSwitchAttempts || 2)) {
            st.switching = false;
            st.controllerRid = null;
            setZombieState(st, ZOMBIE_STATE.SLEEP, zlog, 'switch-timeout-sleep');
            setTaskIdle(st, 'switch-timeout');
            return;
        }

        beginSwitch(st, 'switch-timeout-retry');
    }

    return {
        beginSwitch,
        onControllerAck,
        checkTimeout,
    };
}

module.exports = {
    createControllerManager,
};
