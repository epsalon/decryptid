# Web UI design

Status: **implemented** (milestones 1–6). Later items are still open.

## Goals

1. **A table-side assistant for a real game.** A player at a physical Cryptid table
   enters the board from the official app or setup card, their own colour and clue, and each
   disc and cube as it is placed. They get the viable locations and AI advice:
   what to ask, where to search, where to put a cube.
2. **Portable.** It runs in any modern browser, phone first, since that's
   what's at the table. It's hosted as static files on GitHub Pages: no server
   and no accounts.
3. **Private.** Everything runs in the browser, so a player's clue never
   leaves the device.
4. **One engine.** The UI uses the same Go solver as the CLI, so the two can
   never disagree.

### Non-goals (v1)

- Online multiplayer or syncing between devices.
- Generating official puzzles or looking up clue books. The official app
  already does this. We take its output as input.
- The official artwork, text, or code. The UI uses its own simple vector
  graphics and the engine's own rule names. We match the official tile
  numbering only so that setups can be copied across.

## Architecture

```
 ┌──────────── browser (static files from GitHub Pages) ────────────┐
 │                                                                  │
 │  index.html + app.js (ES modules, no framework, no build step)   │
 │   ├─ state.js     game state, undo, persistence, import/export   │
 │   ├─ board.js     SVG board drawing; geometry from Honeycomb     │
 │   ├─ panels.js    setup / play / advice panels                   │
 │   └─ engine.js    promise API over a Web Worker                  │
 │                         │ postMessage (JSON)                     │
 │  worker.js ─── wasm_exec.js + decryptid.wasm (Go engine)         │
 └──────────────────────────────────────────────────────────────────┘
```

- **Engine: Go compiled to WebAssembly** (`GOOS=js GOARCH=wasm`, standard Go
  toolchain). The output is about 3 MB, roughly 1 MB gzipped, which GitHub
  Pages compresses automatically. If size becomes a problem, TinyGo is the
  fallback.
- **Web Worker.** Analysis can take up to about a second for 5-player games
  in wasm, so it runs off the main thread and the UI never freezes.
  Requests carry an id, and stale responses are dropped. If a request is
  overtaken by newer input, the worker can simply be terminated and restarted.
