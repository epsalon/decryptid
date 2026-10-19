# decryptid

A solver for the board game [Cryptid](https://boardgamegeek.com/boardgame/246784/cryptid).

> **Unofficial fan project.** Decryptid is not affiliated with, endorsed by, or
> sponsored by Osprey Games or Cryptid's designers, Hal Duncan and Ruth
> Veevers. Cryptid is a trademark of its owner. This project uses no official
> artwork, rulebook text, or app code; it needs a copy of the game to be useful.

**Web UI:** Play online at **[https://decryptid.8ln.org/](https://decryptid.8ln.org/)** (runs entirely in your browser using WebAssembly).

In Cryptid, each player holds one secret clue, and the cryptid lives on the
only hex that satisfies every clue. As players ask questions, the board fills
with discs ("my clue allows this hex") and cubes ("it doesn't").
decryptid takes the board setup and those markers, optionally plus your own
clue, and lists every hex where the cryptid can still be.

## Usage

### Web UI

Set up the board (copy it from the official app or setup card), pick your colour and clue,
then record discs and cubes as they're placed. The board highlights where the
cryptid can still be, and the **Advice** tab tells you what to ask, where to
search, and where to put your cubes. No game at hand? The **vs AI** tab deals a
random board and plays a full game against AI opponents.

Visit **[https://decryptid.8ln.org/](https://decryptid.8ln.org/)** or run it locally:

```sh
make serve    # builds web/decryptid.wasm and serves at http://localhost:8347
```

#### Languages

The UI follows the browser's language, or the one picked in the footer.
English (US and UK spelling) and Hebrew are available. To add a language:

1. Copy `web/locales/en.json` to `web/locales/<code>.json` (a BCP 47 code,
   such as `fr`) and translate the values. Keep the `{{placeholders}}`, and
   the plural suffixes (`_one`, `_other`, ...) that your language needs.
   A regional variant (like `en-GB`) only needs the keys that differ.
2. Add the code and its name to `LANGUAGES` in `web/js/i18n.js`.
3. Run `make i18n-check`.

Messages from the solver engine itself (rare errors) are still English.

#### Keyboard shortcuts

The whole game can be played from the keyboard. Press <kbd>?</kbd> in the app
for this list.

| Key | Action |
|---|---|
| <kbd>1</kbd>–<kbd>5</kbd> | Switch tab: Setup, Me, Play, Advice, vs AI |
| <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> | Move the board cursor |
| <kbd>Enter</kbd> | Act on the cursor's hex, like tapping it |
| <kbd>Esc</kbd> | Hide the cursor |
| <kbd>Tab</kbd> | Move between buttons and fields |
| **Play:** <kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd> | Place that colour's **cube** (yellow, red, green, cyan, purple) |
| **Play:** <kbd>Shift</kbd> + letter | Place that colour's **disc** |
| **Play:** <kbd>Space</kbd> | Switch between disc and cube |
| **Play:** <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd> | Undo (add <kbd>Shift</kbd> to redo) |
| **vs AI:** <kbd>A</kbd> / <kbd>S</kbd> | Ask / Search (on your turn) |
| **vs AI:** <kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd> | Choose whom to ask |

Shortcuts don't fire while you're typing in a field. On phones and tablets,
keyboard hints appear only once a key has been pressed.

### CLI

Requires Go 1.25+.

```sh
go run . examples/game.txt        # board with viable hexes highlighted, plus a list
go run . -v examples/game.txt     # also: which clue assignments lead to each hex,
                                  #       and which clues each player may hold
go run . -rules                   # clue names and numbers (add -basic for basic mode)
go run . -                        # read the game from stdin
go run . -cube yellow examples/game.txt   # where should yellow put a cube?
go run . -turn yellow examples/game.txt   # what should yellow do this turn?
go run . -sim 100 -players 4              # AI-vs-AI tournament on random boards
```

Example output (abridged):

```
1 viable location(s), with the number of rule assignments leading to each:
  (3,3)  Forest                                   2
```

## Game file format

```text
# Comments start with '#'. Everything is case-insensitive.
tiles 6F 1F 3 5F 4 2F      # six map tiles, left-to-right then top-to-bottom; F = flipped
stone 0 1 blue             # stone|shed X Y white|blue|green|black
shed  8 2 blue
players 3                  # 1-5, default 3
colors red cyan purple     # optional: the colours playing, in turn order
mode basic                 # basic | advanced (default advanced)

disc red 6 2           # disc|cube PLAYER X Y
cube yellow  3 5
rule yellow Distance 1 from Swamp   # optional: a player's known clue (name or number)
```

- **Coordinates:** `X` is the column (0–11) and `Y` is the row (0–8). Every hex on
  the printed board shows its `X,Y`. Odd columns sit half a hex lower.
- **Players:** seats are turn order. A player is a seat number (1 = first
  player) or the colour sitting there. The colours are those of the physical
  set: yellow, red, green, cyan, purple. Without a `colors` line, the first
  `players` of them are playing, in that order.
- **Advanced mode** adds the "Not …" clues and black buildings.
  Black buildings in a basic game are an error.
- A hex can hold at most one cube.

See `examples/` for complete files.

## How it decides

A hex is **viable** if the players can be given distinct clues such that:

1. each clue agrees with that player's discs and cubes,
2. together the clues match exactly that hex, and
3. every clue is needed: dropping any one leaves more than one hex.

The count next to each location is how many such assignments lead there.
This is a rough sense of likelihood, not a probability.

## Cube advice: give away as little as possible

At setup, and after a question gets a "no", you place a cube anywhere your clue
rules out. `-cube PLAYER` ranks those hexes, least revealing first.
That player's clue must be given with a `rule` line.

It reasons from each opponent's point of view. An opponent knows only their own
clue, so they consider every world (clue assignment) that fits the markers and
their clue. Your cube removes the worlds where your clue would allow that hex.
Because you don't know their clue, the score is averaged over the clues they
could hold, given what you know.

- **bits:** how much the cube tells the opponents, summed over them.
  For each opponent it's -log2 of the share of their possible worlds that
  survive, so it is never negative. The ranking uses this.
- **loc:** the drop in their uncertainty (entropy) about the location.
  It can be negative: removing the likeliest hexes can leave the rest
  more evenly spread.

The model assumes every valid world is equally likely. It also assumes
opponents don't reason about *why* you chose a hex: a predictable strategy
leaks information of its own.

## AI player

`-turn PLAYER` recommends a move: a question (whom to ask, and about which hex)
or a search. That player's clue must be given with a `rule` line.

- **Questions** are scored as **gain − λ·leak**, in bits of information about
  the location.
  - *Gain* is how much the answer should tell you.
  - *Leak* is how much it tells everyone else. This counts the public answer
    (for players other than the one asked) and the penalty cube you'd place
    if the answer is "no". Leak uses the same per-opponent reasoning as cube advice.
  - `-lambda` sets the weight (default 0.5).
- **Searches** are ranked with the questions, scored as
  **W × chance of winning + gain − λ·leak**.
  - *Gain* is what a failed search teaches you: who refused first.
  - *Leak* counts your disc (which reveals that your clue allows the hex), the
    answers, and the penalty cube if it fails.
  - `-win-value` sets W (default 16 bits). `-win-value 0 -search-at P` brings
    back the older rule: search once a hex has at least chance P.

The defaults come from self-play (`-sim`). It plays complete games with
random boards and random valid clue sets, shuffling the competing policies into
seats. In those tournaments:

- **Searching early is what wins.** A 10–20% threshold beat waiting for
  certainty by 3–4×. A failed search costs only a cube and still reveals answers.
- **One ranking for searches and questions**, with W = 16, ties that tuned
  threshold head-to-head (0.26 vs 0.24 and 0.19 vs 0.21 wins per seat, over
  400/300 games). It's the default because it explains every move with the
  same score. Lower W (2–8) searches too late and loses.
- **Weighting leaks by turn order** (making it costlier to help the next
  player, or the last) made no measurable difference in 900 head-to-head games.
- **Avoiding leaks** (λ=0.5 vs 0) helped clearly with 5 players, but made
  little difference with 4.
- **3-player basic games** usually end on the first or second turn. Your own
  clue plus the uniqueness rule is often enough to search right away.

## Development

```sh
go test ./...
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test commands and
recipes (adding a clue, an API operation, a tab or a language), and
[CLAUDE.md](CLAUDE.md) for the architecture.

| Package   | Purpose                                                      |
|-----------|--------------------------------------------------------------|
| `board`   | Map tiles, board construction, coloured terminal rendering   |
| `rule`    | Clue definitions and evaluation on a board                   |
| `uint128` | 128-bit masks (one bit per hex, 108 hexes)                   |
| `search`  | Finds clue combinations that pin the cryptid to one hex      |
| `game`    | Game-file parsing and solving                                |

## Status and roadmap

- [x] Viable locations from discs, cubes, and known clues
- [x] Basic and advanced modes, including black buildings
- [x] Least-revealing cube placement (`-cube`)
- [x] Question/search advice (`-turn`) and self-play tournaments (`-sim`)
- [x] Value-based search decision: one ranking for searches and questions
- [ ] Search sooner when an opponent is close to solving
- [x] Web UI: setup, live analysis, and AI advice while you play
- [x] Play against AI opponents in the browser (easy, normal, hard)
- [x] Map tiles verified against the physical game

## License

MIT, see [LICENSE](LICENSE). The MIT license covers this project's own code
only; it grants no rights in Cryptid itself, its name, or its components. The web app bundles the Go runtime (BSD 3-Clause),
[honeycomb-grid](https://github.com/flauwekeul/honeycomb) (MIT) and
[i18next](https://github.com/i18next/i18next) (MIT); their
notices are in [web/THIRD_PARTY_NOTICES.txt](web/THIRD_PARTY_NOTICES.txt).
