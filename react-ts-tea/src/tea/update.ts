import {
    DURATIONS_MS,
    LONG_BREAK_EVERY,
    type Cmd,
    type Model,
    type Msg,
    type Phase,
} from "./types.ts";

export function update(model: Model, msg: Msg): [Model, Cmd[]] {
    switch (msg.type) {
        case "Start": {
            if (model.timer.status === "running") return [model, []];
            return [
                {
                    ...model,
                    now: msg.now,
                    timer: { status: "running", endsAt: msg.now + model.timer.remainingMs },
                },
                [],
            ];
        }

        case "Pause": {
            if (model.timer.status === "paused") return [model, []];
            const remainingMs = Math.max(0, model.timer.endsAt - msg.now);
            return [
                {
                    ...model,
                    now: msg.now,
                    timer: { status: "paused", remainingMs },
                },
                [],
            ];
        }

        case "Reset": {
            return [
                {
                    ...model,
                    timer: { status: "paused", remainingMs: DURATIONS_MS[model.phase] },
                },
                [],
            ];
        }

        case "Tick": {
            if (model.timer.status !== "running") return [model, []];
            const withNow: Model = { ...model, now: msg.now };
            if (msg.now < model.timer.endsAt) return [withNow, []];
            return advancePhase(withNow, msg.now);
        }

        default:
            return assertNever(msg);
    }
}

function advancePhase(model: Model, now: number): [Model, Cmd[]] {
    const endedPhase = model.phase;
    const completedWorkSessions =
        endedPhase === "work" ? model.completedWorkSessions + 1 : model.completedWorkSessions;

    const nextPhase: Phase =
        endedPhase === "work"
            ? completedWorkSessions % LONG_BREAK_EVERY === 0
                ? "longBreak"
                : "shortBreak"
            : "work";

    const nextModel: Model = {
        phase: nextPhase,
        completedWorkSessions,
        timer: { status: "running", endsAt: now + DURATIONS_MS[nextPhase] },
        now,
    };

    const cmds: Cmd[] = [
        { type: "PlaySound", sound: "sessionEnd" },
        {
            type: "Notify",
            title: `${phaseLabel(endedPhase)} done`,
            body: `Starting ${phaseLabel(nextPhase).toLowerCase()}`,
        },
    ];

    return [nextModel, cmds];
}

function phaseLabel(p: Phase): string {
    switch (p) {
        case "work":
            return "Work";
        case "shortBreak":
            return "Short break";
        case "longBreak":
            return "Long break";
    }
}

function assertNever(x: never): never {
    throw new Error(`Unhandled Msg: ${JSON.stringify(x)}`);
}