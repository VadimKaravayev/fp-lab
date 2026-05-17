# Pomodoro — React + TypeScript + TEA build notes

A running log of design decisions and explanations from the step-by-step
build. Paired with `IDEAS.md` (why this project) and the code in `src/tea/`.

---

## Architecture: option B (external TEA runtime)

Three options were considered for where `update` lives in React:

| Option                                                     | Sketch                                                                    | Verdict                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A** Pure `useReducer` + `useEffect` for Cmd/Sub          | Easiest, most React-idiomatic                                             | Collapses Cmd + Sub into one primitive → defeats half the learning |
| **B** External TEA runtime + `useSyncExternalStore`        | Module-level `Model`, `dispatch`, Cmd/Sub interpreters; React = thin view | **Chosen.** Keeps TEA core framework-agnostic                      |
| **C** Hybrid: `useReducer` + external Cmd/Sub interpreters | Middle road                                                               | Still puts React in the loop                                       |

**Why B:** the whole point of this project is TEA discipline. React in "the
React way" drifts into `useState`/`useEffect` soup as state grows — option
B reduces React to a rendering host and keeps all state + effects in
plain TypeScript modules that can be ported to any other framework (or
tested with no DOM at all).

### Folder layout

```
src/
  tea/                         ← zero React imports in this folder
    types.ts                   Model, Msg, Cmd, Sub unions + constants
    update.ts                  pure (model, msg) → [model, Cmd[]]
    subscriptions.ts           pure (model) → Sub[]
    runtime.ts                 Program + dispatch loop + Cmd/Sub interpreters
  useProgram.ts                useSyncExternalStore bridge (only React-touching file)
  App.tsx                      thin view — consumes model, dispatches msgs
  main.tsx                     wires runtime into ReactDOM root
```

### Data flow

```
  user event ──► dispatch(Msg) ──► update(model, msg) ──► [newModel, Cmd[]]
                       │                                         │
                       │                                         └─► runCmd() (side effects)
                       ▼
                  subscriptions(newModel) ──► syncSubs() (start / stop / keep listeners)
                       │
                       ▼
                  notify() ──► React re-renders via useSyncExternalStore
```

---

## Step 1 — Model

Pomodoro Model lives in `src/tea/types.ts`.

### Phase and status — separate axes

```ts
type Phase = "work" | "shortBreak" | "longBreak";
type Timer =
    | { readonly status: "running"; readonly endsAt: number }
    | { readonly status: "paused"; readonly remainingMs: number };
```

**Why two fields instead of a flat 9-variant union?** Pomodoro transitions
change one axis at a time (Pause changes status, SessionEnded changes
phase). Separate unions match the actual transitions and keep `update` a
small switch.

**No `"idle"` status.** "Not started yet" = `paused` at full duration.
YAGNI.

### `endsAt` vs `remainingMs` — the drift-proof choice

The Timer discriminated union carries **different fields per variant**:

- **Running** stores `endsAt: number` (ms since epoch). Display time is
  computed as `endsAt - Date.now()` on every render.
- **Paused** stores `remainingMs: number` — the frozen remainder.

Why this matters: if running stored `remainingMs` and was decremented by
1000 per Tick, a 30s backgrounded tab = 30s of drift. Storing `endsAt`
makes Tick **self-correcting** — no matter how late it fires, the
computed display is accurate.

The discriminated union makes it impossible to read the wrong field by
accident.

### Durations as module constants

```ts
const DURATIONS_MS: Readonly<Record<Phase, number>> = {
    work: 25 * 60 * 1000,
    shortBreak: 5 * 60 * 1000,
    longBreak: 15 * 60 * 1000,
};
```

Not in Model. Settings UI isn't in scope; if it ever is, add a
`settings` field _then_.

### `Record<K, V>` primer

`Record<K, V>` is a mapped type meaning "an object whose keys are `K`
and values are `V`". TS definition:

