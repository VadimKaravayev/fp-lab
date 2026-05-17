import type { Sub } from "./core";
import * as Time from "./effects/time";
import * as Visibility from "./effects/visibility";
import type { Model, Msg } from "./types";

export function subscriptions(model: Model): Sub<Msg>[] {
    if (model.timer.status !== "running") return [];

    return [
        Time.every(1000, (now) => ({ type: "Tick", now })),
        Visibility.onVisible((now) => ({ type: "Tick", now })),
    ];
}