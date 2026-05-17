# Elm Routing Project Ideas

Project ideas for learning Elm's full capabilities through a routing-based app.

---

## 1. Personal Bookmarks Manager (recommended)

A multi-page app to save, tag, search, and organize bookmarks.

### What you'd learn

- **Routing** — pages for list, add/edit, tag view, search results
- **URL parsing** — `/bookmarks`, `/bookmarks/:id`, `/tags/:name`, query params for search
- **Custom types** — model page state as a union type (`Home | EditBookmark Int | TagView String | NotFound`)
- **JSON encoding/decoding** — composable decoders for bookmark data
- **Ports** — persist to `localStorage` via JS interop
- **Subscriptions** — keyboard shortcuts (e.g., `/` to focus search)
- **Form validation** — URL validation, required fields, using `Result` and `Maybe`
- **Scaling TEA** — split into modules per page, route messages

### Suggested progression

1. Scaffold — `Browser.application`, basic routing with 2-3 pages
2. URL parsing — `Url.Parser` module, handle dynamic segments
3. Page architecture — each page as its own `Model`/`Msg`/`update`/`view`
4. Data layer — define types, JSON decoders, mock data
5. Ports — `localStorage` read/write for persistence
6. Forms — add/edit with validation
7. Search & filtering — query params in URL
8. Subscriptions — keyboard shortcuts
9. Polish — error pages, `NotFound` route, loading states

---

## 2. Pomodoro Timer with Stats Dashboard

Timer + history tracking across multiple pages.

### What you'd learn

- **Subscriptions** — `Time.every` for the countdown
- **Ports** — notifications via JS `Notification` API, sound playback
- **Routing** — timer page, history page, settings
- **Charts** — render SVG/HTML bar charts of daily focus time
- **Custom types** — `Running | Paused | Break | Idle` states

---

## 3. Markdown Note-Taking App

Write markdown, preview rendered output, organize into notebooks.

### What you'd learn

- **Ports** — send markdown to a JS library for rendering (or build a simple parser in pure Elm)
- **Routing** — `/notebooks/:id/notes/:noteId`
- **Nested data** — notebooks contain notes, modeling with `Dict`
- **Debouncing** — auto-save after typing stops (using `Process.sleep` + tasks)
- **Textarea handling** — keyboard shortcuts, tab indentation via ports
