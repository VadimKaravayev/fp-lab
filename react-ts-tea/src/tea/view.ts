import { DURATIONS_MS, type Model, type Phase } from "./types";

export type ViewState = Readonly<{
    phaseLabel: string;
    timeText: string;
    remainingMs: number;
    totalMs: number;
    progressPct: number;
    primaryAction: "start" | "pause";
    primaryLabel: string;
    completedWorkSessions: number;
}>;

export function view(model: Model): ViewState {
    const totalMs = DURATIONS_MS[model.phase];
    const remainingMs =
        model.timer.status === "running"
            ? Math.max(0, model.timer.endsAt - model.now)
            : model.timer.remainingMs;

    const running = model.timer.status === "running";

    return {
        phaseLabel: phaseLabel(model.phase),
        timeText: formatTime(remainingMs),
        remainingMs,
        totalMs,
        progressPct: totalMs === 0 ? 0 : ((totalMs - remainingMs) / totalMs) * 100,
        primaryAction: running ? "pause" : "start",
        primaryLabel: running ? "Pause" : "Start",
        completedWorkSessions: model.completedWorkSessions,
    };
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

function formatTime(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
