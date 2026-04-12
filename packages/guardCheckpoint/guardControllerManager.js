"use strict";

function createGuardControllerManager(deps) {
    const {
        chooseController,
        isValidPlayer,
        getPlayerById,
        log,
        timers,
        onControllerAssigned,
        onNoController,
        onSwitchReady,
    } = deps;

    function beginSwitch(post, reason = "unknown") {
        if (!post) return false;
        const now = Date.now();
        const cooldownMs = Number(timers.switchCooldownMs || 400);
        if (post.switching && now - (post.switchStartedAt || 0) < cooldownMs) return false;

        const nextController = chooseController(post);
        if (!nextController || !isValidPlayer(nextController)) {
            post.switching = false;
            post.streamOwnerId = null;
            post.controllerRid = null;
            onNoController(post, reason);
            return false;
        }

        // Если этот controller уже назначен и живой — ничего не делаем.
        if (post.controllerRid != null
            && post.streamOwnerId != null
            && Number(post.controllerRid) === Number(nextController.id)
            && Number(post.streamOwnerId) === Number(nextController.id)
            && !post.switching) {
            return false;
        }

        const sameController = Number(post.controllerRid) === Number(nextController.id);
        const recentlySwitched = now - (post.lastControllerSwitchAt || 0) < cooldownMs;
        if (sameController && recentlySwitched) return false;

        post.switching = true;
        post.switchStartedAt = now;
        post.switchReason = reason;
        post.switchAttempts = Number(post.switchAttempts || 0) + 1;

        post.ctrlVer = Number(post.ctrlVer || 0) + 1;
        post.controllerAckVer = 0;
        post.streamOwnerId = nextController.id;
        post.controllerRid = nextController.id;
        post.lastControllerSwitchAt = now;

        onControllerAssigned(post, nextController, reason);

        try { nextController.call("guardCheckpoint:controller:switch", [post.id, post.ctrlVer]); } catch {}
        log(`post=${post.id} switch-start owner=${nextController.id} ver=${post.ctrlVer} reason=${reason}`);
        return true;
    }

    function onControllerAck(post, playerId, ver) {
        if (!post) return false;
        if (!post.switching) return Number(post.controllerRid) === Number(playerId);
        if (Number(post.controllerRid) !== Number(playerId)) return false;
        if (Number(post.ctrlVer || 0) !== Number(ver || 0)) return false;

        post.switching = false;
        post.switchReason = null;
        post.switchAttempts = 0;
        post.switchStartedAt = 0;
        post.controllerAckVer = Number(ver);
        post.lastControllerHeartbeatAt = Date.now();

        const owner = getPlayerById(playerId);
        onSwitchReady(post, owner);
        log(`post=${post.id} switch-ack owner=${playerId} ver=${ver}`);
        return true;
    }

    function checkTimeout(post) {
        if (!post || !post.switching) return;
        const timeoutMs = Number(timers.switchAckTimeoutMs || 2200);
        if (Date.now() - (post.switchStartedAt || 0) < timeoutMs) return;

        log(`post=${post.id} switch-timeout reason=${post.switchReason || "unknown"}`);
        const maxAttempts = Number(timers.maxSwitchAttempts || 3);
        if (Number(post.switchAttempts || 0) >= maxAttempts) {
            post.switching = false;
            post.streamOwnerId = null;
            post.controllerRid = null;
            onNoController(post, "switch-timeout-max-attempts");
            return;
        }

        beginSwitch(post, "switch-timeout-retry");
    }

    return {
        beginSwitch,
        onControllerAck,
        checkTimeout,
    };
}

module.exports = {
    createGuardControllerManager,
};
