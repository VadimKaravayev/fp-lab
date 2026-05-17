// ts-tea v2 — GitHub user lookup, imperative style.
//
// Same architecture as v1 (Model / Msg / Cmd / init / update / view /
// dispatch loop), but aligned with the "progressive enhancement" shape
// of the production carousel component:
//
//   - Static HTML shell in v2.html; JS only mutates what needs to change.
//   - No virtual DOM. `view(model)` returns a ViewState *data projection*
//     and `render(vs, refs)` pokes the live DOM via querySelector /
//     textContent / classList / dataset.
//   - `Cmd` is plain data (a discriminated union). `executeCmd` is the
//     interpreter — it's the only place side effects live.
//   - No generics. One app, concrete Model / Msg / Cmd.
//   - One file. No separate runtime, no separate http module, no Result
//     module, no vdom. ~260 lines including the decoder and effect
//     interpreter.

// ─── Selectors ───────────────────────────────────────────────────────

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

type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

type FetchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly username: string }
  | { readonly kind: 'success'; readonly user: GhUser }
  | {
      readonly kind: 'error';
      readonly username: string;
      readonly error: HttpError;
    };

type Model = Readonly<{
  query: string;
  fetchState: FetchState;
}>;

type Msg =
  | { readonly type: 'queryChanged'; readonly query: string }
  | { readonly type: 'searchSubmitted' }
  | {
      readonly type: 'gotUser';
      readonly username: string;
      readonly result: Result<GhUser, HttpError>;
    };

// Cmd is DATA, not a thunk. Every possible side effect this app can
// request is visible in this union. executeCmd below is the interpreter.
type Cmd =
  | { readonly type: 'none' }
  | { readonly type: 'fetchUser'; readonly username: string };

// ViewState is the *data projection* of Model that render needs. It
// filters out anything render doesn't care about and pre-computes
// derived flags. Not a vdom tree — just plain fields.
type ViewState = Readonly<{
  fetchState: FetchState;
  canSubmit: boolean;
  isLoading: boolean;
}>;

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

// ─── init ────────────────────────────────────────────────────────────

const init = (): [Model, Cmd] => [
  { query: '', fetchState: { kind: 'idle' } },
  { type: 'none' },
];

// ─── update ──────────────────────────────────────────────────────────

const update = (msg: Msg, model: Model): [Model, Cmd] => {
  switch (msg.type) {
    case 'queryChanged':
      return [{ ...model, query: msg.query }, { type: 'none' }];

    case 'searchSubmitted': {
      const username = model.query.trim();
      console.log('searchSubmitted', model);
      if (username === '') return [model, { type: 'none' }];
      return [
        { ...model, fetchState: { kind: 'loading', username } },
        { type: 'fetchUser', username },
      ];
    }

    case 'gotUser':
      if (msg.result.ok) {
        return [
          { ...model, fetchState: { kind: 'success', user: msg.result.value } },
          { type: 'none' },
        ];
      }
      return [
        {
          ...model,
          fetchState: {
            kind: 'error',
            username: msg.username,
            error: msg.result.error,
          },
        },
        { type: 'none' },
      ];
  }
};

// ─── view ────────────────────────────────────────────────────────────

const view = (model: Model): ViewState => ({
  fetchState: model.fetchState,
  canSubmit: model.fetchState.kind !== 'loading' && model.query.trim() !== '',
  isLoading: model.fetchState.kind === 'loading',
});

// ─── render ──────────────────────────────────────────────────────────
//
// Only touches what needs to change. The input element itself is left
// alone — it's uncontrolled, so focus, selection, IME, everything
// "just works" with zero effort.

const render = (vs: ViewState, refs: DOMRefs): void => {
  refs.submit.disabled = !vs.canSubmit;
  refs.input.disabled = vs.isLoading;
  refs.result.dataset['state'] = vs.fetchState.kind;

  switch (vs.fetchState.kind) {
    case 'idle':
      break;

    case 'loading':
      refs.loadingUsername.textContent = vs.fetchState.username;
      break;

    case 'success': {
      const u = vs.fetchState.user;
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
      refs.errorMessage.textContent = errorToText(
        vs.fetchState.username,
        vs.fetchState.error,
      );
      break;
  }
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

// ─── executeCmd ──────────────────────────────────────────────────────
//
// The interpreter. This is the *only* place side effects live. Adding
// a new kind of Cmd means: add a variant to the union, add a case here,
// add any required DOM refs if it needs them. Nothing else changes.
//
// `fetchSlot` holds the AbortController of the in-flight request (if
// any) so that (a) a new `fetchUser` cancels the previous one — killing
// stale-response races — and (b) unmount can abort whatever's pending
// via the dispose function returned from `mount`.

type FetchSlot = { current: AbortController | null };

const executeCmd = (
  cmd: Cmd,
  dispatch: (msg: Msg) => void,
  fetchSlot: FetchSlot,
): void => {
  switch (cmd.type) {
    case 'none':
      return;

    case 'fetchUser': {
      const { username } = cmd;
      const url = `https://api.github.com/users/${encodeURIComponent(username)}`;

      fetchSlot.current?.abort();
      const ac = new AbortController();
      fetchSlot.current = ac;

      (async () => {
        let response: Response;
        try {
          response = await fetch(url, { signal: ac.signal });
        } catch {
          if (ac.signal.aborted) return;
          dispatch({
            type: 'gotUser',
            username,
            result: { ok: false, error: { kind: 'network' } },
          });
          return;
        }

        if (!response.ok) {
          dispatch({
            type: 'gotUser',
            username,
            result: {
              ok: false,
              error: { kind: 'status', status: response.status },
            },
          });
          return;
        }

        try {
          const raw = await response.json();
          const user = decodeUser(raw);
          dispatch({
            type: 'gotUser',
            username,
            result: { ok: true, value: user },
          });
        } catch (e) {
          if (ac.signal.aborted) return;
          dispatch({
            type: 'gotUser',
            username,
            result: {
              ok: false,
              error: { kind: 'decode', message: errMsg(e) },
            },
          });
        }
      })();
      return;
    }
  }
};

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

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

// ─── Mount ───────────────────────────────────────────────────────────

const queryRefs = (root: HTMLElement): DOMRefs => {
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (el === null) throw new Error(`v2: missing required element ${sel}`);
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

// `mount` returns a dispose function. Calling it removes the event
// listeners and aborts any in-flight fetch, leaving the DOM untouched
// and the mount's closure garbage-collectable. Safe to call once per
// mount; no-op to call again.
const mount = (root: HTMLElement): (() => void) => {
  const refs = queryRefs(root);
  const fetchSlot: FetchSlot = { current: null };

  const [initialModel, initialCmd] = init();
  let model = initialModel;

  const dispatch = (msg: Msg): void => {
    const [nextModel, cmd] = update(msg, model);
    model = nextModel;
    render(view(model), refs);
    executeCmd(cmd, dispatch, fetchSlot);
  };

  const onInput = (): void => {
    dispatch({ type: 'queryChanged', query: refs.input.value });
  };
  const onSubmit = (e: Event): void => {
    e.preventDefault();
    dispatch({ type: 'searchSubmitted' });
  };

  refs.input.addEventListener('input', onInput);
  refs.form.addEventListener('submit', onSubmit);

  render(view(model), refs);
  executeCmd(initialCmd, dispatch, fetchSlot);

  return () => {
    refs.input.removeEventListener('input', onInput);
    refs.form.removeEventListener('submit', onSubmit);
    fetchSlot.current?.abort();
    fetchSlot.current = null;
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
