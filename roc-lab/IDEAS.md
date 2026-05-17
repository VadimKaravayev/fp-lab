# Roc learning projects

A staged list of projects to learn Roc end-to-end — basics through platform authoring. Each tier exercises something Roc does *differently* from Elm, so completing the path covers the full surface of the language.

Recommended path: **Wordle solver → Todo CLI → Lisp interpreter → bookmarks webserver**. Cherry-pick the rest based on interest.

---

## Tier 1 — pure, no I/O

Goal: get fluent in tags, records, pattern matching, the standard collections.

### Wordle solver
- Score guesses against a hidden word; filter candidates by feedback.
- Exercises: `List`, `Set`, `Dict`, structural tags, `when` exhaustiveness.
- Small, but a good first end-to-end project.

### Expression evaluator
- AST as a recursive tag union; evaluator + pretty-printer.
- Forces you to feel Roc tags vs Elm custom types — they're **global, structural, polymorphic**, not nominal.

### Sudoku solver
- Backtracking with immutable state.
- Roc's perf shows here vs Elm; good benchmark target later.

---

## Tier 2 — `basic-cli` platform

Goal: Tasks, file I/O, JSON, error handling as tags.

### Todo CLI with persistence
- Read/write JSON via the `Encoding` / `Decoding` abilities.
- First real taste of **abilities** (Roc's typeclass equivalent — Elm has nothing like this).

### Log analyzer
- Read a file, parse lines, aggregate counts in `Dict`, sort & render.
- Practice composing `Task`s and propagating errors as tag unions.

### Markdown → HTML
- Write parser combinators by hand. No regex, no fancy lib.
- Deep recursion + pattern matching is where Roc shines.

---

## Tier 3 — `basic-webserver` platform

Goal: feel the platform/app split with something non-trivial.

### Bookmarks REST API
- Mirror the Elm bookmarks app, but as the backend.
- SQLite via the platform's DB API.
- Pairs naturally with the existing Elm frontend — you can wire them together.

### GitHub-events tail
- HTTP client + streaming JSON.
- Real `Task` composition; errors as tags, not exceptions.

---

## Tier 4 — abilities + perf

Goal: actually understand abilities, not just use the builtins. Benchmark Roc against Python/Node.

### Tiny Lisp interpreter
- Lexer, parser, evaluator, REPL.
- Define a custom ability for printable values; opaque types for environments.
- **Best single project for breadth** — touches almost every language feature.

### Brainfuck or WASM interpreter
- Tight inner loop; benchmark vs Python/Node.
- Shows why Roc exists (perf), not just what it can do.

### Custom binary codec (MessagePack subset)
- Implement `Encoding` / `Decoding` from scratch on your own type.
- Forces real understanding of abilities, not just calling `Encode.toBytes`.

---

## Tier 5 — platform authoring

Goal: Roc's unique party trick — write your own runtime, expose it to pure-Roc apps.

### Tiny TUI platform
- Wrap a C library (ncurses / termbox) and expose it as a Roc platform.
- Apps written against it stay pure Roc.
- Nothing else in the FP space lets you do this so cleanly.
- **Save for last** — you need to have felt the constraints from the app side first, otherwise you won't know what to expose.

---

## Notes on what NOT to try first

- **GUI apps.** Roc has no mature GUI platform yet (2026). Don't start here.
- **Anything async-heavy.** Roc's effect model is `Task`-based and single-threaded by default; concurrency is still evolving. Pick a different language for actor systems.
- **Big web frontends.** Roc-as-frontend exists experimentally but isn't where the language is strong. Use Elm if you want that.
