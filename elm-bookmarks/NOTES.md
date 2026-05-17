# Elm Bookmarks — Notes

## Dev Server
- Use `npx serve -s` to run locally (SPA mode — serves `index.html` for all routes)
- `python3 -m http.server` won't work — it's a static file server that returns its own 404 for unknown paths, so Elm never loads to handle routing

## Browser.application Gotchas

### No `node` option
- `Browser.application` takes over the entire `<body>` — do NOT pass `{ node: ... }` to `Elm.Main.init`
- Just use `Elm.Main.init({})` — unlike `Browser.element`, it doesn't mount into a specific DOM node

### Use absolute paths for scripts
- `<script src="elm.js">` is a **relative** path — breaks on nested routes
- Example: visiting `/bookmarks/new` makes the browser look for `/bookmarks/elm.js` instead of `/elm.js`
- Symptom: blank page on nested routes, but `/` and single-segment paths like `/foo` work fine
- Fix: always use `<script src="/elm.js">` (leading slash = absolute path)

## Main.elm Walkthrough (Step 1 Scaffold)

### Route (custom type)
- Defines possible pages: `Home` and `NotFound`
- Every URL maps to one of these

### Model
- `key` — a `Nav.Key`, a "permission token" for programmatic navigation (`Nav.pushUrl`). Only `Browser.application` gives you one.
- `url` — the current raw `Url` value
- `route` — the parsed `Route` (which page we're on)

### Msg
- `UrlRequested` — user clicked a link. Elm wraps it as `Browser.UrlRequest`, either `Internal` (same domain) or `External` (different domain).
- `UrlChanged` — the URL actually changed (after a push, or browser back/forward).

### main (Browser.application)
- Most full-featured Elm program type.
- `onUrlRequest` — "a link was clicked, what do you want to do?"
- `onUrlChange` — "the URL changed, update your state"
- Gives full control of the URL — Elm intercepts link clicks instead of letting the browser handle them.

### init
- Receives the initial `Url` and `Nav.Key` from the runtime, parses the route, no commands fired.

### update
- `UrlRequested (Internal url)` — calls `Nav.pushUrl` to change URL without page reload. This *triggers* a `UrlChanged` message next.
- `UrlRequested (External href)` — calls `Nav.load`, full browser navigation (leaves the app).
- `UrlChanged url` — updates model with new URL and re-parses the route.
- Key flow: **click link -> UrlRequested -> pushUrl -> triggers UrlChanged -> model updates -> view re-renders**

### view
- Returns `Browser.Document` (title + body) instead of plain `Html`.
- Pattern matches on `model.route` to decide what to render.

### urlToRoute
- Manual string matching: `"/"` is Home, everything else is NotFound.
- Will be replaced with `Url.Parser` in Step 2 for proper pattern matching with dynamic segments.

## Page Architecture Pattern (Step 3)

### Core idea
Each page is a **mini TEA app** (Model, Msg, init, update, view). `Main.elm` is the **router/orchestrator** that holds them together.

### Page modules (e.g. `Page/Home.elm`)
Each page exposes:
- `Model` — state for just that page
- `Msg` — messages for just that page
- `init` — initial model for that page
- `update : Msg -> Model -> ( Model, Cmd Msg )`
- `view : Model -> Html Msg`

Pages know nothing about other pages or routing. Self-contained.

### Main.elm changes

**Model** — instead of storing a `Route`, store the current **page + its state**:
```elm
type Page
    = HomePage Page.Home.Model
    | BookmarkDetailPage Page.BookmarkDetail.Model
    | NotFoundPage
```
`Model` becomes `{ key, url, page }` instead of `{ key, url, route }`.

**Msg** — wraps each page's messages:
```elm
type Msg
    = UrlRequested Browser.UrlRequest
    | UrlChanged Url
    | HomeMsg Page.Home.Msg
    | BookmarkDetailMsg Page.BookmarkDetail.Msg
```

**update** — delegates to the right page:
```elm
HomeMsg subMsg ->
    case model.page of
        HomePage homeModel ->
            let
                ( newModel, cmd ) = Page.Home.update subMsg homeModel
            in
            ( { model | page = HomePage newModel }
            , Cmd.map HomeMsg cmd
            )
        _ ->
            ( model, Cmd.none )
```
`Cmd.map` wraps `Cmd Page.Home.Msg` into `Cmd Msg`.

**view** — delegates and wraps:
```elm
HomePage homeModel ->
    Page.Home.view homeModel
        |> Html.map HomeMsg
```
`Html.map` wraps `Html Page.Home.Msg` into `Html Msg`.

### Route vs Page
- `Route` still exists — it's the intermediate step between a URL and a page
- `Route` = "what page" (parsed from URL)
- `Page` = "what page + its state" (holds the page's Model)
- On `UrlChanged`: parse URL → Route → call page's `init` → store `Page` in Model

### What is Msg?
**Msg is the only way your app's state can change.** Every single state change — no matter where it comes from — must go through a Msg into `update`. There's no other door. It's not just browser events — it covers HTTP responses, timer ticks, port data, JSON decoding results, anything. Look at `type Msg` and you see a complete list of every possible thing that can change your app.

### The flow
```
URL changes → parse Route → call page's init → store Page in Model
User clicks → Page.Msg → Main wraps it → delegates to page's update
Render → Main delegates to page's view → Html.map wraps output
```
