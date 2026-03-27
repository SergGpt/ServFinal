function serializeAttachments(attachments) {
    return (attachments.map((hash) => ((hash >>> 0).toString(36)))).join("|");
}

function _addAttachment(entity, attachmentHash, remove) {
    attachmentHash = (attachmentHash >>> 0);
    let idx = entity._attachments.indexOf(attachmentHash);

    if (idx === -1) {
        if (!remove) {
            entity._attachments.push(attachmentHash);
        }
    }
    else if (remove) {
        entity._attachments.splice(idx, 1);
    }

    entity.setVariable("attachmentsData", serializeAttachments(entity._attachments));
}

function _addAttachmentWrap(attachmentName, remove) {
    let to = typeof (attachmentName);

    if (to === "number") {
        _addAttachment(this, attachmentName, remove);
    }
    else if (to === "string") {
        _addAttachment(this, (mp.joaat(attachmentName) >>> 0), remove);
    }
}

function _hasAttachment(attachmentName) {
    const normalized = ((typeof (attachmentName) === 'string') ? mp.joaat(attachmentName) : attachmentName) >>> 0;
    return this._attachments.indexOf(normalized) !== -1;
}

function initPlayerAttachments(player) {
    if (!player) return;
    if (!Array.isArray(player._attachments)) player._attachments = [];
    player.addAttachment = _addAttachmentWrap;
    player.hasAttachment = _hasAttachment;
}

mp.events.add("player.joined", (player) => {
    initPlayerAttachments(player);
});

// Ресурс может перезапускаться при уже подключенных игроках.
mp.players.forEach((player) => {
    initPlayerAttachments(player);
});

mp.events.add("staticAttachments.Add", (player, hash) => {
    if (typeof player.addAttachment !== "function") initPlayerAttachments(player);
    player.addAttachment((parseInt(hash, 36) >>> 0), false);
});

mp.events.add("staticAttachments.Remove", (player, hash) => {
    if (typeof player.addAttachment !== "function") initPlayerAttachments(player);
    player.addAttachment((parseInt(hash, 36) >>> 0), true);
});
