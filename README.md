# decryptid

A solver for the board game [Cryptid](https://boardgamegeek.com/boardgame/246784/cryptid).

In Cryptid, each player holds one secret clue, and the cryptid lives on the
only hex that satisfies every clue. As players ask questions, the board fills
with discs ("my clue allows this hex") and cubes ("it doesn't").
decryptid takes the board setup and those markers, optionally plus your own
clue, and lists every hex where the cryptid can still be.

## Usage

Requires Go 1.25+.

```sh
go run . examples/game.txt        # board with viable hexes highlighted, plus a list
go run . -v examples/game.txt     # also: which clue assignments lead to each hex,
                                  #       and which clues each player may hold
go run . -rules                   # clue names and numbers (add -basic for basic mode)
go run . -                        # read the game from stdin
go run . -cube yellow examples/game.txt   # where should yellow put a cube?
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
mode basic                 # basic | advanced (default advanced)

disc magenta 6 2           # disc|cube PLAYER X Y
cube yellow  3 5
rule yellow Distance 1 from Swamp   # optional: a player's known clue (name or number)
```

- **Coordinates:** `X` is the column (0–11) and `Y` is the row (0–8). Every hex on
  the printed board shows its `X,Y`. Odd columns sit half a hex lower.
- **Players:** a number 1–5 or the colour the printer uses for them:
  yellow, magenta, blue, cyan, black.
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

## Development

```sh
go test ./...
```

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
- [ ] Suggest the most informative question to ask
- [ ] Verify the hard-coded map tiles against the physical game
