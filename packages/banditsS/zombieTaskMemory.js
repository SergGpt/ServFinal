function saveTask(st, taskType, taskData = {}) {
    if (!st || !taskType) return;
    st.lastTaskType = taskType;
    st.lastTaskData = { ...taskData };
    st.lastTaskAt = Date.now();
}

function clearTask(st) {
    if (!st) return;
    st.lastTaskType = null;
    st.lastTaskData = null;
    st.lastTaskAt = Date.now();
}

function restoreTask(st, handlers) {
    if (!st || !handlers) return false;
    const type = st.lastTaskType;
    if (!type) return false;

    const fn = handlers[type];
    if (typeof fn !== 'function') return false;

    try {
        fn(st, st.lastTaskData || {});
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
