// HTTP as a Cmd.
//
// This module is the first real "effect module" built on top of cmd.ts.
// It knows nothing about the runtime — it just produces Cmd<Msg> values
// that the runtime will later execute with a dispatch function.
//
// Usage from app code:
//
//   import * as Http from "./http.js";
//
//   Http.get({
//     url: "https://api.github.com/users/elm",
//     decode: decodeUser,          // (raw: unknown) => User, may throw
//     toMsg:  (r) => ({ tag: "GotUser", result: r }),
//   })

import type { Cmd } from "./cmd.js";
import { type Result, ok, err } from "./result.js";

// The three real failure modes of an HTTP GET.
export type HttpError =
  | { readonly kind: "network" }
  | { readonly kind: "status"; readonly status: number; readonly body: string }
  | { readonly kind: "decode"; readonly message: string };

export type GetConfig<T, Msg> = {
  readonly url: string;
  readonly decode: (raw: unknown) => T;
  readonly toMsg: (result: Result<T, HttpError>) => Msg;
};

export function get<T, Msg>(config: GetConfig<T, Msg>): Cmd<Msg> {
  return (dispatch) => {
    fetch(config.url)
      .then(async (response) => {
        if (!response.ok) {
          const body = await safeText(response);
          dispatch(
            config.toMsg(
              err({ kind: "status", status: response.status, body }),
            ),
          );
          return;
        }

        let raw: unknown;
        try {
          raw = await response.json();
        } catch (e) {
          dispatch(
            config.toMsg(
              err({ kind: "decode", message: `Not JSON: ${errorMessage(e)}` }),
            ),
          );
          return;
        }

        try {
          const value = config.decode(raw);
          dispatch(config.toMsg(ok(value)));
        } catch (e) {
          dispatch(
            config.toMsg(err({ kind: "decode", message: errorMessage(e) })),
          );
        }
      })
      .catch(() => {
        // `fetch` only rejects on network-level failures. Non-2xx responses
        // resolve normally and are handled in the branch above.
        dispatch(config.toMsg(err({ kind: "network" })));
      });
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}