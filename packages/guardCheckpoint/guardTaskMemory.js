"use strict";

function saveTask(post, taskType, taskData = {}) {
    if (!post || !taskType) return;
    post.lastTaskType = String(taskType);
    post.lastTaskData = { ...taskData };
    post.lastTaskAt = Date.now();
}

function clearTask(post) {
    if (!post) return;
    post.lastTaskType = "idle";
    post.lastTaskData = {};
    post.lastTaskAt = Date.now();
}

function restoreTask(post, handlers) {
    if (!post || !handlers) return false;
    const type = post.lastTaskType;
    if (!type) return false;
    const fn = handlers[type];
    if (typeof fn !== "function") return false;
    try {
        fn(post, post.lastTaskData || {});
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    saveTask,
    clearTask,
    restoreTask,
};