```ts
type Record<K extends keyof any, V> = { [P in K]: V };
```

So `Record<Phase, number>` expands to `{ work: number; shortBreak: number; longBreak: number }`.

**Win over plain object types:** if you add `"extraLongBreak"` to
`Phase`, TS errors on `DURATIONS_MS` until you add the new key — free
exhaustiveness check.

Common variants: `Partial<Record<K, V>>`, `Readonly<Record<K, V>>`.

### Type widening — always annotate your initial Model

```ts
// WRONG — TS widens "work" → string, "paused" → string
const initial = { phase: "work", timer: { status: "paused", ... }, ... };

// RIGHT — annotated return type keeps literal types, discriminated union narrows elsewhere
export function init(): Model { return { ... }; }
```

Without a `Model` annotation (on a const) or a declared return type (on
a function), TS infers the broadest types that fit the literal, so
`init().timer.status` becomes `string` and discriminated-union narrowing
breaks at every usage site.

### `init()` as a function, not a module-load const

Early versions exported:

```ts
export const initialModel: Model = { ..., now: Date.now() };
```

That runs `Date.now()` **at module load** — a side effect during import,
which is a landmine for tests (stale "now" across runs) and violates the
"impurity lives at the boundary" principle. The fix is trivial:

```ts
export function init(): Model {
    return { ..., now: Date.now() };
}
```

Now the clock is sampled when someone actually calls `init()`. The
React bridge accepts a thunk (`useProgram(init)`) and calls it inside
`useEffect` — pushing the impurity all the way to mount time. Matches
Elm's `init : () -> (Model, Cmd msg)` shape.

### Immutability

- `Readonly<>` wrapper on Model
- `readonly` on each field of Timer variants and Msg/Cmd/Sub variants
- `Readonly<Record<Phase, number>>` on DURATIONS_MS

TS `readonly` is **compile-time only** — it doesn't freeze the object at
runtime, but it prevents accidental mutation in your code, which is
enough.

---

## Step 2 — Msg

```ts
type Msg =
    | Readonly<{ type: "Start"; now: number }>
    | Readonly<{ type: "Pause"; now: number }>
    | Readonly<{ type: "Reset" }>
    | Readonly<{ type: "Tick"; now: number }>;
```

### The "now" discipline

`update` must be **pure** — no `Date.now()`, no `Math.random()`, no I/O.
The clock is an effect, so every Msg that needs the current time carries
it as a field. The caller (event handler or Sub) reads the clock once
and injects it.

| Msg   | Needs `now`? | Why                                  |
| ----- | ------------ | ------------------------------------ |
| Start | ✓            | `endsAt = now + remainingMs`         |
| Pause | ✓            | `remainingMs = endsAt - now`         |
| Reset | ✗            | Snaps to full duration, no time math |
| Tick  | ✓            | Check `now >= endsAt`                |

Decision: **callers stamp `now` explicitly** at the dispatch site
rather than a wrapper hiding it. React handlers look like
`dispatch({ type: "Start", now: Date.now() })`. This keeps the clock
impurity visible at the boundary rather than hidden in the runtime —
you can see at a glance which handlers depend on wall-clock time.
(See Step 7 for the bridge.)

### What is NOT in the Msg union

- **`SessionEnded`** — derived inside `update` from `Tick`
- **`ModeSwitched`** — auto-advance inside `update` on session end
- **`VisibilityChanged`** — handled by a Sub that fires a `Tick`, no new Msg needed

Small union → small switch in `update`.

---

## Step 3 — update

`src/tea/update.ts`.

### Signature

```ts
function update(model: Model, msg: Msg): [Model, Cmd[]];
```

Tuple of `[new model, effects to run]`. Pure — no I/O, no `Date.now()`,
no mutation of `model`.

### Transitions

