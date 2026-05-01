module.exports = {
    "/hudeditor": {
        access: 1,
        description: "Открыть/закрыть редактор HUD (админ)",
        args: "[0/1]:b?",
        handler: (player, args) => {
            let state = null;
            if (args.length) {
                const raw = parseInt(args[0]);
                if (raw === 0 || raw === 1) state = !!raw;
            }

            player.call("hud.editor.access", [true]);
            player.call("hud.editor.toggle", [state]);
            player.call("chat.message.push", [`!{#59dbff}HUD редактор: ${state == null ? 'переключен' : (state ? 'включен' : 'выключен')}`]);
        }
    },
};
