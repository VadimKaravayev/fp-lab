export type Phase = "work" | "shortBreak" | "longBreak";

export type Timer =
    | { readonly status: "running"; readonly endsAt: number }
    | { readonly status: "paused"; readonly remainingMs: number };

export type Model = Readonly<{
    phase: Phase;
    timer: Timer;
    completedWorkSessions: number;
    now: number;
}>;

export const DURATIONS_MS: Readonly<Record<Phase, number>> = {
    work: 25 * 60 * 1000,
    shortBreak: 5 * 60 * 1000,
    longBreak: 15 * 60 * 1000,
};

export const LONG_BREAK_EVERY = 4;

export type Msg =
    | Readonly<{ type: "Start"; now: number }>
    | Readonly<{ type: "Pause"; now: number }>
    | Readonly<{ type: "Reset" }>
    | Readonly<{ type: "Tick"; now: number }>;

export type Cmd =
    | Readonly<{ type: "PlaySound"; sound: "sessionEnd" }>
    | Readonly<{ type: "Notify"; title: string; body: string }>;