| Msg   | Guard                    | Transition                                               | Cmds               |
| ----- | ------------------------ | -------------------------------------------------------- | ------------------ |
| Start | only when paused         | `status: "running"`, `endsAt = now + remainingMs`        | —                  |
| Pause | only when running        | `status: "paused"`, `remainingMs = max(0, endsAt - now)` | —                  |
| Reset | any                      | `status: "paused"`, `remainingMs = DURATIONS_MS[phase]`  | —                  |
| Tick  | running AND now ≥ endsAt | `advancePhase()`                                         | PlaySound + Notify |
| Tick  | otherwise                | no-op                                                    | —                  |

### Auto-advance on session end

When Tick detects `now >= endsAt`, `update` immediately transitions to
the next phase **and starts it running**. Design choice: matches classic
Pomodoro flow (no dead time between sessions). If you want "wait for
user to press Start between phases", it's a small change — remove the
auto-start in `advancePhase`.

### Long-break rule

After a work session ends, `completedWorkSessions += 1`. If the new
count is divisible by `LONG_BREAK_EVERY` (4) → next phase is
`longBreak`; else `shortBreak`. After any break → back to `work`,
counter unchanged.

### Exhaustiveness via `assertNever`

```ts
function assertNever(x: never): never {
    throw new Error(`Unhandled Msg: ${JSON.stringify(x)}`);
}
```

Used in `default:` of the Msg switch. If you add a new Msg variant and
forget a case, TS errors at compile time because `msg` in the default
wouldn't narrow to `never`. Free safety net.

### Destructuring with discriminated unions

You have to **narrow first, destructure second**:

```ts
// FAILS — endsAt doesn't exist on all Timer variants
const { endsAt } = model.timer;

// OK — narrow, then destructure
if (model.timer.status !== "running") return [model, []];
const { endsAt } = model.timer;
```

You also **cannot** destructure the `Msg` parameter directly because
`now` only exists on some variants — `switch (msg.type)` narrows per
case, then you can destructure inside the case.

**Rule of thumb:** destructure when a field is used 2+ times in a block,
or the access chain is long (`model.timer.endsAt`).

---

## Step 4 — Cmd

```ts
type Cmd =
    | Readonly<{ type: "PlaySound"; sound: "sessionEnd" }>
    | Readonly<{ type: "Notify"; title: string; body: string }>;
```

Both fire when a session ends. No persistence yet (YAGNI). Grow the
union as features demand.

**Cmd is data, not code.** Update returns Cmd _descriptions_; the runtime
interprets them. This is what keeps `update` pure and testable.

---

## Step 5 — subscriptions

`src/tea/subscriptions.ts`.

### Cmd vs Sub — the critical distinction

- **Cmd** — fire-and-forget effect. Update emits Cmds **once per Msg**.
  Example: "play this sound now".
- **Sub** — standing subscription to an external event stream.
  `subscriptions(model)` is called **after every update**; the runtime
  diffs the result and starts/stops actual listeners. Example: "while
  running, tick every second".

### Sub type

```ts
type Sub =
    | Readonly<{ type: "Interval"; ms: number; toMsg: (now: number) => Msg }>
    | Readonly<{ type: "OnVisible"; toMsg: (now: number) => Msg }>;
```

`toMsg` is a pure function from event data → Msg. The Sub carries
_what data it produces_ and _how to turn it into a Msg_. The runtime
reads the clock and calls `toMsg`; `update` stays pure.

### subscriptions function

```ts
function subscriptions(model: Model): Sub[] {
    if (model.timer.status !== "running") return [];
    const tick: Sub = { type: "Interval", ms: 1000, toMsg: (now) => ({ type: "Tick", now }) };
    const onVisible: Sub = { type: "OnVisible", toMsg: (now) => ({ type: "Tick", now }) };
    return [tick, onVisible];
}
```

- **Paused → no subs.** Runtime tears down any active listeners.
- **Interval + OnVisible both produce Tick.** Different events,
  converging on the same Msg. Interval covers steady-state ticking;
  OnVisible forces an immediate Tick when the tab wakes (browsers
  throttle intervals on hidden tabs).

