// ts-tea v3 — GitHub user lookup, fine-grained reactive (signals).
//
// Same UX as v1 / v2. Different architecture:
//   - No Model, no Msg, no update, no dispatch loop.
//   - State is a set of independent reactive atoms (signals).
//   - Derived values are `computed` signals that auto-recompute when
//     their inputs change.
//   - The "view" is a set of `effect`s, each subscribing only to the
//     signals it actually reads and mutating one slice of the DOM.
//   - Side effects (fetch) are triggered by an effect watching the
//     "request" signal, not by a Cmd interpreter.
//
// What TEA makes explicit that signals hide: transitions. There is no
// single place that enumerates "these are the ways state can change."
// What signals make explicit that TEA hides: data flow. Each effect
// literally reads the signals it depends on — no grep required.

// ─── Reactive core ───────────────────────────────────────────────────
//
// ~40 lines of primitives. The whole trick is `currentEffect`: a
// module-level variable that lets `signal.get()` discover which effect
// is reading it *right now* and subscribe that effect automatically.
// When the signal's value later changes, it re-runs each subscribed
// effect, which re-parks itself in `currentEffect` and re-reads — so
// dependencies are re-discovered on every run (letting effects with
// conditional reads update their subscription sets).

type Runnable = {
  execute: () => void;
  deps: Set<Set<Runnable>>;
  disposed: boolean;
};

let currentEffect: Runnable | null = null;

const subscribe = (running: Runnable, subs: Set<Runnable>): void => {
  subs.add(running);
  running.deps.add(subs);
};

const cleanup = (running: Runnable): void => {
  for (const subs of running.deps) subs.delete(running);
  running.deps.clear();
};

type Signal<T> = {
  get: () => T;
  set: (next: T) => void;
  peek: () => T;
};

const signal = <T>(initial: T): Signal<T> => {
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
      // Copy first: effects re-run, which re-subscribes, mutating `subs`
      // mid-iteration. Snapshot avoids the "add while iterating" hazard.
      for (const r of [...subs]) if (!r.disposed) r.execute();
    },
    peek: () => value,
  };
};

type EffectHandle = { dispose: () => void };

const effect = (fn: () => void): EffectHandle => {
  const running: Runnable = {
    execute: () => {
      if (running.disposed) return;
      cleanup(running);
      const prev = currentEffect;
      currentEffect = running;
      try {
        fn();
      } finally {
        currentEffect = prev;
      }
    },
    deps: new Set(),
    disposed: false,
  };
  running.execute();
  return {
    dispose: () => {
      cleanup(running);
      running.disposed = true;
    },
  };
};

// `computed` is an effect that writes to an internal signal. Reading
// the computed subscribes you to that signal; the effect keeps it in
// sync with its inputs. Falls out of `signal` + `effect` in ~5 lines.
const computed = <T>(fn: () => T): { get: () => T; dispose: () => void } => {
  const s = signal<T>(undefined as unknown as T);
  const e = effect(() => s.set(fn()));
  return { get: s.get, dispose: e.dispose };
};

// ─── Domain types ────────────────────────────────────────────────────

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

type FetchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly username: string }
  | { readonly kind: 'success'; readonly user: GhUser }
  | {
      readonly kind: 'error';
      readonly username: string;
      readonly error: HttpError;
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
    if (el === null) throw new Error(`v3: missing required element ${sel}`);
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

// ─── Mount ───────────────────────────────────────────────────────────

const mount = (root: HTMLElement): (() => void) => {
  const refs = queryRefs(root);

  // State as reactive atoms. No Model record; each signal is
  // independently readable and writable.
  const query = signal<string>('');
  const fetchState = signal<FetchState>({ kind: 'idle' });

  // Derived values. Each re-computes automatically when its inputs
  // change. The view effects below read these and get auto-subscribed.
  const canSubmit = computed(
    () => fetchState.get().kind !== 'loading' && query.get().trim() !== '',
  );
  const isLoading = computed(() => fetchState.get().kind === 'loading');

  // In-flight fetch slot — same role as v2. One concurrent request
  // max; new fetch cancels the previous; dispose aborts pending.
  let inflight: AbortController | null = null;

  const startFetch = (username: string): void => {
    inflight?.abort();
    const ac = new AbortController();
    inflight = ac;
    const url = `https://api.github.com/users/${encodeURIComponent(username)}`;

    (async () => {
      let response: Response;
      try {
        response = await fetch(url, { signal: ac.signal });
      } catch {
        if (ac.signal.aborted) return;
        fetchState.set({
          kind: 'error',
          username,
          error: { kind: 'network' },
        });
        return;
      }

      if (!response.ok) {
        fetchState.set({
          kind: 'error',
          username,
          error: { kind: 'status', status: response.status },
        });
        return;
      }

      try {
        const raw = await response.json();
        const user = decodeUser(raw);
        fetchState.set({ kind: 'success', user });
      } catch (e) {
        if (ac.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        fetchState.set({
          kind: 'error',
          username,
          error: { kind: 'decode', message },
        });
      }
    })();
  };

  // ─── View effects ──────────────────────────────────────────────────
  //
  // Each effect touches ONE slice of the DOM and subscribes ONLY to
  // the signals it reads. Compare to v2's `render(vs, refs)` which is
  // one big switch touching everything every time. Here, changing
  // `query` re-runs the submit-disabled effect and nothing else.

  const effects: EffectHandle[] = [];

  effects.push(
    effect(() => {
      refs.submit.disabled = !canSubmit.get();
    }),
  );

  effects.push(
    effect(() => {
      refs.input.disabled = isLoading.get();
    }),
  );

  effects.push(
    effect(() => {
      refs.result.dataset['state'] = fetchState.get().kind;
    }),
  );

  effects.push(
    effect(() => {
      const fs = fetchState.get();
      if (fs.kind !== 'loading') return;
      refs.loadingUsername.textContent = fs.username;
    }),
  );

  effects.push(
    effect(() => {
      const fs = fetchState.get();
      if (fs.kind !== 'error') return;
      refs.errorMessage.textContent = errorToText(fs.username, fs.error);
    }),
  );

  effects.push(
    effect(() => {
      const fs = fetchState.get();
      if (fs.kind !== 'success') return;
      const u = fs.user;
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
    }),
  );

  // ─── Event wiring ──────────────────────────────────────────────────

  const onInput = (): void => {
    query.set(refs.input.value);
  };
  const onSubmit = (e: Event): void => {
    e.preventDefault();
    const username = query.peek().trim();
    if (username === '') return;
    fetchState.set({ kind: 'loading', username });
    startFetch(username);
  };

  refs.input.addEventListener('input', onInput);
  refs.form.addEventListener('submit', onSubmit);

  return () => {
    refs.input.removeEventListener('input', onInput);
    refs.form.removeEventListener('submit', onSubmit);
    inflight?.abort();
    inflight = null;
    for (const e of effects) e.dispose();
    effects.length = 0;
  };
};

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
