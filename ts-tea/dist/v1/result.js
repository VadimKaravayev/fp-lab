// Result<T, E> — success or failure, represented in the type system
// rather than thrown. Same idea as Rust's Result or Elm's Result.
//
// Used throughout the app anywhere something can fail in a recoverable
// way (HTTP responses, JSON decoding, form validation, ...).
// `Result<T, never>` is assignable to `Result<T, E>` for any E because
// `never` is a subtype of everything. Same trick on the other side.
export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });
//# sourceMappingURL=result.js.map