### The identity problem (deferred to runtime)

Every call to `subscriptions(model)` creates new closures, so
`toMsg` is a new reference every time. How does the runtime decide
which subs to keep, start, or stop?

**Answer:** diff by `type + config` (ignoring `toMsg`). Two Interval
subs with `ms: 1000` are "the same"; keep the running interval and
just swap the `toMsg` reference. Implemented in `runtime.ts`.

---

## Step 6 — runtime

`src/tea/runtime.ts`. The biggest and most important file.

### What it does

1. Owns the `Model` — one mutable reference, only changed via `dispatch`
2. Runs the update loop — `dispatch(msg)` → `update` → run cmds → sync subs → notify
3. Interprets Cmds (real side effects live here)
4. Diffs Subs between renders

### Program API

```ts
type Program = Readonly<{
    getModel: () => Model;
    dispatch: (msg: Msg) => void;
    subscribe: (listener: () => void) => () => void; // React bridge
    dispose: () => void;
}>;
```

### Key design decisions

- **Closure-based state.** `model`, `activeSubs`, `listeners` are `let`
  inside `run()`. The closure _is_ the runtime instance. Each
  `run(initialModel)` is a fresh independent Program — no globals, no
  `this`.

- **Only `dispatch` mutates `model`.** Every mutation comes from a pure
  `update(model, msg)` call. You cannot reach in from outside.

- **Cmds are interpreted inline** in `runCmd`. This is the impure
  boundary — Notifications, audio, fetches all live here. `update` sees
  none of it.

- **Sub diffing** by `sameSubConfig`:
    - Compare `type` + config fields (e.g., `ms`)
    - Ignore `toMsg` — it's a closure, new reference every render
    - When keeping a sub, refresh its `toMsg` so it closes over the
      latest state if needed

- **`subscribe` / `listeners`** is the bridge for React's
  `useSyncExternalStore`. Every `dispatch` calls `notify()`, which calls
  each listener; React's listener schedules a re-render.

- **`dispose`** tears everything down — stops subs, clears listeners,
  sets `disposed` flag so stray in-flight dispatches become no-ops.
  Required for hot reload, tests, and SPA teardown.

- **Zero React imports.** The whole runtime is framework-agnostic. Ported
  to vanilla DOM, Svelte, or a CLI with no changes.

---

## Tooling decisions

### Prettier

```json
{
    "semi": true,
    "singleQuote": false,
    "jsxSingleQuote": false,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 4,
    "arrowParens": "always"
}
```

- **Double quotes** — JSX attributes must be double, so matching TS
  strings keeps one style everywhere.
