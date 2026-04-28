// Добавляем в самый низ
window.hudStore.phoneContactNumber = (type, phoneNumber) => {
    switch(type) {
        case "call": 
            window.listernEvent("phone.setPage", "call")
            setTimeout(() => {
                window.listernEvent("phone.calls.setPage", "dial")
                setTimeout(() => window.listernEvent("phone.calls.dial.setTarget", phoneNumber), 1)
            }, 1);
            return;
        case "chat":
            window.listernEvent("phone.setPage", "messages")
            setTimeout(() => {
                window.listernEvent("phone.messages.openPopup")
                setTimeout(() => window.listernEvent("phone.messages.popUp.setTarget", phoneNumber), 1)
            }, 1);
            return;
    }
};