- **Hex geometry: [Honeycomb](https://github.com/flauwekeul/honeycomb)**
  (`honeycomb-grid` 4.1.5, MIT, 16 KB ES module). It handles flat-top hexes,
  odd-q offset coordinates, corner points, and turning a tap point into a hex.
  We vendor the file into `web/vendor/` so the app works offline and isn't
  tied to a CDN. Drawing is plain SVG (one `<polygon>` per hex plus overlay
  groups), so there is no SVG library dependency.
- **No framework.** The UI is a handful of panels redrawn from one state
  object. Plain ES modules keep it buildable with nothing but `go build`,
  and easy to host.

### Engine API (worker messages)

Every request carries the game as JSON, the same fields as `game.Game`. The
worker is therefore stateless, and the UI's state is the single source of truth.

| op            | input                         | output                                                         |
|---------------|-------------------------------|----------------------------------------------------------------|
| `rules`       | mode                          | rule names, in order (numbers match `-rules`)                  |
| `board`       | spec                          | 108 hexes: terrain, animal, structure                          |
| `summary`     | game                          | viable locations with world counts, per-player possible rules  |
| `adviseTurn`  | game, player, λ, search-at    | chosen action, ranked questions and searches                   |
| `adviseCube`  | game, player                  | ranked cube spots                                              |
| `parse`       | game-file text                | game JSON                                                      |
| `format`      | game JSON                     | game-file text                                                 |
| `randomSetup` | players, mode, seed           | a random valid board (for practice)                            |

New Go code needed:
- **`game.Summary`**: like `Solve`, but streams worlds through `search.Each`
  instead of storing them. Storing them is millions of worlds on an empty
  5-player board.
- **`game.Format`**: the inverse of `Parse`, with a round-trip test.
- **JSON tags on `game` types.**
- **A `wasm/` main package** that registers one JS callback.

## State and persistence

```js
{
  game: { spec, players, advanced, anyClues, markers: [...], known: {...} },
  me: 2,                    // my seat, 1-based
  playerColors: [...],      // display only: yellow, red, green, cyan, purple
  history: [...],           // marker list snapshots, for undo/redo
  ui: { tab, overlay, tool }
}
```

- **Autosave** to `localStorage` on every change. Reopening the page resumes
  the game.
- **Import/export** as the CLI game-file text (`parse`/`format`), so the CLI
  and web are interchangeable and a game can be pasted into a bug report.
- **Share link:** the game text, compressed and base64-encoded in the URL
  `#fragment`. The link never includes your clue unless you explicitly choose to.

## Screens

Phone layout: the board fills the top of the screen and the panel sits below
it, in tabs. On wide screens the board sits on the left with the panel on the right.

### 1. Setup
- Player count (3–5) and mode (basic/advanced, which adds black structures and "not" clues).
- **Map:** six slots in the official 2×3 arrangement. Each slot gets a tile
  number (1–6) and a "rotated" toggle. The board preview updates live, and
  tiles already used are greyed out.
- **Structures:** pick one (e.g. "blue shed"), then tap a hex. Placed
  structures can be dragged or removed. Each one is placed only once, and
  black ones are enabled only in advanced mode.
- **Random board**, for practice.
- Validation: all six tiles used and each structure placed once.

### 2. Me
- **My colour**, and **my clue**, chosen from a list grouped by clue type.
- A **"hide my clue"** toggle blurs the clue and anything that would reveal it
  until it's tapped, in case someone glances at the phone.

### 3. Play (main screen)
- **Marker tool:** a strip of player chips, each with a disc/cube switch.
  Tap a hex to place the chosen marker; tap it again to remove it.
  **Undo/redo** buttons.
- **Rules enforced as you enter markers:**
  - at most one cube per hex;
  - one marker per player per hex;
  - warnings when a marker contradicts my clue, or leaves no world possible
    (usually a typo).
- **Optional turn wizard** ("Question", "Search", "Penalty cube") that walks
  through the steps in order. It's a convenience; raw markers always work.
- **Overlays** (toggle):
  - **Viable:** hexes where the cryptid can still be, shaded by likelihood.
  - **Advice:** numbered badges for the top-ranked actions.
  - **None.**

### 4. Advice
- **Status:** "The cryptid is on one of N hexes (H bits)". For each other
  player: how many clues they could still hold, and how close they are to
  solving. That's their location uncertainty, computed per possible clue.
  Their real view is hidden from us, so this is an estimate.
- **My turn:** the recommended action in large text (for example
  "ASK magenta about (11,1)" or "SEARCH (2,1) — 23%"), then the top
  questions and searches with yes-chance, gain, leak and score. Tapping a row
  highlights its hex.
- **Cube placement:** ranked hexes for my next cube (for setup and penalty
  cubes), each with how much it reveals.
- **Settings:** λ and the search threshold, defaulting to the values tuned by self-play.

## Board rendering

| element    | drawing                                                                                                |
|------------|--------------------------------------------------------------------------------------------------------|
| terrain    | fill colour per terrain plus a small glyph, so it is colourblind-safe (forest ♣, swamp ≈, mountain ▲, desert ·, water ~) |
| territory  | inset border: bear = black dashed, cougar = red dotted                                                  |
| structures | standing stone = octagon, shed = house shape; filled in the structure colour with a contrasting outline |
| discs      | small circles in player colours, arranged in a ring (up to 5)                                           |
| cube       | a square in the player colour, centred, with a white outline so a black cube still shows                |
| overlays   | likelihood tint, rank badges, selection ring                                                            |
| coords     | optional, small `x,y`, matching the CLI                                                                 |

- Layout: flat-top hexes, odd columns shifted down, 12 × 9, matching the engine.
  In Honeycomb that's `defineHex({ orientation: Orientation.FLAT, offset: -1 })`
  with `{col: x, row: y}`. I checked this, including mapping a tap point back to a hex.
- The SVG `viewBox` scales to fit. Touch targets are whole hexes, which are
  about 30 px on a phone in portrait.

## Build, hosting, testing

- **`make web`:** builds `web/decryptid.wasm` and copies the matching
  `wasm_exec.js` from `$(go env GOROOT)/lib/wasm`. Both are build outputs and
  are git-ignored.
- **Local:** `make serve`, which wraps `python3 -m http.server -d web`.
- **GitHub Actions** (`.github/workflows/pages.yml`), on pushes to `main`:
  `go test ./...`, then `make web`, then deploy `web/` to GitHub Pages.
  The repository needs Pages set to "GitHub Actions" once, in Settings → Pages.
- **Tests:**
  - Go unit tests for the new engine code (`Summary`, `Format` round-trip).
  - A Node smoke test of the wasm API.
  - Playwright end-to-end scripts in `web/test/`, kept out of the deployed site:
    set up a board, enter markers, check the viable count against the CLI,
    and take screenshots at phone and desktop widths.

## Milestones

1. **Engine API.** `Summary`, `Format`, JSON tags, wasm main, Node smoke test.
2. **Board.** SVG rendering with Honeycomb; setup screen; persistence.
3. **Play.** Marker entry, undo, validation, the viable overlay.
4. **Advice.** Turn and cube advice panels, with highlights.
5. **Play vs AI.** The engine deals a random game and you play one seat,
   with AI opponents taking their turns (`sim` logic exposed via wasm).
   At the end, everyone's clue is revealed.
6. **Ship.** The Pages workflow, README link, and a Playwright check in CI.
7. **Later.** Turn wizard, share links, offline support (service worker),
   editable player colours.

## Open questions

Decided:
1. **Player colours** match the physical set: yellow, red, green, cyan, purple.
   The CLI uses the same names. Making them editable is a nice-to-have, not v1.
2. **Play vs AI is in v1.** It becomes milestone 5 (below), reusing `sim`.
3. **The 2-player variant** is out of scope.
4. **One device per player.** There's no shared-screen mode.