- **Semicolons: true** — chose safety over brevity. The no-semicolon
  footguns (ASI ambiguity on lines starting with `(`, `[`, `` ` ``)
  are all handled by Prettier in practice, but unformatted commits
  would be risky. Semicolons make the code self-defensive.
- **`trailingComma: "all"`** — cleaner diffs when adding fields.

Scripts:

- `npm run format` — write
- `npm run format:check` — CI check

---

## Design tradeoffs recorded (for future reference)

- **Auto-advance on session end** — saves a Msg variant, matches classic
  Pomodoro. Flip to manual-advance by removing the auto-start in
  `advancePhase`.
- **No persistence** — deliberate YAGNI. Add a `Persist` Cmd and a
  `Rehydrated` Msg when localStorage is needed.
- **No settings UI** — durations are module constants. Add a `settings`
  field to Model when the UI lands.
- **One fetch slot / one interval** — fine for Pomodoro. A component
  with multiple independent fetches would need a keyed map of
  AbortControllers (see ts-tea v2 hardening notes).

---

## Step 7 — React bridge

`src/useProgram.ts`. The **only file** in the project that imports from
`react`. Everything else in `src/tea/` is framework-agnostic plain
TypeScript.

```ts
export function useProgram(init: () => Model): {
    model: Model;
    dispatch: (msg: Msg) => void;
} {
    const [program, setProgram] = useState<Program | null>(null);
    const [fallbackModel] = useState<Model>(init);

    useEffect(() => {
        const p = run(init());
        setProgram(p);
        return () => {
            p.dispose();
            setProgram(null);
        };
    }, []);

    const getSnapshot = program ? program.getModel : () => fallbackModel;

    const model = useSyncExternalStore(
        program?.subscribe ?? noopSubscribe,
        getSnapshot,
        getSnapshot, // SSR fallback
    );

    return {
        model,
        dispatch: program?.dispatch ?? noopDispatch,
    };
}
```

Taking a thunk instead of a `Model` lets the hook defer `init()` to the
effect (so `Date.now()` samples at mount, not at module load). The
`fallbackModel` is lazily captured via `useState(init)` so the first
render — before the effect fires — has a real Model to show, without
calling `init()` again on every render.

### What each piece does

- **`useState<Program | null>(null)` + create in effect** — Program is
  created inside `useEffect`, not in render. This is the only shape that
  survives StrictMode's fake-remount cycle (see below).

- **`useState<Model>(init)` lazy initializer** — gives render 1 a real
  Model to display while the effect hasn't fired yet. The thunk runs
  once per mount, not per render.

- **`useEffect` cleanup disposes the program** — stops all Subs, clears
  listeners, sets the `disposed` flag so in-flight dispatches become
  no-ops.

- **`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`**
  — React 18+'s official primitive for reading from a mutable external
  store:
    - `subscribe(cb)` — React registers its re-render callback with the
      runtime. Our `program.subscribe` adds `cb` to the `listeners` Set
      and returns an unsubscribe function.
    - `getSnapshot()` — React reads the current value via
      `program.getModel`. **Must be reference-stable when state hasn't
      changed** — that's why `update` always returns a new Model (never
      mutates): reference equality correctly signals "something changed".
    - `getServerSnapshot()` — for SSR; we pass the same function since we
      don't SSR.

### StrictMode — why the pattern looks the way it does

**The naive pattern fails StrictMode.** First attempt was:

```ts
const [program] = useState(() => run(initialModel));
useEffect(() => () => program.dispose(), [program]);
```

Assumption: StrictMode re-initializes `useState` on the fake remount.
**It does not.** Actual behavior:

```
mount       → useState(run) → Program A
effect setup→ (cleanup registered)
fake unmount→ cleanup runs → Program A.dispose() (disposed = true)
fake remount→ effect setup runs again — closure still holds Program A
            → useState state is preserved, NOT re-initialized
result      → UI renders but dispatch no-ops forever (disposed = true)
```

Symptom: app renders, clicks silently do nothing. Learned the hard way.

**Fix: move program creation into the effect.** The effect owns the
create/dispose lifecycle; each StrictMode cycle gets a fresh program:

```ts
const [program, setProgram] = useState<Program | null>(null);

useEffect(() => {
    const p = run(initialModel);
    setProgram(p);
    return () => {
        p.dispose();
        setProgram(null);
    };
}, []);

const getSnapshot = program ? program.getModel : () => initialModel;

const model = useSyncExternalStore(
    program?.subscribe ?? noopSubscribe,
    getSnapshot,
    getSnapshot,
);

return {
    model,
    dispatch: program?.dispatch ?? noopDispatch,
};
```

**Costs:**

1. **Double-render on mount.** First render has `program === null` and
   shows `initialModel`; effect fires, calls `setProgram(p)`, second
   render shows the live program. For Pomodoro it's imperceptible
   (initial model is paused at 25:00, same as first-paint fallback).
2. **Null-guards at every read site.** `program?.dispatch`,
   `program?.subscribe`, fallback `getSnapshot`. Clicks during the
   split-second before the effect fires hit `noopDispatch` — rare but
   real.
3. **Stable noops at module scope.** `noopSubscribe` and `noopDispatch`
   are hoisted so React doesn't resubscribe on every null-program
   render.
4. **ESLint `react-hooks/exhaustive-deps`.** Suppressed on the
   `useEffect` because `initialModel` is intentionally create-once; if
   it changed over time we'd need a different design entirely.

**StrictMode trace with the fix:**

```
mount       → useState(null), program = null
render 1    → useSyncExternalStore wired to noops + initialModel fallback
effect      → run() → Program A → setProgram(A) → schedule re-render
render 2    → program = A, real subscribe + getModel wired up
fake unmount→ cleanup disposes A, setProgram(null) → schedule re-render
render 3    → program = null again (fallback noops)
fake remount→ effect creates Program B → setProgram(B)
render 4    → program = B, live runtime
real unmount→ cleanup disposes B
```

Correct at every step. No leaked intervals/listeners. Clicks work.

**Broader lesson:** this is the pattern a proper external-store hook in
a shared library would use. The costs (double render, null-checks) are
unavoidable in StrictMode if you want a create/dispose lifecycle tied
to a single component. Two earlier hypotheses turned out wrong:

- `useRef` "preserves across remount" — but StrictMode doesn't actually
  remount, so the ref just holds the disposed value with no signal to
  recreate.
- `useState(() => run(...))` initializer re-runs on fake remount — it
  doesn't; state is preserved.

Both are seductive; both are wrong. The only way out is to not create
the resource in render at all.

### Dispatch stability

`program.dispatch` is the same closure across renders — you can pass
it down to children without `useCallback`. The React handlers end up
looking like:

```tsx
<button onClick={() => dispatch({ type: "Start", now: Date.now() })}>Start</button>
```

Yes, callers stamp `now: Date.now()` explicitly. This is deliberate —
it keeps the impurity (reading the clock) visible at the call site
rather than hidden in a wrapper. Update stays pure given the Msg, and
you can see at a glance which handlers depend on wall-clock time.

---

## Step 8 — Corrections from a code review pass

### `Notify` cmd — actually request permission

First pass had:

```ts
case "Notify":
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(cmd.title, { body: cmd.body });
    } else {
        console.log("[cmd] Notify", ...);
    }
