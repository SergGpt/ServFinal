const { NPCAZ_STATE, setNpcState } = require('./npc.state');

function createNpcControllerManager(deps) {
    const { chooseController, getZone, logger, timers, restoreTask } = deps;

    function markBadController(st, rid) {
        if (!st || rid === null || rid === undefined) return;
        st.lastBadControllerRid = rid;
        st.lastBadControllerAt = Date.now();
    }

    function clearBadController(st, rid) {
        if (!st) return;
        if (st.lastBadControllerRid === rid) {
            st.lastBadControllerRid = null;
            st.lastBadControllerAt = 0;
        }
    }

    function getBlockedControllerRid(st) {
        if (!st) return null;
        const rid = st.lastBadControllerRid;
        const at = st.lastBadControllerAt || 0;
        if (rid === null || rid === undefined) return null;

        const blockMs = 8000;
        if (Date.now() - at > blockMs) {
            st.lastBadControllerRid = null;
            st.lastBadControllerAt = 0;
            return null;
        }

        return rid;
    }

    function beginSwitch(st, reason = 'unknown') {
        if (!st || !st.ped || !mp.peds.exists(st.ped)) return false;

        const zone = getZone(st.zoneId);
        if (!zone) return false;

        const now = Date.now();
        const switchCooldown = timers && timers.switchCooldownMs ? timers.switchCooldownMs : 750;
        const timeout = timers && timers.controllerTimeoutMs ? timers.controllerTimeoutMs : 6000;

        if (st.switching && now - (st.switchStartAt || 0) < switchCooldown) return false;

        const prevControllerRid = st.controllerRid;
        const blockedControllerRid = getBlockedControllerRid(st);

        const nextController = chooseController(
            zone,
            st.ped,
            st.targetRid,
            st.livePos || null,
            blockedControllerRid
        );

        if (!nextController) {
            st.controllerRid = null;
            st.switching = false;

            try {
                st.ped.setVariable('npcazControllerRid', -1);
                st.ped.setVariable('npcazCtrlState', 'idle');
            } catch (e) {}

            setNpcState(st, NPCAZ_STATE.IDLE, logger, `${reason}: no-controller`);
            return false;
        }

        st.switching = true;
        st.switchStartAt = now;
        st.ctrlVer = (st.ctrlVer || 0) + 1;
        st.controllerRid = nextController.id;
        st.postAckGraceUntil = 0;

        try {
            st.ped.controller = nextController;
            st.ped.setVariable('npcazControllerRid', nextController.id);
            st.ped.setVariable('npcazCtrlVer', st.ctrlVer);
            st.ped.setVariable('npcazCtrlState', 'switching');
        } catch (e) {}

        try {
            nextController.call('npcattakzone:npc.assignController', [st.nid, st.ctrlVer]);
        } catch (e) {}

        setNpcState(st, NPCAZ_STATE.SWITCH_CONTROLLER, logger, reason);
        logger(
            `switch start nid=${st.nid} rid=${nextController.id} ver=${st.ctrlVer} `
            + `reason=${reason} prevRid=${prevControllerRid == null ? 'null' : prevControllerRid} `
            + `blockedRid=${blockedControllerRid == null ? 'null' : blockedControllerRid}`
        );

        setTimeout(() => {
            if (!st || !st.ped || !mp.peds.exists(st.ped)) return;
            if (!st.switching) return;
            if (Date.now() - (st.switchStartAt || 0) < timeout) return;

            if (st.controllerRid !== null && st.controllerRid !== undefined) {
                markBadController(st, st.controllerRid);
            }

            beginSwitch(st, 'switch-timeout-retry');
        }, timeout + 50);

        return true;
    }

    function onControllerAck(st, playerId, ver) {
        if (!st) return false;
        if (st.controllerRid !== playerId) return false;
        if ((st.ctrlVer || 0) !== ver) return false;

        st.switching = false;
        st.lastHeartbeatAt = Date.now();
        st.postAckGraceUntil = Date.now() + ((timers && timers.postAckGraceMs) || 500);

        clearBadController(st, playerId);

        try {
            if (st.ped && mp.peds.exists(st.ped)) {
                st.ped.setVariable('npcazCtrlState', 'ready');
            }
        } catch (e) {}

        restoreTask(st);
        logger(`switch done nid=${st.nid} rid=${playerId} ver=${ver}`);
        return true;
    }

    function onHeartbeat(st, playerId) {
        if (!st) return false;
        if (st.controllerRid !== playerId) return false;

        st.lastHeartbeatAt = Date.now();
        clearBadController(st, playerId);
        return true;
    }

    function checkTimeout(st) {
        if (!st) return;

        const now = Date.now();
        const timeout = timers && timers.controllerTimeoutMs ? timers.controllerTimeoutMs : 6000;

        if (st.switching && now - (st.switchStartAt || 0) >= timeout) {
            logger(`switch timeout nid=${st.nid}`);

            if (st.controllerRid !== null && st.controllerRid !== undefined) {
                markBadController(st, st.controllerRid);
            }

            beginSwitch(st, 'switch-timeout');
            return;
        }

        if (!st.switching && st.controllerRid !== null && now - (st.lastHeartbeatAt || 0) >= timeout) {
            logger(`heartbeat timeout nid=${st.nid}`);

            markBadController(st, st.controllerRid);
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

module.exports = { createNpcControllerManager };