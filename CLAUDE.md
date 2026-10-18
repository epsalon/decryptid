# CLAUDE.md

Solver for the board game Cryptid. It is a Go module (`github.com/epsalon/decryptid`)
with one external dependency (`fatih/color`). See README.md for user-facing usage
and the game-file format.

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
- **`main.go`**: the CLI (`-v`, `-cube PLAYER`, `-rules`).

## Invariants and gotchas

- **Hex geometry is odd-q offset**: odd columns are shifted down. Distance
  code converts to cube coordinates via `r = y - (x - (x&1))/2`.
  `rule.hexDistance` and the test helper `game.hexDist` must agree with each other
  and with the renderer.
- **Board size is hard-coded** in several places (`board.Width/Height`, `9 * 12`
  in `search`, `12` in `rule`). The board has 108 hexes, which must stay ≤ 128 bits.
- **`RuleSpec` literals in `rule/rules.go` are positional.** Adding a field means
  updating each constructor.
- **"Distance N" in rule names means "within N"**, distance 0 included.
  Rule names are user input (`rule PLAYER NAME`), so renaming a rule breaks game files.
- **Player colours are display-only.** `game.PlayerColors` must stay in the
  same order as `playerColor` in `board/print.go`.
- **The tile data in `board.Tiles` has not been checked** against the physical game.
  Suspect it when results look wrong.

## Conventions

- Older files (`board/`, `rule/`, `uint128/`) are not gofmt'd. Format only the
  code you touch; don't reformat whole files in unrelated changes. New files are gofmt'd.
- Tests use plain `testing`. `game/game_test.go` has a randomised end-to-end
  check: it builds markers from a known solution and asserts the solution survives.
  Extend it when changing solving logic.
- Keep the README's game-file section in sync with the `Parse` doc comment.

## Roadmap

1. Suggest the next question to ask: pick the (hex, player) whose answer splits
   our remaining worlds best, while revealing little to others. `AdviseCube`'s
   counting approach should carry over.
2. Support interactive or incremental input instead of re-running on a whole file.
3. Verify the tile data.
