# ts-tea — Notes

**Exploration project** — build The Elm Architecture (TEA) in TypeScript
from scratch, zero runtime deps, to investigate which TEA patterns hold up
for production progressive-enhancement components. The findings here feed
into real component code shipped in other repos
(e.g. `articlesnapshotherocarousel.ts` in kforce). Not a learning toy:
every pattern decision should be evaluated as *"will this hold up in
production?"* — not *"is this cute enough for a tutorial?"*

First app: **GitHub user lookup** — input + search button, fetches
`https://api.github.com/users/<name>`, shows avatar / name / bio / repo count,
handles loading + error states.

> **Primary deliverable:** the v2 (`src/v2/main.ts`) shape, refined into a
> `mount(root, config) → dispose` contract that production hosts can drive.
> v1 is kept as a comparison point — it's what the infrastructure looks
> like when you build the *whole* Elm runtime, not the component-sized
> subset production actually needs.

---

## Architecture plan

The Elm runtime does a lot for free. In TS we write it ourselves:

```
┌─────────────────────────────────────────┐
│ runtime loop (we write this)            │
│                                         │
│   model ──view──▶ vnode ──render──▶ DOM │
│     ▲                          │        │
│     │                          ▼        │
│    update ◀──── msg ◀─── event handler  │
│     │                                   │
│     └──cmd──▶ effect runner ──▶ msg ───┘│
└─────────────────────────────────────────┘
```

Modules:

| File            | Responsibility                                                     |
| --------------- | ------------------------------------------------------------------ |
**v1 — full SPA runtime with vdom (`src/v1/`, served by `index.html`):**

| File                | Responsibility                                                    |
| ------------------- | ----------------------------------------------------------------- |
| `src/v1/h.ts`       | `VNode` type, `h(tag, attrs, children)` builder, diff/patch render |
| `src/v1/runtime.ts` | `Program<Model, Msg>`, main loop, msg dispatch, cmd execution     |
| `src/v1/cmd.ts`     | `Cmd<Msg>` type core — `none`, `batch`                            |
| `src/v1/result.ts`  | `Result<T, E>` discriminated union + `ok` / `err` constructors    |
| `src/v1/http.ts`    | `HttpError`, `Http.get` — first effect module built on `Cmd`      |
| `src/v1/main.ts`    | App: `Model`, `Msg`, `init`, `update`, `view`, wire into runtime  |
| `index.html`        | `<div id="root">` + `<script type="module" src="./dist/v1/main.js">` |

**v2 — imperative/hydration style (`src/v2/`, served by `v2.html`):**

| File              | Responsibility                                                    |
| ----------------- | ----------------------------------------------------------------- |
| `src/v2/main.ts`  | **Everything** — Model, Msg, Cmd, update, view, render, decoder, executeCmd, mount |
| `v2.html`         | Static HTML shell with `data-hook` markers + pre-rendered result panels |

---

## Dev server

Zero-dep options (picked **A** for now):

### A — `python3 -m http.server` (current)

```bash
cd ts-tea
python3 -m http.server 8000
# open http://localhost:8000
```

In a second terminal, run the compiler in watch mode:

```bash
npx tsc -p . --watch
```

No auto-reload in the browser — refresh manually after saving.
Good enough to get to a working app; upgrade later if it gets annoying.

### B — homemade Node dev server (TODO, maybe)

~50 lines in `scripts/dev.ts`. Built on Node built-ins only (`http`, `fs`,
`child_process`), so still zero runtime deps:

- serve static files from project root
- spawn `tsc --watch` as a child process
- `fs.watch('dist')` → push SSE `reload` event to clients
- inject a 3-line SSE listener into `index.html` on the way out

On-brand with "build the machinery yourself." Fun side quest once the TEA
loop works end-to-end.

### C — Vite / esbuild

Skipped — violates the zero-deps goal of this project.

---

## tsconfig decisions

Picked these strict flags deliberately:

- `"strict": true` — the whole bundle. TEA relies hard on discriminated
  unions and exhaustive `switch`; strict mode makes the compiler enforce
  them.
- `"noUncheckedIndexedAccess": true` — `arr[0]` becomes `T | undefined`
  instead of `T`. Annoying, catches real bugs.
- `"noFallthroughCasesInSwitch": true` — forces `break`/`return` between
  cases. Important in the `update` function switch.
- `"noImplicitReturns": true` — every branch of a function must return.
- `"target": "ES2020"`, `"module": "ES2020"`, `"moduleResolution": "bundler"`
  — modern, but clean enough to read the compiled output.

## The `.js` extension gotcha

With native browser ES modules (no bundler), imports must have full paths
**including the `.js` extension**. TypeScript does **not** rewrite
`from './h'` → `from './h.js'` for you. So in `.ts` source files you have
to write:

```ts
import { h } from "./h.js"; // file is h.ts, but we write .js
```

Looks wrong, is correct. If you see a 404 for `./h` in devtools, this is
why.

---

## Progress log

- [x] **Step 1** — scaffold: `tsconfig.json`, `index.html`, `src/main.ts`
      (hello world), `package.json` with `typescript` dev-dep, `npm install`,
      `npx tsc -p .` compiles cleanly.
- [x] **Step 2** — `src/h.ts` — VNode + `h` + `render`
- [x] **Step 3** — `src/runtime.ts` + minimal `src/cmd.ts` — `Program`,
      `run`, `Cmd<Msg>`, `none`, `batch`. Msg queue prevents re-entrant
      dispatch.
- [x] **Step 4** — `src/result.ts` (`Result<T,E>`) + `src/http.ts`
      (`HttpError`, `Http.get`). First effect module built on `Cmd`.
- [x] **Step 5** — `src/main.ts` — Model, Msg, decoder, init, update,
      view, mount. Index.html gets minimal CSS. Compiles clean.
- [~] **Step 6** — verify end-to-end in the browser. Immediately hit
      the predicted input-focus-loss bug: typing kicks you out of the
      input after one character. Paused verification to fix it properly.
- [x] **Step 7** — upgrade `src/h.ts` to do real vdom diff/patch. No
      other files touched. `VNode<Msg>` API is unchanged.
- [x] **Step 8** — v2 rewrite in imperative / carousel style. New files
      only (`src/v2/main.ts`, `v2.html`); v1 is kept intact for
      comparison. Same architecture, much less infrastructure.
- [x] **Housekeeping** — moved v1 sources under `src/v1/` so both
      variants live in parallel subdirs. `index.html` now points at
      `dist/v1/main.js`; `v2.html` points at `dist/v2/main.js`. Both
      compile together under the same `tsconfig.json`.
- [x] **Step 9** — `bench.html` mounts both versions off-screen and
      times `QueryChanged` dispatches. See "Step 9 — benchmark" below.
      Results still pending — run and paste.
- [x] **Step 10** — v2 production hardening. `mount` returns a dispose
      function; `executeCmd` gained an `AbortController` slot that
      cancels previous fetch on a new submit; error classification
      split into network / status / decode branches. See "Step 10 —
      production hardening" below.
