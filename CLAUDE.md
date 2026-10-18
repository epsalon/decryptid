# CLAUDE.md

Solver for the board game Cryptid. It is a Go module (`github.com/epsalon/decryptid`)
with one external dependency (`fatih/color`). Hosted web UI: https://decryptid.8ln.org/.
See README.md for user-facing usage and the game-file format.

## Commands

```sh
go build ./... && go vet ./...
go test ./...
go run . examples/game.txt      # quick end-to-end check; -v for detail
```

## Architecture

Data flows: game file → `game.Parse` → `Game.Board()` (tiles, buildings,
markers) → per-rule masks → per-player candidate rules → `search.Solve` →
`Result` (solutions, viable locations).

- **`board`**: `Tiles` holds the 6 map tiles, each 3 rows × 6 columns.
  `MakeBoard` lays them out 3×2 into a `Board` of 9 rows × 12 columns (`b[y][x]`).
  - A flipped tile is rotated 180°: tile cell (r, c) lands at (2-r, 5-c) within its slot.
  - Each `Hex` carries `Discs`, a bitset with bit p-1 for player p, and one `Cube`
    (the player number, 0 = none). `print.go` renders the board.
- **`rule`**: a `RuleSpec` is a per-hex predicate plus a radius ("within d of a
  matching hex") plus an optional negation.
  - `AllRules()` lists every clue, each followed by its "Not" variant.
  - `Advanced()` marks rules used only in advanced games: negations and black structures.
  - `OnBoard` evaluates a rule to a `[]bool` over all 108 hexes.
- **`uint128`**: every hex is one bit (index `y*12 + x`), so a rule or a set of
  markers is one `Uint128`, combined with AND/OR.
- **`search`**: `Solve(masks, cands)` returns every assignment of distinct rules
  to players (player p restricted to `cands[p]`) that leaves exactly one hex, with
  every rule needed. It enumerates unordered sets (`combos`), filters them with
  `consistent`, then expands each set into per-player assignments.
- **`game`**: `Game`/`Marker`, the parser (format documented on `Parse`), and
  `Solve`. A player's candidate rules are those whose mask contains all of that
  player's discs and none of their cubes, narrowed to one rule if it is known.
- **`game/advise.go`**: `AdviseCube` ranks legal cube hexes by the information
  they give opponents. It streams solutions through `search.Each`, which never
  materialises them, and counts worlds by (opponent j, j's rule, placer's rule,
  location). Each candidate hex is then scored with array sums over the placer
  rules that rule the hex out. `advise_test.go` checks the result against
  re-solving the game with the cube actually placed. Keep that test passing
  when you change the model.
- **`game/turn.go`**: `AdviseTurn` scores every question and search for one
  player. It makes one `search.Each` pass to count our worlds by (player,
  rule, location), our worlds by pairs of players' rules, and all worlds by
  (k, rk, j, rj, location) for the other players k and j. Gain and leak are
  both in bits of location entropy. `Choose` applies the search threshold and
  never wastes a turn on a zero-gain question. `turn_test.go` checks it
  against brute force.
- **`sim`**: self-play. `Play` deals a random board and a uniformly sampled
  world (`Game.SampleWorld`), runs the two setup cube rounds, then plays
  turns following the rulebook: a failed search or a "no" answer costs a
  penalty cube, and no one may touch a cubed hex. Each AI sees only its own
  rule (`match.view`).
- **`api`**: JSON request/response handler for the web UI (`Handle`), testable
  natively. **`wasm/`** wraps it as the JS function `decryptid(json)`.
  `make web` builds `web/decryptid.wasm` plus `wasm_exec.js`; `make smoke`
  runs `web/test/smoke.mjs` under Node (it needs a `node` binary; pass `NODE=`).
- **Sampling (`game/sample.go`)**: with more than `SampleLimit` worlds, the
  advisors estimate *other* players' views from a hash-sampled subset of rule
  sets. Our own view is always exact. This keeps fresh 5-player boards at
  about 0.4 s natively and 1.5 s in wasm.
- **`web/`**: static web UI (no framework, no build step besides the wasm).
  `js/app.js` wires a `Store` (`state.js`, autosaved to localStorage, with
  marker undo/redo) to panels (`setup.js`, `me.js`, `play.js`, `advice.js`, `match.js`), each with
  `render()`, `onHex(x, y)` and `overlay()`. `board.js` draws SVG with
  Honeycomb geometry (`vendor/`, flat-top, offset -1). `engine.js` talks to
  `worker.js`, which runs the wasm. The game JSON is the same shape as Go's
  `game.Game`. `match.js` runs games against AI seats: the engine deals
  (`newMatch`) and answers come from rule `masks`; the turn rules mirror
  `sim`, so keep the two in step. Test with `make e2e`, a Playwright script that also cross-checks
  the UI against CLI results.
- **`main.go`** / **`advise_cli.go`**: the CLI (`-v`, `-cube`, `-turn`, `-sim`, `-rules`).

## Invariants and gotchas

- **Hex geometry is odd-q offset**: odd columns are shifted down. Distance
  code converts to cube coordinates via `r = y - (x - (x&1))/2`.
  `rule.hexDistance` and the test helper `game.hexDist` must agree with each other
  and with the renderer.
- **Board size** comes from `board.Width/Height`, except `boardCells = 9 * 12`
  in `search`, which can't import `board`. The board has 108 hexes, and that
  must stay ≤ 128 bits.
- **The order of `rule.AllRules()` is user-facing**: rule numbers in `-rules`
  and `rule PLAYER N` lines depend on it. Append new rules; never reorder them.
- **Clue sets are minimal by default**: every clue is needed to pin the
  cryptid. The user believes this matches the real game. `clues any` relaxes it.
- **Tune policies with `-sim`, not intuition.** Use a few hundred games:
  the standard error of a win rate is about 0.03 at 200 games.
- **"Distance N" in rule names means "within N"**, distance 0 included.
  Rule names are user input (`rule PLAYER NAME`), so renaming a rule breaks game files.
- **Player colours are display-only.** `game.PlayerColors` must stay in the
  same order as `playerColor` in `board/print.go`.
- **The tile data in `board.Tiles` matches the physical game.** It was
  checked hex by hex against an independent transcription and confirmed by
  the user. Flipped tiles are rotated 180°.

## Conventions

- **License: MIT.** The web build must link only the Go standard library
  (`make check-wasm-deps`, run in CI). `board/print.go` is `//go:build !js`
  for that reason. A new dependency shipped in `web/` needs its notice added to
  `web/THIRD_PARTY_NOTICES.txt`.
- All code is gofmt'd and every exported identifier has a doc comment.
- Tests use plain `testing`. `game/game_test.go` has a randomised end-to-end
  check: it builds markers from a known solution and asserts the solution survives.
  Extend it when changing solving logic.
- Keep the README's game-file section in sync with the `Parse` doc comment.

## Roadmap

1. Make the search decision value-based instead of a fixed threshold. Count
   what a failed search teaches us, and search sooner when an opponent's view
   is nearly certain (we can compute every opponent's view).
