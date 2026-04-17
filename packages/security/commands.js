"use strict";

module.exports = {
    "/securityzonecreate": {
        description: "Создать security-зону из JSON",
        args: "[json:s?]",
        access: 6,
        handler: (player, args) => {
            let payload = {};

            if (args && args[0]) {
                try {
                    payload = JSON.parse(args.join(" "));
                } catch (error) {
                    return call("notifications").error(player, "Некорректный JSON", "Security");
                }
            }

            mp.events.call("security.zone.create", player, payload);
        },
    },
};
