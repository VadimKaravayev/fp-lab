// GitHub user lookup — the first real app wiring h/runtime/cmd/http
// together. Type a username, click Search, see the profile.

import { type VNode, h } from "./h.js";
import { type Cmd, none } from "./cmd.js";
import { run } from "./runtime.js";
import { type Result } from "./result.js";
import { type HttpError } from "./http.js";
import * as Http from "./http.js";

// ─── Domain types ────────────────────────────────────────────────────

type GhUser = {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string;
  readonly bio: string | null;
  readonly publicRepos: number;
  readonly htmlUrl: string;
};

// FetchState is a discriminated union, not a grab-bag of optional fields.
// Each state carries exactly the data it needs — no impossible combinations
// like "loading but also have a user".
type FetchState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly username: string }
  | { readonly kind: "success"; readonly user: GhUser }
  | {
      readonly kind: "error";
      readonly username: string;
      readonly error: HttpError;
    };

type Model = {
  readonly query: string;
  readonly fetchState: FetchState;
};

type Msg =
  | { readonly tag: "QueryChanged"; readonly query: string }
  | { readonly tag: "SearchClicked" }
  | {
      readonly tag: "GotUser";
      readonly result: Result<GhUser, HttpError>;
    };

// ─── Decoder ─────────────────────────────────────────────────────────

// Hand-rolled decoder. Throws on shape mismatch; Http.get catches and
// wraps the throw into an HttpError of kind "decode".
function decodeUser(raw: unknown): GhUser {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected an object at the top level");
  }
  const o = raw as Record<string, unknown>;

  const str = (key: string): string => {
    const v = o[key];
    if (typeof v !== "string") {
      throw new Error(`field "${key}" must be a string`);
    }
    return v;
  };
  const nullableStr = (key: string): string | null => {
    const v = o[key];
    if (v === null) return null;
    if (typeof v === "string") return v;
    throw new Error(`field "${key}" must be a string or null`);
  };
  const num = (key: string): number => {
    const v = o[key];
    if (typeof v !== "number") {
      throw new Error(`field "${key}" must be a number`);
    }
    return v;
  };

  return {
    login: str("login"),
    name: nullableStr("name"),
    avatarUrl: str("avatar_url"),
    bio: nullableStr("bio"),
    publicRepos: num("public_repos"),
    htmlUrl: str("html_url"),
  };
}

// ─── init ────────────────────────────────────────────────────────────

function init(): readonly [Model, Cmd<Msg>] {
  return [{ query: "", fetchState: { kind: "idle" } }, none];
}

// ─── update ──────────────────────────────────────────────────────────

function update(msg: Msg, model: Model): readonly [Model, Cmd<Msg>] {
  switch (msg.tag) {
    case "QueryChanged":
      return [{ ...model, query: msg.query }, none];

    case "SearchClicked": {
      const username = model.query.trim();
      if (username === "") return [model, none];
      return [
        { ...model, fetchState: { kind: "loading", username } },
        Http.get({
          url: `https://api.github.com/users/${encodeURIComponent(username)}`,
          decode: decodeUser,
          toMsg: (result) => ({ tag: "GotUser", result }),
        }),
      ];
    }

    case "GotUser": {
      if (msg.result.ok) {
        return [
          { ...model, fetchState: { kind: "success", user: msg.result.value } },
          none,
        ];
      }
      // We need the username we attempted in order to render a nice
      // "user X not found" message, so recover it from the loading state
      // we should still be in.
      const username =
        model.fetchState.kind === "loading" ? model.fetchState.username : "";
      return [
        {
          ...model,
          fetchState: { kind: "error", username, error: msg.result.error },
        },
        none,
      ];
    }

    default: {
      const _exhaustive: never = msg;
      throw new Error(`Unhandled msg: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ─── view ────────────────────────────────────────────────────────────

function view(model: Model): VNode<Msg> {
  const loading = model.fetchState.kind === "loading";
  const canSubmit = !loading && model.query.trim() !== "";

  return h("div", { className: "app" }, [
    h("h1", {}, ["GitHub User Lookup"]),
    h(
      "form",
      {
        className: "search",
        onSubmit: (e: Event): Msg => {
          e.preventDefault();
          return { tag: "SearchClicked" };
        },
      },
      [
        h("input", {
          type: "text",
          placeholder: "username (try 'elm', 'torvalds', 'gaearon')",
          value: model.query,
          disabled: loading,
          onInput: (e: Event): Msg => ({
            tag: "QueryChanged",
            query: (e.target as HTMLInputElement).value,
          }),
        }),
        h("button", { type: "submit", disabled: !canSubmit }, ["Search"]),
      ],
    ),
    viewResult(model.fetchState),
  ]);
}

function viewResult(state: FetchState): VNode<Msg> {
  switch (state.kind) {
    case "idle":
      return h("p", { className: "hint" }, [
        "Enter a GitHub username above and click Search.",
      ]);

    case "loading":
      return h("p", { className: "hint" }, [`Loading ${state.username}…`]);

    case "success":
      return viewUser(state.user);

    case "error":
      return viewError(state.username, state.error);

    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function viewUser(user: GhUser): VNode<Msg> {
  return h("div", { className: "user" }, [
    h("img", {
      className: "avatar",
      src: user.avatarUrl,
      alt: user.login,
      width: 96,
      height: 96,
    }),
    h("h2", {}, [user.name ?? user.login]),
    h("p", { className: "login" }, [`@${user.login}`]),
    user.bio !== null
      ? h("p", { className: "bio" }, [user.bio])
      : h("p", { className: "bio muted" }, ["(no bio)"]),
    h("p", {}, [`Public repos: ${user.publicRepos}`]),
    h("a", { href: user.htmlUrl, target: "_blank", rel: "noopener" }, [
      "View on GitHub →",
    ]),
  ]);
}

function viewError(username: string, error: HttpError): VNode<Msg> {
  switch (error.kind) {
    case "network":
      return h("p", { className: "error" }, [
        "Network error — check your connection.",
      ]);

    case "status":
      if (error.status === 404) {
        return h("p", { className: "error" }, [
          `User "${username}" not found.`,
        ]);
      }
      return h("p", { className: "error" }, [
        `Server returned ${error.status}.`,
      ]);

    case "decode":
      return h("p", { className: "error" }, [
        `Bad response from server: ${error.message}`,
      ]);

    default: {
      const _exhaustive: never = error;
      throw new Error(`Unhandled error: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ─── mount ───────────────────────────────────────────────────────────

const root = document.getElementById("root");
if (root === null) throw new Error("#root element not found");
run({ init, update, view }, root);