// ts-tea v6 — GitHub user lookup, plain imperative.
//
// No architecture. No state machine. No Model. No Msg. No Cmd. No
// signals. No statechart. No central anything. Just two event
// listeners that directly mutate the DOM, with a couple of mutable
// variables in closure scope holding whatever the listeners need
// to remember between calls.
//
// This is the version 90% of vanilla JS / jQuery code in 2012
// looked like — and the version a developer who hasn't yet learned
// any framework or architecture pattern naturally writes first. It
// is also the version that every other file in this project
// (v1–v5) is some kind of *reaction against*. To know what each
// architectural pattern buys you, you need to see what its absence
// looks like.
//
// The lesson v6 is built to teach: shortest is not best. By raw
// line count this is the smallest version in the project. By every
// other measure that matters in production — testability,
// extensibility, invariants, debuggability, refactorability — it
// is the worst. The other versions are paying their ceremony cost
// in exchange for properties that v6 silently lacks. v6 is what
// "no insurance" looks like.
//
// What v6 lacks, version by version:
//
//   - vs v1 (vdom TEA): no separation of view from state. The DOM
//     IS the state. There is no `view(model) → vnode` step, so
//     there is no place to introspect "what should the UI look
//     like right now."
//
//   - vs v2 (imperative TEA): no `update`, no `Msg`, no
//     `executeCmd`. Adding a feature means modifying this function.
//     There are zero extension points. The type checker cannot
//     enforce that you've handled all the states because there are
//     no states — just a `let isLoading` flag and a `dataset.state`
//     attribute that anyone can set to anything.
//
//   - vs v3 (signals): no derived state. `submit.disabled` is
//     computed manually in two different places (the input
//     listener and the submit-flow's finally block). Forget one,
//     and the button gets out of sync with the input.
//
//   - vs v4 (async-first): v4 looks similar to v6, but v4 has a
//     `search()` function as the organizing principle and a
//     generation counter to handle stale completions. v6 inlines
//     the whole flow directly into the submit listener and uses
//     only `AbortController.signal.aborted` for stale detection.
//     The cost shows up if a feature ever needs to start a search
//     from anywhere besides the form submit handler — there's no
//     `search(username)` to call. You'd duplicate the entire
//     try/catch.
//
//   - vs v5 (statechart): no transition table, no guards, no
//     structural enforcement of valid (state, event) pairs. The
//     `if (isLoading) return` check at the top of `onSubmit` is
//     the *entire* invariant enforcement system. Forget that
//     check, and you can fire concurrent searches.
//
// What v6 has that the others don't:
//
//   - The shortest happy-path code in the project.
//
//   - Zero indirection. Every line is a direct cause-and-effect.
//     A new contributor can read it top-to-bottom in 60 seconds.
//
//   - No infrastructure to learn before reading the app code.
//
// These are real properties. They are not nothing. For a
// throwaway prototype, a one-off internal tool, a CodePen demo,
// or genuinely-single-feature progressive enhancement that will
// NEVER grow another feature, v6 is the right answer. The mistake
// is using v6's shape when you know the component will grow —
// because everything that v1–v5 does later for ~$10 of ceremony,
// v6 forces you to pay later for ~$1000 of refactoring.

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
    if (el === null) throw new Error(`v6: missing required element ${sel}`);
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

// ─── Mount — the entire app ──────────────────────────────────────────
//
// Everything below is the whole application. There are no other
// modules, no helper functions for "render this state", no decoder,
// no error type, no transition table. Just two event handlers and
// a couple of mutable closures.

const mount = (root: HTMLElement): (() => void) => {
  const refs = queryRefs(root);

  // The two pieces of state. Both are `let`. Both are mutated from
  // multiple places below. Neither is named in any type.
  let isLoading = false;
  let abortController: AbortController | null = null;

  const onInput = (): void => {
    // Manual derivation of "can submit" — duplicated below in the
    // submit handler's finally block. Forget to keep them in sync
    // and the button drifts out of step with the input.
    refs.submit.disabled = isLoading || refs.input.value.trim() === '';
  };

  const onSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const username = refs.input.value.trim();

    // Two guards inlined. Equivalent to v5's transition table
    // refusing the (loading, searchSubmitted) entry — except here
    // it's a hand-written `if` that someone could delete and the
    // type checker wouldn't notice.
    if (username === '' || isLoading) return;

    // Begin "loading state" — every DOM mutation listed by hand,
    // no abstraction over "what does loading look like."
    isLoading = true;
    refs.input.disabled = true;
    refs.submit.disabled = true;
    refs.result.dataset['state'] = 'loading';
    refs.loadingUsername.textContent = username;

    // Cancel any in-flight previous search and start a fresh one.
    abortController?.abort();
    abortController = new AbortController();
    const ac = abortController;

    try {
      const response = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}`,
        { signal: ac.signal },
      );

      if (ac.signal.aborted) return;

      if (!response.ok) {
        // Inline error message — no error type, no `errorToText`
        // helper. The 404-vs-other-status branch is one `if`,
        // duplicated nowhere because there's nothing to share with.
        if (response.status === 404) {
          refs.errorMessage.textContent = `User "${username}" not found.`;
        } else {
          refs.errorMessage.textContent = `Server returned ${response.status}.`;
        }
        refs.result.dataset['state'] = 'error';
        return;
      }

      // Inline "decode": no validation, no Result type, no DecodeError.
      // If the response shape is wrong, the next few lines crash and
      // the catch handler treats it as a network error. Wrong, but
      // small.
      const data = (await response.json()) as {
        login: string;
        name: string | null;
        avatar_url: string;
        bio: string | null;
        public_repos: number;
        html_url: string;
      };

      if (ac.signal.aborted) return;

      refs.avatar.src = data.avatar_url;
      refs.avatar.alt = data.login;
      refs.name.textContent = data.name ?? data.login;
      refs.login.textContent = `@${data.login}`;
      if (data.bio !== null) {
        refs.bio.textContent = data.bio;
        refs.bio.classList.remove('muted');
      } else {
        refs.bio.textContent = '(no bio)';
        refs.bio.classList.add('muted');
      }
      refs.repos.textContent = String(data.public_repos);
      refs.profileLink.href = data.html_url;
      refs.result.dataset['state'] = 'success';
    } catch {
      if (ac.signal.aborted) return;
      // ANY thrown thing — fetch failure, JSON parse failure, decode
      // crash — ends up here labeled "network error." v2 split this
      // into three error kinds. v6 throws away the distinction.
      refs.errorMessage.textContent =
        'Network error — check your connection.';
      refs.result.dataset['state'] = 'error';
    } finally {
      if (!ac.signal.aborted) {
        isLoading = false;
        refs.input.disabled = false;
        // Manual recompute of `submit.disabled` — same logic as
        // `onInput` above. Two places. If you change the rule (say,
        // require username length >= 3), you must change it twice.
        refs.submit.disabled = refs.input.value.trim() === '';
      }
    }
  };

  refs.input.addEventListener('input', onInput);
  refs.form.addEventListener('submit', onSubmit);

  return () => {
    refs.input.removeEventListener('input', onInput);
    refs.form.removeEventListener('submit', onSubmit);
    abortController?.abort();
    abortController = null;
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