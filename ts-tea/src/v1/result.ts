// Result<T, E> — success or failure, represented in the type system
// rather than thrown. Same idea as Rust's Result or Elm's Result.
//
// Used throughout the app anywhere something can fail in a recoverable
// way (HTTP responses, JSON decoding, form validation, ...).

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// `Result<T, never>` is assignable to `Result<T, E>` for any E because
// `never` is a subtype of everything. Same trick on the other side.
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
