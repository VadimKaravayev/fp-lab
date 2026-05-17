import * as Audio from "./effects/audio";
import * as Notifications from "./effects/notifications";
import type { Cmd, Msg } from "./types";

export function executeCmd(cmd: Cmd, _dispatch: (msg: Msg) => void): void {
    switch (cmd.type) {
        case "PlaySound":
            Audio.play(cmd.sound);
            return;
        case "Notify":
            Notifications.send(cmd.title, cmd.body);
            return;
        default:
            return assertNever(cmd);
    }
}

function assertNever(x: never): never {
    throw new Error(`Unhandled Cmd: ${JSON.stringify(x)}`);
}