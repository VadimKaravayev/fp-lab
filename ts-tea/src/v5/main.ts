// ts-tea v5 — GitHub user lookup, statechart.
//
// Same UX as v1/v2/v3/v4. The architectural challenge: transitions
// are DATA, not code. v2 has a Model + an `update` function whose
// switch arms describe transitions implicitly — the type checker
// tells you to handle every Msg, but it can't tell you whether a
// given Msg is "supposed" to be handled in a given state. v5 makes
// the state graph explicit: a table from (state-kind, event-kind)
// to a transition function. Invalid pairs are LITERALLY MISSING
// from the table. The interpreter does nothing for them.
//
// What this gets you that v2 doesn't:
//
// 1. Impossible transitions are STRUCTURALLY impossible. v2 lets
//    you `dispatch({ type: 'gotUser', ... })` while the model says
//    `fetchState.kind === 'idle'`, and `update` will (probably)
//    handle it in some unintended way because the switch arm runs
//    regardless of the model's state. v5 looks up
//    `transitions.idle.fetchSucceeded`, finds nothing, and ignores
//    the event. No undefined behavior, no defensive `if`s.
//
// 2. The state graph is auditable as DATA. You can visualize it,
//    dump it as a Mermaid diagram, lint it for unreachable states,
//    auto-generate test cases for every transition. v2's transitions
//    are buried inside switch arms and only diff-able by reading code.
//
// 3. Guards are explicit. A transition can return `null` to mean
//    "this event is valid here in principle but the precondition
//    failed" (e.g., `searchSubmitted` from `idle` is only valid if
//    the query is non-empty). v2 hides guards inside if-statements
//    at the top of update branches.
//
// What it doesn't get you that v2 does:
//
// 1. Less code. The transition table + interpreter + entry actions
//    add up to MORE lines than v2's update function for the same
//    behavior. The payoff is in correctness properties, not brevity.
//
// 2. As-clean side-effect handling. v2's `Cmd` as data is one of
//    the cleanest things about TEA. Statecharts traditionally use
//    "entry actions" — functions that run when a state is entered.
//    They work, but they're less compositional than Cmd.
//
// The lesson v5 is built to teach: statechart pays in ceremony for
// two specific properties (structural invariant enforcement + state
// graph as data). For simple linear flows it's overkill; for forms
// with many states and many possible transitions where invalid
// combinations would silently corrupt the model, it's gold. The
// GitHub lookup is simple enough to land in the "overkill" zone —
// but writing it as a statechart anyway makes the property concrete.

// ─── State (the nodes of the chart) ──────────────────────────────────
//
// One discriminated-union variant per node. Each variant carries
// exactly the data that node needs — `loading` carries the username
// being fetched, `success` carries the user, `error` carries both
// the username and the error. The query is carried in every state
// because it's user-controlled and orthogonal to the fetch lifecycle.

type GhUser = Readonly<{
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  publicRepos: number;
  htmlUrl: string;
}>;

type HttpError =
  | { readonly kind: 'network' }
  | { readonly kind: 'status'; readonly status: number }
  | { readonly kind: 'decode'; readonly message: string };

type State =
  | { readonly kind: 'idle';    readonly query: string }
  | { readonly kind: 'loading'; readonly query: string; readonly username: string }
  | { readonly kind: 'success'; readonly query: string; readonly user: GhUser }
  | {
      readonly kind: 'error';
      readonly query: string;
      readonly username: string;
      readonly error: HttpError;
    };

type StateKind = State['kind'];

// ─── Events (the edges' labels) ──────────────────────────────────────
//
// Every external thing that can happen to the chart. Note these are
// `events`, not `messages` — the statechart vocabulary distinction
// matters: events are *facts* about the world ("a fetch succeeded",
// "a key was pressed"), and the chart decides whether they cause a
// transition. In TEA, `Msg` is closer to "intent + effect-trigger"
// because messages can carry effect-related data and are dispatched
// in response to specific intentions. Subtle but real distinction.