```

The problem: `Notification.permission` starts at `"default"` on first
visit. Permission is never requested, so the branch is always false and
notifications silently become `console.log` forever — even after the
user would happily grant permission if asked.

Fix: handle all three permission states, and call
`Notification.requestPermission()` on first use:

```ts
function showNotification(title: string, body: string): void {
    if (!("Notification" in window)) return console.log(...);
    if (Notification.permission === "granted") {
        new Notification(title, { body });
        return;
    }
    if (Notification.permission === "default") {
        void Notification.requestPermission().then((perm) => {
            if (perm === "granted") new Notification(title, { body });
            else console.log(...);
        });
        return;
    }
    console.log(...); // "denied" — respect user, fall back to log
}
```

Permission request is triggered by a Cmd (reaction to a user-initiated
Msg chain), so browsers accept it as a user gesture. Requesting on page
load would be intrusive and often rejected.

### Naming collision lesson

Initial attempt named the helper `notify(title, body)`. That shadowed
the existing runtime `notify()` — the listener fan-out called by
`dispatch` to wake up `useSyncExternalStore`:

```ts
function notify() { for (const l of listeners) l(); }  // line 22
// ...
function notify(title, body): void { ... }             // my addition
```

TypeScript reported `TS2393: Duplicate function implementation`, but
more importantly, `dispatch()` line `notify()` now called the wrong one
silently in a hand-built environment, and React never re-rendered.

Symptom observed at runtime: clicks appeared to do nothing — identical
to the StrictMode-disposal bug, different root cause. **When the app
goes dead after a "small change", grep for name collisions inside
`run()` first.** The closure-based runtime uses plain function names;
there's no namespace to protect you.

Fix: renamed to `showNotification`. Clear verb, no collision.
