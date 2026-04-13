"use strict";

// Legacy task restore removed intentionally.
// Runtime behavior is reconstructed strictly from authoritative state snapshot.
class GuardTaskMemory {
    constructor() {
        this.snapshots = new Map();
    }

    write(postId, snapshot) {
        this.snapshots.set(String(postId), {
            ...snapshot,
            writtenAt: Date.now(),
        });
    }

    read(postId) {
        return this.snapshots.get(String(postId)) || null;
    }

    clear(postId) {
        this.snapshots.delete(String(postId));
    }
}

module.exports = { GuardTaskMemory };