type Event =
  | { readonly type: 'queryChanged';    readonly query: string }
  | { readonly type: 'searchSubmitted' }
  | { readonly type: 'fetchSucceeded';  readonly user: GhUser }
  | { readonly type: 'fetchFailed';     readonly error: HttpError };

type EventType = Event['type'];

// ─── The transition table (the chart, as data) ───────────────────────
//
// `transitions[stateKind][eventType]` is a function `(state, event)
// -> nextState | null`. Returning `null` means "the precondition
// failed" — a guard, in statechart terms. Missing entries mean "this
// event is not valid in this state at all" — invalid transitions are
// structurally absent.
//
// You can read this whole table top-to-bottom to know every possible
// transition the app supports. That's the property statechart was
// invented for: the state graph is one piece of code, not scattered
// across switch arms.

type Transition<S extends State = State> = (
  state: S,
  event: Event,
) => State | null;

// We use `any` for the per-state transition value type because each
// state's transitions take a more specific State variant. The
// interpreter's `transition()` function is the type-safe entry point;
// the table itself is intentionally loose.
type TransitionTable = {
  readonly [K in StateKind]: {
    readonly [E in EventType]?: Transition;
  };
};

const transitions: TransitionTable = {
  idle: {
    queryChanged: (_state, event) => {
      if (event.type !== 'queryChanged') return null;
      return { kind: 'idle', query: event.query };
    },
    searchSubmitted: (state) => {
      if (state.kind !== 'idle') return null;
      const username = state.query.trim();
      if (username === '') return null; // guard: need a non-empty query
      return { kind: 'loading', query: state.query, username };
    },
  },

  loading: {
    // While loading, the user can keep typing — query updates but the
    // in-flight fetch is still for the original `username`. We do NOT
    // re-fire on every keystroke; the user must submit again after
    // the loading state settles.
    queryChanged: (state, event) => {
      if (state.kind !== 'loading' || event.type !== 'queryChanged') return null;
      return { ...state, query: event.query };
    },
    fetchSucceeded: (state, event) => {
      if (state.kind !== 'loading' || event.type !== 'fetchSucceeded') return null;
      return { kind: 'success', query: state.query, user: event.user };
    },
    fetchFailed: (state, event) => {
      if (state.kind !== 'loading' || event.type !== 'fetchFailed') return null;
      return {
        kind: 'error',
        query: state.query,
        username: state.username,
        error: event.error,
      };
    },
    // Notable absence: `searchSubmitted` is NOT in this map. The user
    // cannot start a new search while one is in flight — the chart
    // structurally enforces it. v2 had to enforce this with a
    // `canSubmit` flag and a render-time `disabled` attribute; v5
    // enforces it at the state-machine level. (We *also* set the
    // disabled attribute below for UX, but the chart doesn't depend
    // on it.)
  },

  success: {
    queryChanged: (state, event) => {
      if (state.kind !== 'success' || event.type !== 'queryChanged') return null;
      // Typing after a successful search drops the result and goes
      // back to idle. Design choice — could equally stay in success
      // and just update the query, but idle feels right (the success
      // result is now stale relative to the new query).
      return { kind: 'idle', query: event.query };
    },
    searchSubmitted: (state) => {
      if (state.kind !== 'success') return null;
      const username = state.query.trim();
      if (username === '') return null;
      return { kind: 'loading', query: state.query, username };
    },
  },

  error: {
    queryChanged: (state, event) => {
      if (state.kind !== 'error' || event.type !== 'queryChanged') return null;
      return { kind: 'idle', query: event.query };
    },
    searchSubmitted: (state) => {
      if (state.kind !== 'error') return null;
      const username = state.query.trim();
      if (username === '') return null;
      return { kind: 'loading', query: state.query, username };
    },
  },
};

// ─── The interpreter ─────────────────────────────────────────────────
//
// 12 lines. Generic over the chart shape. This is the *whole* engine
// — there is nothing else to read to understand how transitions
// happen. Compare to v2's dispatch + update + executeCmd, which spans
// ~80 lines collectively.

const transition = (state: State, event: Event): State | null => {
  const handlers = transitions[state.kind];
  const handler = handlers[event.type];
  if (!handler) return null; // event not valid in this state
  return handler(state, event);
};

