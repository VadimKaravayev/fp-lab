// ts-tea v4 — GitHub user lookup, async-first.
//
// The architectural challenge: same UX as v1/v2/v3, but with NO
// reified state. No Model, no Msg, no update, no signals, no
// effects, no central dispatch. The "state machine" is the call
// stack of an async function — the platform's built-in one.
//
// The whole app boils down to:
//
//   async function search(username) {
//     showLoading(username)
//     try {
//       const user = await fetchUser(username)   // <-- 'loading'
//       showSuccess(user)                        // <-- 'success'
//     } catch (err) {
//       showError(username, err)                 // <-- 'error'
//     }
//   }
//
// "What state is the app in?" answers as "what line of `search`
// is currently executing." idle = `search` hasn't run yet. loading
// = we're between `showLoading` and the awaited fetch. success =
// after `showSuccess`. error = after `showError`. There is no
// `Model.fetchState` because there is no Model. The DOM is the only
// stored state, and the call stack is the only "where am I now"
// tracking.
//
// What this experiment tests: how much of v1/v2/v3's architecture
// was actually dictated by the *problem*, vs. how much was dictated
// by the choice to reify state instead of using the platform's
// already-existing state machine (async/await is sugar over a
// generator state machine — we're just using it directly).
//
// Spoiler from writing it: most of the "where does this concern
// live?" questions get *worse* answers in v4 than in v2 — DOM
// mutations are scattered across the function body, the
// generation-counter cancellation guard is noisy and easy to
// forget, and you can't inspect "what state is the app in" from
// outside the running function. But the happy path is genuinely
// 10 lines and the architecture is "the language already has one."
// The lesson is in the trade, not the result.

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

// ─── DOM-mutation helpers ────────────────────────────────────────────
//
// These are tiny because each one only flips ONE state — they're
// inlined into the right place in `search` rather than collected
// into a `render(state)` switch. That's the v4 bet: dispatching
// on state in one place is what `render` does in v2; here, the
// async function flow already encodes which state we're in, so the
// "render" boils down to "set the part of the DOM that this state
// needs to change."

const showIdle = (refs: DOMRefs): void => {
  refs.result.dataset['state'] = 'idle';
};

const showLoading = (refs: DOMRefs, username: string): void => {
  refs.result.dataset['state'] = 'loading';
  refs.loadingUsername.textContent = username;
  refs.input.disabled = true;
  refs.submit.disabled = true;
};

const showSuccess = (refs: DOMRefs, u: GhUser): void => {
  refs.result.dataset['state'] = 'success';
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
};

const showError = (refs: DOMRefs, username: string, err: HttpError): void => {
  refs.result.dataset['state'] = 'error';
  refs.errorMessage.textContent = errorToText(username, err);
};

// ─── Mount ───────────────────────────────────────────────────────────

const queryRefs = (root: HTMLElement): DOMRefs => {
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (el === null) throw new Error(`v4: missing required element ${sel}`);
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

const mount = (root: HTMLElement): (() => void) => {
  const refs = queryRefs(root);

  // The two pieces of "state" v4 cannot eliminate, even with
  // async-first:
  //
  //   `currentGen` — generation counter so a stale `search` call
  //     (one that was overtaken by a newer submit) can detect it
  //     should not write to the DOM after its await resumes.
  //
  //   `currentAc` — AbortController for the in-flight fetch, so
  //     a new submit can cancel the previous one and dispose can
  //     abort whatever's pending on unmount.
  //
  // These are NOT a Model. They are the *minimum bookkeeping* the
  // platform doesn't give you for free: JS doesn't natively have
  // "cancel a running async function" or "tell me which call of
  // this function is the most recent one." Every other piece of
  // state — including which UI state the app is in — lives in the
  // call stack of `search` or in the DOM itself.
  let currentGen = 0;
  let currentAc: AbortController | null = null;
  let disposed = false;

  const search = async (username: string): Promise<void> => {
    const myGen = ++currentGen;
    currentAc?.abort();
    const ac = new AbortController();
    currentAc = ac;

    showLoading(refs, username);

    const url = `https://api.github.com/users/${encodeURIComponent(username)}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: ac.signal });
    } catch {
      // Stale or disposed — newer search took over, or we were
      // unmounted while in flight. Either way, do not touch the DOM.
      if (disposed || myGen !== currentGen) return;
      showError(refs, username, { kind: 'network' });
      reenableForm();
      return;
    }

    if (disposed || myGen !== currentGen) return;

    if (!response.ok) {
      showError(refs, username, { kind: 'status', status: response.status });
      reenableForm();
      return;
    }

    let user: GhUser;
    try {
      const raw = await response.json();
      if (disposed || myGen !== currentGen) return;
      user = decodeUser(raw);
    } catch (e) {
      if (disposed || myGen !== currentGen) return;
      const message = e instanceof Error ? e.message : String(e);
      showError(refs, username, { kind: 'decode', message });
      reenableForm();
      return;
    }

    showSuccess(refs, user);
    reenableForm();
  };

  // Re-enable the form after a search settles (success or error).
  // Submit's disabled flag depends on the *current* input value, so
  // we recompute it from the live DOM rather than from any stored
  // state — there is no stored state.
  const reenableForm = (): void => {
    refs.input.disabled = false;
    refs.submit.disabled = refs.input.value.trim() === '';
  };

  // Input handler is the only "non-async" piece of state management
  // left, and it's a one-liner: enable submit iff there's text.
  // Notice it does NOT need to know about loading state, because
  // during loading the input itself is disabled, so this handler
  // cannot fire.
  const onInput = (): void => {
    refs.submit.disabled = refs.input.value.trim() === '';
  };

  const onSubmit = (e: Event): void => {
    e.preventDefault();
    const username = refs.input.value.trim();
    if (username === '') return;
    void search(username);
  };

  refs.input.addEventListener('input', onInput);
  refs.form.addEventListener('submit', onSubmit);

  showIdle(refs);

  return () => {
    disposed = true;
    refs.input.removeEventListener('input', onInput);
    refs.form.removeEventListener('submit', onSubmit);
    currentAc?.abort();
    currentAc = null;
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
