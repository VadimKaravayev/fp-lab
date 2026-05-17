# React + TypeScript + TEA — Project Ideas

Goal: build a React/TS app structured around The Elm Architecture so that
**Msg**, **Cmd**, and **Sub** all get real exercise. The meta-question
running through every idea below:

> Where does `update` live in React — `useReducer`, an external store, a
> custom runtime? — and how do Cmds/Subs plug in without turning into
> `useEffect` soup?

Ideas are ordered by how central **Sub** is to the problem. Sub should
be load-bearing, not a tacked-on interval.

---

## 1. Pomodoro / Focus Timer

**Msg**

- `Start`, `Pause`, `Reset`
- `SessionEnded` (tick reached zero)
- `ModeSwitched` (work ↔ short break ↔ long break)

**Cmd**

- Play end-of-session sound
- Show browser `Notification`
- Persist session state to `localStorage`

**Sub**

- Tick interval (1s) while running
- `visibilitychange` on `document` — correct drift when tab is
  backgrounded (browsers throttle intervals in hidden tabs)

**Why it teaches TEA**
Timing is where raw `useEffect` usually breaks — stale closures,
uncleaned intervals, background-tab drift. The Sub/Cmd split makes the
bugs obvious: Sub owns the stream, Cmd owns the one-shot effect, neither
lives inside render.

---

## 2. WebSocket Chat Room

**Msg**

- `InputChanged`, `MessageSent`
- `MessageReceived`, `Connected`, `Disconnected`
- `ReconnectAttempt`

**Cmd**

- Open WebSocket connection
- Send frame
- Reconnect with exponential backoff

**Sub**

- Incoming-message stream from the socket
- `online` / `offline` window events

**Why it teaches TEA**
The canonical Sub use case — a _push_ stream you cannot model as a Cmd.
Forces a clean design for Sub lifecycle: subscribe on mount, unsubscribe
on unmount, and swap subscriptions when the Model changes (e.g. user
joins a different room).

---

## 3. Command Palette (⌘K)

**Msg**

- `Opened`, `Closed`
- `QueryChanged`
- `ResultsReceived`
- `HighlightMoved` (arrow keys), `ItemSelected`

**Cmd**

- Debounced search fetch — **debounce-as-Cmd is the tricky part**;
  naive `setTimeout` breaks purity of `update`.

**Sub**

- Global `keydown` listener for ⌘K to open
- Global `keydown` for arrow/enter/escape while open

**Why it teaches TEA**
Two hard patterns in one small app: (a) debouncing inside a pure
`update`, usually solved by a Cmd that cancels a prior token; (b) global
keyboard handling that _must_ be a Sub because it's not scoped to any
component.

---

## 4. Crypto / Stock Price Ticker

**Msg**

- `SymbolAdded`, `SymbolRemoved`
- `PriceTick` (per symbol)
- `SortChanged`, `FilterChanged`

**Cmd**

- Initial REST fetch for symbol metadata / starting prices

**Sub**

- WebSocket price feed (or Server-Sent Events as a fallback)

**Why it teaches TEA**
Same Sub shape as #2 but with a richer Model — many symbols, sorting,
filtering — so it's the best idea for practicing `update` decomposition
and for seeing how a pure `view(model) → ViewState` projection handles a
constantly-changing list without re-rendering the world.

---

## Recommendation

- Smallest, most self-contained: **#1 Pomodoro**
- Best "real" Sub story: **#2 WebSocket chat**
- Most architecturally challenging (debounce + global keys): **#3 Palette**
- Richest Model / closest to a real product: **#4 Ticker**

---

## React-specific design questions to answer while building

Regardless of which idea is picked, these are the questions the project
exists to answer:

1. **Where does the runtime live?** Options:
    - `useReducer` for `update`, `useEffect` for Cmd/Sub interpretation
    - A module-level runtime (like ts-tea v2) with React only as the
      `view` renderer, wired through `useSyncExternalStore`
    - A hybrid: reducer inside React, but Cmd/Sub interpreters outside
2. **How is a Cmd executed without breaking purity?** The reducer must
   stay pure — Cmds have to be returned as data and interpreted
   elsewhere.
3. **How are Subs declared?** As a function `subscriptions(model) →
Sub[]`, diffed between renders so new subs mount and stale subs
   unmount. This is the part React makes awkward.
4. **How is teardown handled?** `mount` → `dispose` contract vs. React
   unmount. Can the same TEA core power a non-React host later?
5. **Does `view` return JSX directly, or a `ViewState` that a thin React
   component renders?** (The ts-tea v2 lesson: ViewState projection
   keeps the view testable without a DOM.)

These map directly to the "known gaps" list from the ts-tea v2 work —
this React project is a chance to answer them in a framework context.