- [ ] **Step 11** — remaining production gaps (see "Known gaps before
      lifting v2 shape into production"). Pick off #1, #3, #4 before
      copying the pattern into a production repo.

---

## Step 2 — `src/h.ts` deep dive

### The big picture: what `h.ts` is

`h.ts` is our **virtual DOM layer** — the bridge between a pure
functional `view` and the messy, imperative browser DOM. In Elm this is
the built-in `Html` module; here we wrote our own in ~75 lines.

### The problem it solves

TEA says your view is a pure function from model to UI:

```
view : Model → Html Msg
```

But the real DOM is the opposite of pure. It's a mutable tree of live
objects with event listeners, focus state, scroll position, single-use
identities. You can't return DOM nodes from a pure function — you'd have
to reach in and mutate the document.

So we need an **intermediate representation**: plain data that
*describes* what the DOM should look like without *being* DOM. That's
`VNode` (virtual node). Your view returns `VNode`; something else later
turns `VNode` into real DOM.

### What's in the file

**1. The `VNode<Msg>` type** — a discriminated union with two shapes:

```ts
{ kind: "text", text: string }                          // text node
{ kind: "element", tag, attrs, children: VNode<Msg>[] } // element
```

A tree of plain objects. No DOM references anywhere. You can
`JSON.stringify` it, diff it, test it, serialize it over a wire.

**2. `h(tag, attrs, children)`** — element constructor, so you write:

```ts
h("button", { onClick: () => Msg.Search }, ["Go"])
```

instead of a raw `{ kind: "element", ... }` object literal. It also
wraps bare strings in text nodes automatically so `["Go"]` works in
place of `[text("Go")]`.

**3. `text(s)`** — text-node constructor for when you need one
explicitly.

**4. `render(vnode, parent, dispatch)`** — the **only** function in this
file that touches the real DOM. It walks the `VNode` tree, builds real
DOM nodes with `document.createElement` / `createTextNode`, and replaces
whatever was in `parent`. This is where the virtual world meets the real
world.

**5. `applyAttr(el, key, value, dispatch)`** — handles three cases:
event handler, DOM property, or HTML attribute.

### Why `VNode<Msg>` is generic

This is the central trick. In Elm, `Html msg` means "an HTML tree whose
event handlers produce values of type `msg`". Same in TypeScript:

```ts
type VNode<Msg> = ... | { attrs: { [k]: ... | (Event => Msg) }, ... }
```

Why does this matter? Because the view stays **pure**: it never calls
`dispatch`. It just describes "when this is clicked, the message is
`SearchClicked`". The runtime injects `dispatch` only at `render` time,
when wiring up the real event listener:

```ts
el.addEventListener("click", (e) => dispatch(handler(e)));
```

That single line is the crux. It's where the pure "here is my intent"
VNode gets connected to "actually do the thing" runtime dispatch. The
view never knew `dispatch` existed.

This separation is what makes TEA views testable — you can inspect a
`VNode` tree in a unit test and check "yes, this button's `onClick`
produces `SearchClicked`" without ever touching a browser.

### Property-first attribute strategy

For form inputs, `setAttribute('value', x)` sets the *default* value
(the one the form resets to), not the live value. To control an input
you have to set the *property*: `el.value = x`. Same story for
`checked`, `disabled`, `className`.

So `applyAttr` does:

```ts
if (key in el) (el as any)[key] = value;  // property path
else el.setAttribute(key, String(value)); // attribute path
```

In views, use `className` (not `class`), because `className` is the DOM
property name. `class` would fall through to `setAttribute` and work by
accident, but it's inconsistent.

### Event-handler convention

Keys starting with `on` whose value is a function become event listeners.
`onClick` → `click`, `onInput` → `input`, `onSubmit` → `submit`. Strip
`on`, lowercase the rest. The lowercase DOM event name is always the
canonical one (`click`, `input`, `keydown`, `domcontentloaded`, …).

### Naive render = full rebuild (intentional)

`render` does `parent.replaceChildren(build(vnode, dispatch))`. Every
call throws away the old subtree and rebuilds from scratch. This is
**going to hurt**:

- Typing in an input loses focus after each keystroke (the old input
  element was replaced by a fresh one).
- Scroll position resets.
- Slow on big trees.

We'll feel all of these in Step 5/6 and use the pain as motivation to
introduce a real diff/patch algorithm. For now: understand the pain,
don't hide it. When we upgrade `render` later, nothing else in the
project will need to change — the `VNode<Msg>` interface is the
contract.

### The `readonly` annotations

`VNode` is `readonly` top to bottom. TEA models are immutable — `update`
returns a new model, never mutates the old one. Making `VNode` readonly
keeps the compiler enforcing the same discipline for views. Costs
nothing, catches accidental mutation.

### How `h.ts` fits the larger picture

```
             your view function
                    │
                    ▼
          ┌─────────────────────┐
          │  VNode<Msg> tree    │   ← pure data, easy to test
          └─────────────────────┘
                    │
                    ▼  render(vnode, root, dispatch)
          ┌─────────────────────┐
          │   real DOM nodes    │   ← side effects live ONLY here
          └─────────────────────┘
                    │
                    ▼  (user clicks)
                dispatch(msg)
                    │
                    ▼
            runtime's update loop
```

`h.ts` covers the top half: VNode data + the render step that produces
DOM. It knows **nothing** about:

- what `Model` looks like (runtime's job, Step 3)
- what `update` does (app's job, Step 5)
- how commands / HTTP work (`cmd.ts`, Step 4)
- when to call `render` (`runtime.ts`, Step 3)

That isolation is deliberate. `h.ts` only cares about one question:
*given a VNode and a dispatch function, produce matching DOM.*

---

## Step 3 — `src/runtime.ts` + `src/cmd.ts` (core)

### What we built

Two files. `cmd.ts` defines the `Cmd<Msg>` type + `none` + `batch`.
`runtime.ts` defines the `Program<Model, Msg>` type + a `run` function
that mounts an app and drives the update loop.

### `Cmd<Msg>` — the simplest possible encoding

```ts
export type Cmd<Msg> = (dispatch: (msg: Msg) => void) => void;
```

A command **is** a thunk. It closes over whatever it needs (a URL, a
body, a `toMsg` callback) and calls `dispatch` when its side effect
finishes. That's it.

Why this shape?

- **Opaque to the runtime.** The runtime never inspects a Cmd. It just
  calls `cmd(dispatch)`. This means we can add new effect types
  (`Http`, `Random`, `Time`, `Storage`, ...) without ever touching
  `runtime.ts`. The runtime only knows "here's a thing to run, here's
  dispatch, go."
- **Composes cheaply.** `batch` is a one-liner: a thunk that calls every
  child thunk. `none` is `() => {}`.
- **Async-friendly.** A thunk can kick off a fetch, return immediately,
  and dispatch later when the promise resolves. The runtime doesn't care.

`none` is typed `Cmd<never>`, which is assignable to `Cmd<Msg>` for any
`Msg` because of how function contravariance plays out on the Msg
parameter. No cast needed.

### `Program<Model, Msg>` — the shape of a TEA app

```ts
type Program<Model, Msg> = {
  init:   () => [Model, Cmd<Msg>];
  update: (msg: Msg, model: Model) => [Model, Cmd<Msg>];
  view:   (model: Model) => VNode<Msg>;
};
```

One-to-one mirror of Elm's `Browser.element` without subscriptions.
`init` gives you a starting model + an optional startup command (useful
if you want to fetch something before the user does anything). `update`
is pure: same msg + same model → same `[newModel, cmd]`. `view` is
pure: same model → same VNode.

### `run` — the loop

The loop is five lines stretched across a safety net. Ignoring the
queue for a moment:

```ts
let model: Model;
const dispatch = (msg) => {
  [model, cmd] = update(msg, model);
  render(view(model), root, dispatch);
  cmd(dispatch);
};
[model, cmd0] = init();
render(view(model), root, dispatch);
cmd0(dispatch);
```

That's the entire Elm architecture in ten lines.

### Why the msg queue exists

Consider this scenario: `update` returns a synchronous `Cmd` that, when
called with `dispatch`, immediately calls `dispatch(anotherMsg)` before
returning. Without a queue, we'd recurse:

```
dispatch(A)
  update(A) → [m1, cmdA]
  render
  cmdA(dispatch)
    dispatch(B)         ← re-entrant, still inside dispatch(A)
      update(B) → [m2, cmdB]
      render
      cmdB(dispatch)
        ...
```

Two problems:
1. **Stack pressure** — a chain of sync msgs could overflow.
2. **Weird ordering** — we'd render `m1` then immediately render `m2`
   over top of it, meaning the user never sees `m1`. Worse, if `cmdA`
   dispatches *after* doing something that depends on the model having
   been committed, the interleaving gets confusing.

The queue fixes both:

```ts
const queue: Msg[] = [];
let processing = false;

const dispatch = (msg) => {
  queue.push(msg);
  if (processing) return;   // someone up the stack is already looping
  processing = true;
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    [model, cmd] = update(next, model);
    render(view(model), root, dispatch);
    cmd(dispatch);   // may enqueue more, that's fine
  }
  processing = false;
};
```

Now `dispatch(B)` inside `cmdA` just pushes onto the queue and returns.
The outer loop sees `B` on its next iteration and handles it normally.
Bounded stack, ordered processing.

Async cmds (fetch) never trigger this at all — their `dispatch` call
happens long after the outer loop has exited, so they just start a
fresh loop of their own. The queue is there for the synchronous edge
case, not the common case.

### `noUncheckedIndexedAccess` footnote

`queue.shift()` returns `Msg | undefined`. The `if (next === undefined)
break` line exists purely to satisfy the compiler — the `while
(queue.length > 0)` guard already guarantees `next` is defined at
runtime. Annoying, but I prefer writing the `break` over a
non-null-assertion `!`.

### What `runtime.ts` still doesn't do

- **No subscriptions.** Elm has `Sub msg` for keeping a long-lived ear
  on things (WebSocket, Time.every, keyboard events). We don't need
  this for GitHub user lookup. Easy to add later — another field on
  `Program`, re-subscribed on every model change.
- **No navigation.** Elm's `Browser.application` wraps URL changes into
  msgs. Not needed here.
- **No view memoization.** We re-render the whole tree every time.
  Still naive on purpose.
- **No error boundary.** If `update` or `view` throws, the runtime
  crashes. I'd rather see the stack trace while learning.

---

## Step 4 — `src/result.ts` + `src/http.ts`

### Why `Result<T, E>`

Failure belongs in the type system, not in thrown exceptions. If a
caller can tell from a function's return type that it might fail, they
can't forget to handle it — the compiler won't let them destructure
`.value` without first checking `.ok`.

```ts
type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Two tiny constructors:

```ts
ok<T>(v: T):  Result<T, never>
err<E>(e: E): Result<never, E>
```

The `never` tricks matter. `ok("hi")` has type `Result<string, never>`,
which is assignable to `Result<string, HttpError>` — because `never` is
a subtype of every type, so a `Result` that *cannot* carry an error
slots into a context that *might* carry one. Same on the `err` side.
No casts, no generics on the caller.

### Why split `HttpError` into three cases

```ts
type HttpError =
  | { kind: "network" }
  | { kind: "status"; status: number; body: string }
  | { kind: "decode"; message: string };
```

Each one is a fundamentally different situation and the UI should react
differently to each:

- **`network`** — the browser couldn't reach the server at all. DNS,
  offline, CORS preflight failure. Message: "check your connection".
- **`status`** — server answered, but said no. For the GitHub lookup
  app, `status === 404` is the very common "user not found" case and
  deserves its own friendly UI, distinct from a real 500.
- **`decode`** — we got a 200 OK with a body, but the body didn't match
  what we expected. Usually indicates an API change or a bug in our
  decoder. Message: "bad response from server".

Flattening all three into a single "something went wrong" would lose
information the view wants.

Note: **`fetch` only rejects on `network`.** A 404 or 500 resolves
normally and you have to check `response.ok` yourself. People get burnt
by this all the time. `Http.get` hides the footgun — by the time the
`toMsg` callback sees the result, all three cases are classified
correctly.

### `Http.get` API

```ts
Http.get({
  url:    "https://api.github.com/users/elm",
  decode: (raw) => decodeUser(raw),          // unknown → User, may throw
  toMsg:  (result) => ({ tag: "GotUser", result }),
})
```

Three fields:

- **`url`** — self-explanatory.
- **`decode: (unknown) => T`** — the pragmatic TS equivalent of Elm's
  `Json.Decode`. No combinator library; just a function that narrows
  `unknown` to a known shape. It's allowed to `throw` — `Http.get`
  catches and converts thrown errors into `{ kind: "decode" }`. Keeping
  decoders as plain functions lets you write them however you want
  (hand-rolled, zod, valibot, whatever) without coupling `http.ts` to
  any library.
- **`toMsg: (Result<T, HttpError>) => Msg`** — wraps the result in a
  domain message the app understands. The caller decides what to call
  it (`GotUser`, `GotRepos`, ...), which keeps `Http.get` fully generic
  over `Msg` and `T`.

### Effect modules are the extensibility story

`http.ts` is the first demonstration of how the architecture scales.
`cmd.ts` stays small and generic (the `Cmd<Msg>` type), and every new
kind of side effect is its own module that *produces* `Cmd` values:

```
         cmd.ts  (Cmd<Msg> core)
           ▲  ▲  ▲  ▲
           │  │  │  │
       http.ts random.ts time.ts storage.ts  ...
```

`runtime.ts` never needs to know any of them exist. Adding `Storage` or
`Random` later means writing one file and importing it from app code —
zero runtime changes. This is exactly how Elm's stdlib is organized.

### Namespace convention: `import * as Http`

In app code:

```ts
import * as Http from "./http.js";

Http.get({ ... });
```

Reads like Elm. Alternative would be `import { get } from "./http.js"`
and calling bare `get(...)`, but that conflicts with other `get`s. The
`* as Http` form is worth the extra eight characters.

---

## Step 5 — `src/main.ts` (the app)

### Make impossible states impossible: `FetchState`

The instinct in JS/TS is to model async state as a bag of optionals:

```ts
type Model = {
  loading: boolean;
  user: GhUser | null;
  error: HttpError | null;
};
```

This allows nonsense combinations: `loading: true` *and* `user` set, or
`user` set *and* `error` set. The view then has to guess which one
"wins" and you end up writing conditionals like `if (model.loading)
... else if (model.error) ... else if (model.user) ...`, which is both
ugly and has silent bugs.

Discriminated union instead:

```ts
type FetchState =
  | { kind: "idle" }
  | { kind: "loading"; username: string }
  | { kind: "success"; user: GhUser }
  | { kind: "error"; username: string; error: HttpError };
```

Each state carries **exactly** the data it needs, no more. The view
switches on `kind` and the compiler checks exhaustiveness. Adding a
`"retrying"` state later means one more case in the switch — and the
compiler tells you everywhere you forgot to handle it.

This is Parse-Don't-Validate applied to UI state.

### Messages have a `tag`, not a `type`

```ts
type Msg =
  | { tag: "QueryChanged"; query: string }
  | { tag: "SearchClicked" }
  | { tag: "GotUser"; result: Result<GhUser, HttpError> };
```

Why `tag` and not `type`? Because `type` is reserved for props on DOM
nodes (`<input type="text">`). Using `tag` keeps domain messages
visually distinct from DOM attributes in the view code and avoids
accidental collision if a msg ever carries a `type` field of its own.

### The async msg pattern: `GotX { result: Result<T, E> }`

```ts
{ tag: "GotUser"; result: Result<GhUser, HttpError> }
```

`Http.get` doesn't know about your Msg type — it's generic. The caller
provides a `toMsg: (Result<T, E>) => Msg` that wraps the result into a
domain-specific message. Here it's just:

```ts
toMsg: (result) => ({ tag: "GotUser", result })
```

The `update` function switches on `result.ok` to pick the success or
error branch. **The side effect happens outside, the result comes back
as a msg, the transition is pure.** That one-liner is the entire story
of how TEA handles async.

### Exhaustiveness via `const _: never = msg`

At the end of every switch on a discriminated union:

```ts
default: {
  const _exhaustive: never = msg;
  throw new Error(...);
}
```

If I later add a new variant and forget to handle it, `msg` won't be
`never` in the default branch and the assignment fails at **compile
time**. The compiler catches the missing case for free. Cheap,
effective, the canonical TS pattern.

### Recovering the attempted username on error

When `GotUser` comes back with an error, we want the view to say
`User "foo" not found.`, not `User "" not found.`. But the `Result`
only carries the *response*, not the *request* URL or username.
Where does `"foo"` come from?

Answer: the model. When we dispatched the fetch, we put the model into
`{ kind: "loading"; username: "foo" }`. By the time the error comes
back, `model.fetchState.kind === "loading"` and `model.fetchState.username`
is still `"foo"`. We pull it out there:

```ts
const username =
  model.fetchState.kind === "loading" ? model.fetchState.username : "";
```

Lesson: **async requests often need to carry enough state for their
own response handling**. In Elm, a common idiom is `Cmd.map` and
`Task.andThen`; here we just stash the needed bit in the model until
the response comes back.

### Controlled input = keystroke loop

```
user types "t"
 → DOM input fires "input" event
 → handler dispatches QueryChanged { query: "t" }
 → update returns new model with query = "t"
 → render(view(model))   ← re-renders the entire tree
 → input element is destroyed and recreated with value="t"
 → focus is LOST (new element, no focus)
```

This is the penalty for naive full-rebuild rendering and for
controlled inputs. **Typing in the search box will be unusable** — the
cursor jumps out after every keystroke. This is the first concrete
pain from "make `render` dumb on purpose".

Two ways to fix it:

1. **Cheap hack** — after render, find the input by id and
   `.focus()` + restore selection range. Couples app and runtime,
   gross.
2. **Real fix** — diff/patch: `render` compares old and new VNode
   trees and only touches the DOM where they differ. When the input
   tag+attrs are the same, the live DOM element is reused, focus is
   preserved. This is what React/Elm/snabbdom all do, and it's a
   whole new step's worth of work.

We'll feel the bug in Step 6, then pick a path.

### CSS lives in `index.html`

Minimal style block inline in `index.html`. Zero CSS tooling, zero
build pipeline. Good enough for a learning project. If this grew into
a real app, CSS would become its own story (modules, Tailwind,
whatever).

---

## Step 7 — `src/h.ts` gets a real vdom diff

### Why we did this

Step 5's predicted focus-loss bug landed the moment we opened the app.
Every keystroke rebuilt the entire DOM, including the `<input>`, so
the browser focus had nothing to cling to and jumped out. The naive
`render` earned its tuition. Now we upgrade it.

**Only `h.ts` changed.** No files outside the vdom layer had to move —
that's the payoff of keeping `VNode<Msg>` as the contract.

### The patch algorithm (four cases)

```
patch(oldVNode, newVNode, node, parent, dispatch) -> Node

  1. text → text (same kind)
     if oldText != newText: node.textContent = newText
     reuse node

  2. element → element, same tag
     patchAttrs(node, oldAttrs, newAttrs)
     patchChildren(node, oldChildren, newChildren)   # recursive
     reuse node

  3. element → element, different tag
  4. text ↔ element
     fresh = build(newVNode)
     parent.replaceChild(fresh, node)
     return fresh
```

Case 2 is the important one: **the live DOM element stays put.** Its
focus, selection, scroll position, `<details>` open state, video
currentTime — all preserved. We only touch the fields that differ.

### Attribute patching

Two passes:

```ts
// gone from new → remove
for ([key, oldVal] of oldAttrs)
  if key not in newAttrs: removeAttr(el, key, oldVal);

// new or changed → apply
for ([key, newVal] of newAttrs)
  if newVal !== oldVal || typeof newVal === "function":
    applyAttr(el, key, newVal);
```

Handlers force refresh because inline closures never compare equal, but
refresh-handler is cheap (see next section).

### The event-handler trick (the key design point)

The obvious approach — `addEventListener` in `applyAttr`,
`removeEventListener` in `removeAttr` — breaks or leaks if the old
handler function isn't the exact same reference, which it never is for
inline closures.

So we stop trying to attach/detach real listeners on every render.
Instead we store the current handler in a slot on the element itself,
reached via a private symbol:

```ts
const HANDLERS = Symbol("ts-tea.handlers");

// Schematic: the element carries
//   el[HANDLERS] = { click: fn, input: fn, ... }
```

On first encounter with `(element, eventName)`, we register **one**
real listener. That listener is a stable wrapper that reads the current
handler from the slot on every event:

```ts
el.addEventListener("click", (event) => {
  const current = el[HANDLERS]?.click;
  if (current) dispatch(current(event));
});
```

Across renders we only mutate `el[HANDLERS][eventName]`. The real
listener is never removed, never re-added. The number of live DOM
listeners is bounded by `elements × distinct event types`, not
`renders × handlers`. Leaks are impossible — the slot dies with the
element when it's removed from the tree.

This pattern is how snabbdom and friends handle events. It feels like
a party trick the first time you see it, but it's the right move.

### Children patching (index-based, no keys)

```ts
common = min(oldCh.length, newCh.length)
for i in 0..common:
  patch(oldCh[i], newCh[i], parent.childNodes[i], parent)
while parent.childNodes.length > newCh.length:
  removeChild(parent.lastChild)
for i in common..newCh.length:
  appendChild(build(newCh[i]))
```

This is **position-based** diffing. If you prepend to a list, every
child gets patched because their indices shifted. For small trees
(our GitHub lookup) this is a non-issue. For large dynamic lists, real
vdom libs use **keyed children** — a user-supplied `key` on each
sibling — to match up nodes across renders by identity instead of
position. That's a worthwhile future upgrade, not needed yet.

### State persistence across renders

`render` needs to remember the previous VNode to diff against. I stash
it on the mount element behind another symbol:

```ts
parent[PREV] = { vnode: currentVNode, node: rootDomNode };
```

First `render` call sees no `PREV` → builds and mounts. Every
subsequent call reads the previous state, diffs, writes the new state.
Clean, no module-level globals, multiple mounts on the same page would
each have their own slot.

### Attribute removal is hand-wavy

When we need to remove a property (e.g. the VNode no longer has
`disabled: true`), we don't know the element's original default. We
reset to a neutral-for-the-type value:

```ts
typeof oldValue === "boolean" → false
typeof oldValue === "number"  → 0
otherwise (string)            → ""
```

This handles `disabled → false`, `value → ""`, `tabIndex → 0`, the
common cases. It would mis-handle something like "reset `href` back to
the attribute the HTML parser set originally" — but we don't have that
case. Noted as a rough edge; not worth fixing until it bites.

### What the diff does NOT do (yet)

- **No keyed children.** Position-based only.
- **No component boundaries or memoization.** The whole tree is walked
  every render. Elm has `Html.Lazy` for this; we don't need it.
- **No event namespace isolation.** `onClick` always means `click`; no
  `capture` phase, no `passive`, no listener options. Adding these
  means extending the attr encoding (`onClick` vs `onClickCapture`).
- **No SVG / foreign namespace handling.** `createElement` defaults to
  HTML namespace. For SVG we'd need `createElementNS`.
- **No component state.** Everything is driven from `Model`. That's
  TEA; it's a feature, not a gap.

---

## Step 8 — v2 rewrite (imperative / carousel style)

### Why

After Step 7 the app worked, but it felt bloated for what it is.
Comparing to a real-world production component
(`articlesnapshotherocarousel.ts` in the kforce project) revealed that
**the production code is TEA too** — same Model/Msg/Cmd/update/view
architecture — but it strips out all the SPA-runtime infrastructure
that ts-tea v1 built from scratch:

- no vdom (the HTML exists server-side)
- no `Cmd` thunks (Cmd is data, interpreted by `executeCmd`)
- no generics (concrete types for one app)
- no separate runtime/http/result modules (everything inline)

That's a fundamentally different engineering tradeoff, and worth
feeling directly rather than debating in the abstract. So Step 8 is
a full side-by-side rewrite of the GitHub lookup app in that style.

### What v2 looks like

- `v2.html` — static HTML shell with `data-hook="..."` attributes
  marking every element JS needs to touch, and pre-rendered result
  panels (`idle`, `loading`, `error`, `success`) toggled by a
  `data-state="..."` attribute on the container. CSS shows one panel
  at a time.
- `src/v2/main.ts` — **one file**, ~260 lines excluding the HTTP
  interpreter and decoder, ~394 lines total. No imports from v1's
  modules. Top-to-bottom readable.

Everything v1 had across 6 files lives in this one file:

- `Model`, `Msg`, `Cmd`, `FetchState` — concrete discriminated unions,
  no generics.
- `init`, `update`, `view` — same shapes as v1.
- `view(model) → ViewState` — a *data projection*, not a vdom. Just
  the fields `render` cares about, with pre-computed flags like
  `canSubmit` and `isLoading`.
- `render(vs, refs)` — direct DOM mutation. Flips
  `refs.result.dataset.state`, sets `refs.submit.disabled`, pokes
  `textContent` / `src` / `href` / `classList` on specific elements.
  **Does not touch the input.**
- `executeCmd(cmd, dispatch)` — switch over the `Cmd` data union.
  The `fetchUser` case inlines `fetch` + decoder + result dispatch
  (~30 lines) — no `Http` module.
- `mount(root)` — query refs, set up `let model`, define a 5-line
  `dispatch`, attach listeners, initial render + cmd.

### Why it's simpler — specifically

**1. No vdom because the DOM pre-exists.**
`v2.html` has the full static structure: the form, the four result
panels, the user card template with empty `data-hook` targets. JS
never *creates* DOM. `render` only *mutates* pre-existing nodes. This
kills a whole universe of concerns: reconciliation, keyed children,
focus preservation, event rebinding, property-vs-attribute.

**2. Cmd as data (not a thunk) is more Elm-faithful.**
v1's `Cmd<Msg> = (dispatch) => void` was cute but opaque.
v2's `Cmd = { type: "none" } | { type: "fetchUser"; username: string }`
is a *visible enumeration* of every side effect this app can request.
You can log it, serialize it, test it, replay it. `executeCmd` is the
interpreter — the only place side effects actually happen. Adding a
new effect means adding a variant + a case. Compile-time exhaustive,
transparent.

**3. No generics.**
There's one app. One `Msg`. One `Model`. v1 carried `<Model, Msg>`
parameters through `VNode`, `Cmd`, `Program`, `Handler`, `Attrs`,
`run` — all so `runtime.ts` could theoretically be reused across
apps. v2 drops that entire layer. Every type is concrete; every
signature is shorter.

**4. Uncontrolled input.**
v1 wrote the input's `value` on every render, which is what triggered
the Step 5/6 focus-loss bug (which we then fixed with a 230-line
vdom diff). v2's render never touches `refs.input.value`. The browser
is the source of truth for the live input value; we read it on
events. **Focus preservation is free.** The whole class of bug
doesn't exist.

**5. All of it fits in one file.**
You can read `src/v2/main.ts` top-to-bottom in a single sitting,
follow every dispatch call to its handler, and see every side effect
enumerated. No jumping between `runtime.ts`, `cmd.ts`, `http.ts`.

### Line counts

| | TS lines | TS files | HTML lines |
|---|---|---|---|
| **v1** | 714 | 6 | 73 |
| **v2** | 394 | 1 | 112 |

v2's HTML is longer because the content template lives in HTML — but
that's content, not logic. The TS is 55% the size of v1 and lives in
one place.

### What v2 gives up

**You can only hydrate pre-existing HTML.**
v2 assumes something renders the static shell — a server, a build
step, or a hand-written HTML file. For apps where the whole UI is
generated client-side from data (e.g. "render a list of N items,
where N is unknown until runtime, and each item has a variable
number of children"), the HTML shell approach doesn't work — you
*need* to create nodes at runtime, which means you need a way to
describe them, which is a vdom.

Dynamic-list territory is where vdoms start to pay off. A static list
with a known max size (e.g. three tabs, five filter buttons) can
still be handled with pre-rendered HTML and `hidden`/`display: none`
toggling. Unbounded lists (search results, chat messages, infinite
scroll) effectively force some kind of DOM generation.

### The general lesson

TEA is an **architecture**, not an infrastructure.
The architecture is: one-way dispatch, pure update, pure view, Cmd
for side effects. *Everything else* — vdom, Http module, Result type,
generic Program, separate runtime — is *optional infrastructure* that
you add only when your problem actually needs it.

- **SPA rendered from JSON on the client?** You need a vdom.
- **Component enhancing server-rendered HTML?** You don't.
- **Dozens of apps sharing a runtime?** Generics + separate runtime.
- **One app?** Concrete types, inline loop.
- **Lots of effect types?** Effect modules.
- **One effect type?** Inline in `executeCmd`.

v1 was useful because it taught us what all that infrastructure
*does*. v2 is useful because it shows which parts you can *throw
away* when the problem doesn't demand them. Both are TEA. The
architecture doesn't care which you pick.

### How to run v2

Same flow as v1:

```bash
npx tsc -p . --watch           # one terminal
python3 -m http.server 8000    # another terminal
# open http://localhost:8000/v2.html
```

Both `index.html` (v1) and `v2.html` (v2) compile together under the
same `tsconfig.json` and live in the same `dist/` tree (`dist/main.js`
vs `dist/v2/main.js`). No conflict, no extra build setup.

---

## Step 9 — benchmark (`bench.html`)

`bench.html` mounts both v1 and v2 off-screen (absolute-positioned at
`left: -9999px`) and times `QueryChanged` dispatches by firing synthetic
`input` events at each version's input element. 5000 iterations per run,
6 runs interleaved so transient JIT/GC noise hits both versions equally.

Reports per-dispatch average + best-run, plus a speedup ratio
(`v1_time / v2_time`). Expectation going in: v2 should be ~5–30x faster
per dispatch, mostly from not allocating a VNode tree and not running
diff/patch on every keystroke.

**Caveat on interpretation:** for a form-sized app, both versions are
fast enough that a human typing at ~5 events/sec can't perceive the
difference. The gap shows up in animation-frame loops, drag handlers,
or apps with hundreds of nodes re-rendering per second. The point of
the benchmark isn't "v2 is the faster one, pick it" — it's "the SPA
runtime infrastructure has a measurable cost even when it's never
stressed." That cost is acceptable for an actual SPA and excessive for
a component enhancing server-rendered HTML.

**Not run yet** — run `bench.html` in the browser, paste the numbers
into this section when they arrive.

---

## Exploration → production framing

Originally started as a "learning project to understand what the Elm
runtime does for you." Partway through Step 8, the frame shifted: the
patterns this exploration produces are going to land in real production
TypeScript components. From that point forward, every design decision
should be evaluated on production criteria, not pedagogical ones.

**What that means concretely:**

1. **v2 is the target shape.** v1 exists only as a "this is what the
   full runtime costs" counterpoint. Production work copies from v2.
2. **No pedagogical shortcuts survive.** Debug `console.log`s, throw-
   on-missing-element helpers, hard-coded URLs, single-slot fetch
   management — all of these are fine for the explore but have to go
   (or be generalized) before the shape lifts into prod.
3. **The boot path is scaffolding, not the product.**
   `v2.html`'s `DOMContentLoaded` wiring exists because the explore
   host is a static HTML file. The real production host will be a CMS
   widget loader, a component lifecycle, a router, a modal — whatever
   it is, it will call `mount(root, config)` and later call the
   returned dispose function. The exploration's job is to produce that
   `mount → dispose` contract as cleanly as possible.
4. **Memory leak categories that are theoretical for a static page
   become real in a hosted lifecycle.** Pending fetches need abort.
   Re-mount must not stack listeners. Stale responses must not win
   races. All three are addressed in Step 10.

---

## Step 10 — v2 production hardening

Three changes landed in `src/v2/main.ts`. All three are required
before the v2 pattern is safe to copy into a production host.

### 10a — `mount` returns a dispose function

**Before:** `mount(root: HTMLElement): void` — listeners attached,
nothing exposed for cleanup.

**After:** `mount(root: HTMLElement): () => void` — returns a function
that removes both listeners and aborts any in-flight fetch. Safe to
call once per mount; idempotent afterward because `fetchSlot.current`
is nulled out.

Handler functions (`onInput`, `onSubmit`) are now hoisted into named
local variables inside `mount` so they're referenceable for
`removeEventListener`. The previous inline-arrow style was
unremovable.

**Why production needs this:**

- SPA router: mount on route enter, dispose on route leave. Without
  dispose, leaving the route leaks listeners + any pending fetch
  continues and dispatches into a dead closure.
- Hot module reload: dev-mode HMR replaces the module; without dispose
  you get doubled event listeners on every save until a full refresh.
- Tests: `beforeEach` mounts, `afterEach` disposes. Otherwise every
  test leaks into the next.

The current boot (`onReady` → `mount(root)` with the return discarded)
stays, but is now explicitly scaffolding. Production host replaces
`onReady` entirely.

### 10b — `AbortController` slot in `executeCmd`

**Before:** `executeCmd(cmd, dispatch)` — fetches were fire-and-
forget. A second submit while the first was still loading meant two
concurrent fetches with no ordering guarantee; whichever resolved
last wrote to `Model.fetchState`.

**After:** `executeCmd(cmd, dispatch, fetchSlot)` where
`fetchSlot: { current: AbortController | null }` is per-mount state.
Each new `fetchUser` calls `fetchSlot.current?.abort()` before
starting its own, so:

- The previous fetch's `AbortError` skips dispatch via
  `if (ac.signal.aborted) return`.
- Only the most recent submission can ever reach `gotUser`.
- Dispose can abort the in-flight fetch cleanly — no ghost dispatch
  after unmount.

**Known limitation:** `fetchSlot` is a *single* slot. Scales to one
concurrent request. Components with multiple independent fetches
(user + user's repos, for example) need a
`Map<RequestKey, AbortController>` keyed by request identity. Flagged
as Known Gap #6 below.

### 10c — Error classification split into separate try blocks

**Before:** one `.then(async response => ...).catch(() => network)`
chain where network / status / decode errors were entangled. Any
`.catch()` would report "network error" regardless of actual cause.

**After:** three distinct try regions inside a single IIFE:

```ts
(async () => {
  let response: Response;
  try {
    response = await fetch(url, { signal: ac.signal });
  } catch {
    if (ac.signal.aborted) return;
    dispatch({ ..., error: { kind: 'network' } });
    return;
  }

  if (!response.ok) {
    dispatch({ ..., error: { kind: 'status', status: response.status } });
    return;
  }

  try {
    const raw = await response.json();
    const user = decodeUser(raw);
    dispatch({ ..., result: { ok: true, value: user } });
  } catch (e) {
    if (ac.signal.aborted) return;
    dispatch({ ..., error: { kind: 'decode', message: errMsg(e) } });
  }
})();
```

Each error variant is now produced by exactly one path. Aborted
responses are silently dropped in both catch regions.

**Why production needs this:** telemetry. A single aggregated "fetch
failed" metric is useless — you need to distinguish DNS/CORS failures
(network) from 4xx/5xx (status) from API shape drift (decode). The
three categories go to different dashboards and page different
on-calls.

### What did NOT change

- `update` stays pure (aside from the debug `console.log` flagged as
  Known Gap #3).
- `view` / `render` stay untouched.
- No new files. The hardening lives entirely inside `src/v2/main.ts`.

---

## Known gaps before lifting v2 shape into production

These are flagged as blockers for copying the v2 pattern into any
production host. None of them are blockers for continuing the
exploration itself. Addressed roughly cheapest-first.

**#1 — `queryRefs` throws raw `Error` on missing element.**
Right now:
```ts
if (el === null) throw new Error(`v2: missing required element ${sel}`);
```
In production, a missing DOM element should surface through the host's
telemetry pipeline, not crash the page with an uncaught exception.
Options:
- typed error (`class MountError extends Error`) + host catches at
  the `mount(root, config)` boundary;
- logger injection in config so `queryRefs` can report-and-bail
  without throwing at all.
Either is cheap. Pick one based on how the host wants to see errors.

**#2 — `decodeUser` throws stringy `Error`s with field names.**
```ts
throw new Error(`field "${key}" must be a string`);
```
Telemetry can't aggregate "field X missing" across users without
string-matching on `e.message`. The decoder should return
`Result<GhUser, DecodeError>` where `DecodeError` is a structured
discriminated union (`missingField(key)`, `wrongType(key, expected)`,
etc.). Then `executeCmd`'s decode-branch dispatches the structured
error into `HttpError.decode`, and the host gets clean categorization.

**#3 — Debug `console.log('searchSubmitted', model)` in `update`.**
Added during the "why doesn't my log fire?" session (answer: stale
`dist/`). It works now, but it has to come out before production.
`update` must be pure — no I/O, no side effects, no logs. Logging
that belongs during production investigation goes into a dedicated
`Cmd.log(message)` variant interpreted by `executeCmd`, which keeps
`update` fully testable and replay-safe.

Note: there's also a `console.log(e)` in the submit event listener
inside `mount` — leftover from the Enter-key-not-firing debug
(which turned out to be a browser extension). Same treatment: delete
before prod.

**#4 — Hard-coded API base URL.**
```ts
const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
```
Production must inject config:
```ts
mount(root, {
  apiBase: string,
  authHeaders?: Record<string, string>,
  logger: (event: LogEvent) => void,
  // ...
});
```
Config threads into the closure `executeCmd` already closes over, so
no architectural change — just a signature update on `mount` and
propagation through.

**#5 — No debounce Cmd.**
Not needed for the GitHub lookup (submit is explicit). But any future
component with live-search (fetch on every `queryChanged`) needs a
debounce. Pattern:
```ts
type Cmd =
  | { type: 'none' }
  | { type: 'fetchUser'; username: string }
  | { type: 'debounce'; key: string; ms: number; then: Msg };
```
Interpreter holds a `Map<string, number>` of pending timers keyed
by debounce key; each new debounce clears the previous timer under
the same key. The abort logic from Step 10b is what makes the
debounced fetch correct (the old fetch must cancel when the new one
fires).

**#6 — `fetchSlot` is a single slot.**
```ts
type FetchSlot = { current: AbortController | null };
```
Handles one concurrent request. Scale to multiple independent fetches
by generalizing to:
```ts
type FetchSlots = Map<string, AbortController>;
// keyed by RequestKey or Cmd discriminator
```
Not needed until a component fires two fetches that shouldn't cancel
each other. When it is, the Step 10 pattern should already be written
in terms of a `FetchSlots` map so the change is mechanical.

---

## Step 11 — v3 (signals) as architectural alternative

After v1 (vdom TEA) and v2 (imperative TEA) had been compared on the
same problem, the question shifted from "which TEA shape?" to "is TEA
even the right control model?" v3 was built to answer that with a
genuinely different architecture, not another TEA variant.

### Why signals as the third point of comparison

The two architectural axes that distinguish reactive shapes:

- **Where transitions are made explicit.** TEA puts every transition
  in `update`: one switch over `Msg`, every state change visible in
  one place. The cost is that *data flow* is implicit — you grep the
  view to find who reads `model.status`.
- **Where dependencies are made explicit.** Signals invert that:
  every `effect`/`computed` literally reads the signals it depends
  on at the call site. The cost is that *transitions* are scattered
  — there is no single place that enumerates "these are the ways
  state can change."

Both are valid; which one bites you depends on whether your bugs come
from missed state updates (TEA wins) or tangled data flow (signals
win). v3 exists to make that tradeoff concrete instead of theoretical.

### What v3 looks like

`src/v3/main.ts`, served by `v3.html`. One file. Same UX as v1/v2,
zero runtime deps, ~40 lines of reactive primitives + the GitHub
lookup app on top.

The reactive core:

```ts
let currentEffect: Runnable | null = null;

const signal = <T>(initial: T) => {
  let value = initial;
  const subs = new Set<Runnable>();
  return {
    get: () => {
      if (currentEffect && !currentEffect.disposed) {
        subscribe(currentEffect, subs);
      }
      return value;
    },
    set: (next: T) => {
      if (Object.is(value, next)) return;
      value = next;
      for (const r of [...subs]) if (!r.disposed) r.execute();
    },
    peek: () => value,
  };
};

const effect = (fn: () => void) => {
  const running: Runnable = {
    execute: () => {
      if (running.disposed) return;
      cleanup(running);
      const prev = currentEffect;
      currentEffect = running;
      try { fn(); } finally { currentEffect = prev; }
    },
    deps: new Set(),
    disposed: false,
  };
  running.execute();
  return { dispose: () => { cleanup(running); running.disposed = true; } };
};

const computed = <T>(fn: () => T) => {
  const s = signal<T>(undefined as unknown as T);
  const e = effect(() => s.set(fn()));
  return { get: s.get, dispose: e.dispose };
};
```

### The whole magic is one variable

`currentEffect` is a module-level pointer. `effect(fn)` parks itself
in `currentEffect`, runs `fn`, clears it. While `fn` is running, any
`signal.get()` reads `currentEffect` and adds that effect to its own
`subs` set. Auto-tracking, no `subscribe()` calls in user code.

When `signal.set(next)` runs, it walks `subs` and re-executes each
effect. Each re-execution re-parks itself in `currentEffect` and
re-reads its signals — so dependencies are *re-discovered every run*.
That's what makes effects with conditional reads (read signal A, then
maybe read signal B depending on A's value) work correctly: B's
subscription is added/removed automatically as the conditional flips.

The `cleanup` function walks `running.deps` (a `Set<Set<Runnable>>`
of every signal-`subs` set the effect is subscribed to) and removes
the running effect from each. Called at the start of every re-run
and on dispose.

Three subtle correctness rules baked into the primitives:

1. **`Object.is` equality check in `set`** — skip the work entirely
   if the value didn't actually change. Without this, every
   `query.set(input.value)` on every keystroke would re-fire effects
   even if the user typed the same character somehow.
2. **Snapshot before iterate in `set`** — `for (const r of [...subs])`
   not `subs.forEach`. Effects re-run, which calls `cleanup` which
   mutates `subs`. Iterating a `Set` you're mutating is undefined
   behavior; the snapshot gives you a stable list.
3. **`disposed` flag on every `Runnable`** — `cleanup` removes a
   running effect from its `deps`, but that effect might still be
   *inside* a `subs` snapshot from a parent `set` call already in
   progress. Checking `!r.disposed` before invoking it prevents
   dead effects from re-executing.

### What v3's mount looks like vs v2's

```ts
// v2: one Model record, one update fn, one render fn
const dispatch = (msg: Msg) => {
  const [next, cmd] = update(msg, model);
  model = next;
  render(view(model), refs);   // ← runs every dispatch, full switch
  executeCmd(cmd, dispatch, fetchSlot);
};

// v3: independent atoms, N small effects, no central dispatch
const query      = signal<string>('');
const fetchState = signal<FetchState>({ kind: 'idle' });
const canSubmit  = computed(() => fetchState.get().kind !== 'loading'
                                && query.get().trim() !== '');
const isLoading  = computed(() => fetchState.get().kind === 'loading');

effect(() => { refs.submit.disabled = !canSubmit.get(); });
effect(() => { refs.input.disabled  =  isLoading.get(); });
effect(() => { refs.result.dataset.state = fetchState.get().kind; });
effect(() => { /* loading-username — only runs in loading state */ });
effect(() => { /* error-message  — only runs in error state */ });
effect(() => { /* user card      — only runs in success state */ });
```

There is no `dispatch`. There is no `update`. The submit handler
calls `fetchState.set({ kind: 'loading', username })` directly and
the effects that read `fetchState` re-fire. Side effects (the actual
`fetch` call) live in a plain function `startFetch(username)` that
the submit handler calls — no `Cmd` interpreter, no discriminated
union of effects. The async result writes back into `fetchState`
the same way.

### What v3 deliberately does NOT include

- **No `Msg` enum** — every "transition" is a direct `signal.set` at
  the call site. This is the central tradeoff: easier to add new
  state changes, harder to enumerate all state changes from one place.
- **No `Cmd` interpreter** — `fetch` is called directly from the
  event handler, not described as data and interpreted later. The
  `AbortController` slot is a plain `let inflight: AbortController
  | null = null`. Simpler. Loses the property that "all side effects
  are visible in one union."
- **No batching / scheduling** — `signal.set` synchronously re-runs
  subscribed effects. No microtask queue, no requestAnimationFrame
  coalescing, no glitch-free guarantees. Production reactive
  libraries (Solid, Preact signals) add a scheduler on top; this
  exploration intentionally does not, to keep the primitive pure.

### Module scope footnote

v2 and v3 are both flat files with no `import`/`export`. By default
TypeScript treats such files as scripts in global scope, so their
top-level identifiers (`selectors`, `mount`, `decodeUser`, etc.)
collide. Fix: `export {};` at the bottom of `v3/main.ts` forces it
into module scope. This is purely a tooling concern, not architectural.

### Step 11b — bench updated for v3

`bench.html` now mounts all three versions off-screen and reports
v1/v2/v3 timings + a winner block with margin %. Two complications
worth noting:

1. **Same selector collision as the typecheck.** v2 and v3 both use
   `[data-app="github-lookup"]` as their root selector. If both are
   loaded statically, `document.querySelector` returns the first
   match in tree order (v2's container) and v3 mounts on v2's
   already-mounted DOM, fighting for the same nodes.

   Fix: capture v2's input ref *after v2 has mounted*, then rename
   v2's container to `data-app="github-lookup--v2"` (safe — v2's
   own refs were captured inside its mount closure and don't depend
   on the attribute anymore), then `await import('./dist/v3/main.js')`
   dynamically. By the time v3's `onReady` runs, the only matching
   element is v3's own container.

2. **Winner reporting.** Two winners — one by `avg`, one by `best`.
   They can disagree:
   - `avg` is the steady-state characterization, includes all noise
     (JIT warmup, GC pauses, OS interference). The number a user
     would actually feel over time.
   - `best` is the minimum across runs, the theoretical floor when
     nothing got in the way. The number the code is *capable of*.
   - If `avg ≈ best`, the version is consistent.
   - If `avg >> best`, the version is spiky — usually fast but
     occasionally hitches. Bad sign for animation/deadline work.

### Central finding from running v3

**Signals are not a perf upgrade for component-sized work.** On
this hot path (`QueryChanged` while typing), v2 and v3 are within
noise of each other. v2's `render(vs, refs)` is one switch with
~3 DOM mutations and an early-exit on `idle`; there's almost
nothing for v3 to beat. v3 pays bookkeeping cost — `cleanup`
walking `deps`, `Set` operations, the `currentEffect` stack
manipulation, early-return effects still doing a `get()` to
subscribe — that eats whatever it would save by being more granular.

**Where signals would actually pull ahead:** an app with dozens
of independent state slices updating at different rates. v2's
monolithic `render` re-touches everything every dispatch; signals
only re-fire effects whose dependencies changed. The GitHub lookup
has *two* state slices and the input keystrokes only touch one of
them. Wrong shape to expose the difference.

**The honest signals pitch is ergonomic, not performance:**

- Dependencies are visible at the read site (no grep needed).
- Adding state doesn't require touching a central `update`.
- No `Msg` enum to maintain — direct `signal.set` calls at event
  handlers.

**The honest TEA pitch is auditable, not performance:**

- Every transition is in one place (`update`).
- All side effects are in one place (`executeCmd`).
- Time-travel debugging / replay is trivial (record `Msg` log).

For the **prod context** (CMS-injected progressive enhancement
components), v2 wins on every axis that matters — slightly faster,
more auditable, simpler dispose semantics, no shared mutable
`currentEffect` state. v3's job in this exploration is now to be
the *disproof* of "signals win on perf for components." That's a
more useful result than if it had won, because it lets us ignore
the hype next time someone pushes signals at us for the wrong
reason.

v3 is preserved, not deleted. It's the third reference point for
when a future component genuinely fits the reactive shape (many
independent atoms, fine-grained DOM updates). Until that component
shows up, v2 remains the production target.

### How to run v3

```sh
cd /Users/vadymkaravayev/my-own-repos/fp-lab/ts-tea
npx tsc
python3 -m http.server
# open http://localhost:8000/v3.html
# or http://localhost:8000/bench.html for the comparison
```

### Step 11c — the second finding: visible vs hidden complexity

After running v3 and reading it back, the immediate reaction was
"this is *more* complicated than v2, not less." That reaction is
correct, and naming why is the second major finding of this whole
exploration (the first being "TEA is architecture, not
infrastructure").

**v2's complexity is on the page. v3's complexity is in your head.**

Concretely:

- **v2 has zero infrastructure.** `update` is a switch. `render`
  is a switch. `executeCmd` is a switch. Three switches and a
  `dispatch` function. Every line you read tells you what's
  happening — there's no "runtime" you have to understand before
  the app code makes sense.

- **v3 has ~40 lines of primitives** (`signal`, `effect`,
  `computed`, `cleanup`, `Runnable`, the `currentEffect` global,
  the snapshot-iterate dance in `set`, the `disposed` flag check,
  the `Object.is` short-circuit) that you must keep loaded
  mentally to read *any* line of the app on top. The app code
  looks shorter; the cognitive surface is larger.

**The signals "simplification" is a trade, not a discount.** You
delete the visible ceremony — no `Msg` enum, no central `update`,
no `Cmd` interpreter — and replace it with invisible machinery.
The line count of the *app* shrinks; the line count of "things you
must understand to predict what happens" grows. That tradeoff only
pays off if (a) the invisible machinery is so well known that
nobody has to learn it (e.g. you're using Solid, not hand-rolling
it) AND (b) the app on top is large enough that the savings on the
app side dominate the cost of the runtime.

For a single-component, ~250-line app with two state slices,
neither condition holds. The runtime cost dominates everything.

**Worse: v3's machinery is shared mutable state.** `currentEffect`
is a module-level pointer that gets twiddled on every effect run.
The whole reactive trick depends on it. v2 has *no* shared mutable
state — every piece of state is named, scoped, and visible inside
its closure. The kinds of bugs that v3 enables and v2 forecloses:

- Nested effects clobbering each other's `currentEffect` (v3
  handles this with `prev = currentEffect; ...; currentEffect =
  prev` in `effect.execute` — but you have to *know* to handle it).
- Async work inside an effect body capturing `currentEffect` at
  the wrong moment (the auto-tracking only works during the
  synchronous portion of the effect; anything after `await` is
  invisible to the dependency graph).
- Re-entrant `set` calls during a `set` walking subscribers
  (handled by snapshot-before-iterate — but that's another rule
  the implementer must remember).
- Effects that subscribed to a signal in run #1 but not in run #2
  staying subscribed if `cleanup` is forgotten.

Every one of these is a hazard *introduced by* the reactive
runtime. They have no analogue in v2. v2's pure update / explicit
render lets the type checker prove correctness; v3 demands
runtime discipline that the type checker can't enforce.

**The honest hierarchy for component-sized work, in order of
"how much complexity does this impose":**

1. **v2 (imperative TEA)** — visible architecture, *no*
   infrastructure. The complexity floor for code that has *any*
   architecture at all. Shippable.

2. **v1 (vdom TEA)** — visible architecture *plus* a chunk of
   infrastructure (vdom + diff + generic runtime). Justified only
   if you need a real SPA with dynamic lists, many components,
   and a unified update loop across them.

3. **v3 (signals)** — minimal visible architecture, *hidden*
   infrastructure. Justified only if (a) you have many independent
   reactive cells where the granularity actually pays off, AND
   (b) you're using a battle-tested library (Solid, Preact
   signals, Vue refs) so the hidden machinery isn't *your* bug
   surface. Hand-rolling the primitives — as v3 does — is an
   educational exercise, not a production move.

**v2 isn't winning by accident.** It's winning because it picked
the right amount of infrastructure for the problem (zero) and put
everything else in the app code where you can see it. Every line
of v2 is auditable in isolation. That's the property that matters
when you're shipping a CMS-injected component into a codebase
where the next maintainer might not have seen any of this.

**The lesson, generalized:** when evaluating an architecture,
count *both* the visible code AND the runtime concepts you must
load to understand it. "Less code in the app" is not a win if
"more concepts in the runtime" pays for it. The total cognitive
surface is what matters. By that measure, v2 < v3 < v1 — and v2
wins decisively for component-sized work.

---

## Pickup notes for next session

Quick state dump so a future session (or future-me) can resume cleanly:

**What exists and works:**
- v1 (full SPA runtime with vdom) in `src/v1/`, served by `index.html`.
- v2 (imperative hydration) in `src/v2/main.ts`, served by `v2.html`.
- v3 (signals / fine-grained reactive) in `src/v3/main.ts`, served by
  `v3.html`. ~40 lines of `signal`/`effect`/`computed` primitives plus
  the GitHub lookup app on top. `export {};` at the bottom forces
  module scope to avoid global-identifier collision with v2.
- `bench.html` mounts v1+v2+v3 side-by-side with dynamic-import trick
  for v3 and reports a winner block (avg + best).
- v2 hardening from Step 10: dispose + AbortController + split error
  handling. Typechecks clean via `npx tsc --noEmit`.

**Architectural finding from v3:** signals are NOT a perf upgrade for
component-sized work. v2 ≈ v3 within noise on this app's hot path.
The honest signals pitch is ergonomic (dependencies explicit at read
site, no `Msg` enum); the honest TEA pitch is auditable (all
transitions in one place). For the prod target — CMS-injected
progressive enhancement — v2 remains the production shape. v3 is
preserved as a reference point for components that legitimately fit
the reactive shape (many independent atoms, fine-grained DOM updates).
Full writeup in Step 11 above.

**What's in the file that needs removal before prod:**
- `console.log('searchSubmitted', model)` inside `update` — debug
  leftover.
- `console.log(e)` inside the form submit listener in `mount` — debug
  leftover.

**Ready-to-do short tasks (in order, cheapest first):**
1. Remove the two debug `console.log`s above.
2. Run `bench.html`, paste numbers into the "Step 9 — benchmark"
   section AND into the Step 11b winner discussion.
3. v4 — explicit statechart as the next architectural alternative
   (declare states + allowed transitions as data; make impossible
   states structurally impossible).
4. Known Gap #4: introduce `mount(root, config)` signature. Config
   type starts with `{ apiBase: string }` and grows as needed.
5. Known Gap #3 proper: add `Cmd.log` variant and move any real
   logging through it.
6. Known Gap #1: pick an error-surfacing strategy for `queryRefs`
   (typed throw vs logger-bail). Discuss first.
7. Known Gap #2: structured `DecodeError` in the decoder.

**Ready-to-do longer tasks:**
- Known Gap #5 (debounce Cmd) — only motivated by a new component
  that needs live search; don't add speculatively.
- Known Gap #6 (`FetchSlots` map) — only motivated by a component
  that needs concurrent independent fetches; don't add speculatively.

**Open questions to resolve with user on return:**
- Which production repo is the first target for lifting the v2
  pattern? The shape of `config` (Known Gap #4) depends on what
  that host already provides (auth, telemetry, feature flags).
- Error-surfacing strategy for `queryRefs`: throw + host-catch, or
  logger-inject?