// ─── Entry actions (the side-effect side of the chart) ───────────────
//
// When we enter a state, optionally fire a side effect. Statecharts
// traditionally separate this from the transition table because side
// effects are not part of the state graph — they're triggered BY the
// graph but live next to it. v2's `Cmd` is a more compositional
// version of the same idea (effects-as-data); entry actions are
// effects-as-callbacks, which is simpler but less inspectable.

type EntryAction = (
  state: State,
  dispatch: (event: Event) => void,
  refs: DOMRefs,
  fetchSlot: { current: AbortController | null },
) => void;

const entryActions: { readonly [K in StateKind]?: EntryAction } = {
  loading: (state, dispatch, _refs, fetchSlot) => {
    if (state.kind !== 'loading') return;
    startFetch(state.username, dispatch, fetchSlot);
  },
};

// ─── Side effects (only place fetch lives) ───────────────────────────

const startFetch = (
  username: string,
  dispatch: (event: Event) => void,
  fetchSlot: { current: AbortController | null },
): void => {
  fetchSlot.current?.abort();
  const ac = new AbortController();
  fetchSlot.current = ac;
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`;

  void (async () => {
    let response: Response;
    try {
      response = await fetch(url, { signal: ac.signal });
    } catch {
      if (ac.signal.aborted) return;
      dispatch({ type: 'fetchFailed', error: { kind: 'network' } });
      return;
    }

    if (!response.ok) {
      dispatch({
        type: 'fetchFailed',
        error: { kind: 'status', status: response.status },
      });
      return;
    }

    try {
      const raw = await response.json();
      const user = decodeUser(raw);
      dispatch({ type: 'fetchSucceeded', user });
    } catch (e) {
      if (ac.signal.aborted) return;
      const message = e instanceof Error ? e.message : String(e);
      dispatch({ type: 'fetchFailed', error: { kind: 'decode', message } });
    }
  })();
};

// ─── Decoder ─────────────────────────────────────────────────────────

const decodeUser = (raw: unknown): GhUser => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('expected an object at the top level');
  }
  const o = raw as Record<string, unknown>;

  const str = (key: string): string => {
    const v = o[key];
    if (typeof v !== 'string')
      throw new Error(`field "${key}" must be a string`);
    return v;
  };
  const nullableStr = (key: string): string | null => {
    const v = o[key];
    if (v === null) return null;
    if (typeof v === 'string') return v;
    throw new Error(`field "${key}" must be a string or null`);
  };
  const num = (key: string): number => {
    const v = o[key];
    if (typeof v !== 'number')
      throw new Error(`field "${key}" must be a number`);
    return v;
  };

  return {
    login: str('login'),
    name: nullableStr('name'),
    avatarUrl: str('avatar_url'),
    bio: nullableStr('bio'),
    publicRepos: num('public_repos'),
    htmlUrl: str('html_url'),
  };
};

const errorToText = (username: string, error: HttpError): string => {
  switch (error.kind) {
    case 'network':
      return 'Network error — check your connection.';
    case 'status':
      if (error.status === 404) return `User "${username}" not found.`;
      return `Server returned ${error.status}.`;
    case 'decode':
      return `Bad response from server: ${error.message}`;
  }
};

// ─── Render ──────────────────────────────────────────────────────────
//
// Render dispatches on `state.kind` exactly like v2's render. The
// statechart shape doesn't change how rendering works — it changes
// how *transitions* work. Render is still a switch over states.

const render = (state: State, refs: DOMRefs): void => {
  refs.result.dataset['state'] = state.kind;
  refs.input.disabled = state.kind === 'loading';
  refs.submit.disabled =
    state.kind === 'loading' || state.query.trim() === '';

  switch (state.kind) {
    case 'idle':
      break;

    case 'loading':
      refs.loadingUsername.textContent = state.username;
      break;

    case 'success': {
      const u = state.user;
      refs.avatar.src = u.avatarUrl;
      refs.avatar.alt = u.login;
      refs.name.textContent = u.name ?? u.login;
      refs.login.textContent = `@${u.login}`;
      if (u.bio !== null) {
        refs.bio.textContent = u.bio;
        refs.bio.classList.remove('muted');
      } else {
        refs.bio.textContent = '(no bio)';
        refs.bio.classList.add('muted');
      }
      refs.repos.textContent = String(u.publicRepos);
      refs.profileLink.href = u.htmlUrl;
      break;
    }

    case 'error':
      refs.errorMessage.textContent = errorToText(state.username, state.error);
      break;
  }
};

// ─── Selectors & refs ────────────────────────────────────────────────

const selectors = {
  root: '[data-app="github-lookup"]',
  form: '[data-hook="form"]',
  input: '[data-hook="input"]',
  submit: '[data-hook="submit"]',
  result: '[data-hook="result"]',
  loadingUsername: '[data-hook="loading-username"]',
  errorMessage: '[data-hook="error-message"]',
  avatar: '[data-hook="avatar"]',
  name: '[data-hook="name"]',
  login: '[data-hook="login"]',
  bio: '[data-hook="bio"]',
  repos: '[data-hook="repos"]',
  profileLink: '[data-hook="profile-link"]',
} as const;

type DOMRefs = Readonly<{
  root: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  submit: HTMLButtonElement;
  result: HTMLElement;
  loadingUsername: HTMLElement;
  errorMessage: HTMLElement;
  avatar: HTMLImageElement;
  name: HTMLElement;
  login: HTMLElement;
  bio: HTMLElement;
  repos: HTMLElement;
  profileLink: HTMLAnchorElement;
}>;

const queryRefs = (root: HTMLElement): DOMRefs => {
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (el === null) throw new Error(`v5: missing required element ${sel}`);
    return el;
  };
  return {
    root,
    form: q<HTMLFormElement>(selectors.form),
    input: q<HTMLInputElement>(selectors.input),
    submit: q<HTMLButtonElement>(selectors.submit),
    result: q(selectors.result),
    loadingUsername: q(selectors.loadingUsername),
    errorMessage: q(selectors.errorMessage),
    avatar: q<HTMLImageElement>(selectors.avatar),
    name: q(selectors.name),
    login: q(selectors.login),
    bio: q(selectors.bio),
    repos: q(selectors.repos),
    profileLink: q<HTMLAnchorElement>(selectors.profileLink),
  };
};

// ─── Mount ───────────────────────────────────────────────────────────

const mount = (root: HTMLElement): (() => void) => {
  const refs = queryRefs(root);
  const fetchSlot: { current: AbortController | null } = { current: null };

  let state: State = { kind: 'idle', query: '' };

  const dispatch = (event: Event): void => {
    const next = transition(state, event);
    if (next === null) return; // invalid transition, structurally ignored

    const enteredNewState = next.kind !== state.kind;
    state = next;
    render(state, refs);

    if (enteredNewState) {
      entryActions[state.kind]?.(state, dispatch, refs, fetchSlot);
    }
  };

  const onInput = (): void => {
    dispatch({ type: 'queryChanged', query: refs.input.value });
  };
  const onSubmit = (e: Event_): void => {
    e.preventDefault();
    dispatch({ type: 'searchSubmitted' });
  };

  refs.input.addEventListener('input', onInput);
  refs.form.addEventListener('submit', onSubmit);

  render(state, refs);

  return () => {
    refs.input.removeEventListener('input', onInput);
    refs.form.removeEventListener('submit', onSubmit);
    fetchSlot.current?.abort();
    fetchSlot.current = null;
  };
};

// `Event` is our chart-event type, but the DOM also has a built-in
// `Event` type that the form submit listener needs. We alias the DOM
// one as `Event_` so the chart's `Event` stays the primary name.
type Event_ = globalThis.Event;

// ─── Boot ────────────────────────────────────────────────────────────

const onReady = (): void => {
  const root = document.querySelector<HTMLElement>(selectors.root);
  if (root !== null) mount(root);
};

if (document.readyState !== 'loading') {
  onReady();
} else {
  document.addEventListener('DOMContentLoaded', onReady);
}

export {};