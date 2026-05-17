import { DURATIONS_MS, type Cmd, type Model } from "./types";

export function init(): [Model, Cmd[]] {
    const model: Model = {
        phase: "work",
        timer: { status: "paused", remainingMs: DURATIONS_MS.work },
        completedWorkSessions: 0,
        now: Date.now(),
    };
    return [model, []];
}