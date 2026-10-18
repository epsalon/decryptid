# decryptid
Solver for the board game 'Cryptid'.

Given the board setup and the discs and cubes players have placed (and
optionally your own rule), it lists every hex where the cryptid can still be.

    go run . examples/game.txt        # board + viable locations
    go run . -v examples/game.txt     # also which rule assignments lead there
    go run . -rules [-basic]          # rule names/numbers for 'rule' lines

See `examples/game.txt` for the input format (documented in `game/parse.go`).
Hexes are `X Y` with X = column 0-11 and Y = row 0-8; every hex on the
printed board shows its coordinates. Viable locations are highlighted in red.

A viable location is one where some assignment of distinct rules to players
fits every player's markers, picks out exactly that hex, and needs every rule
(dropping any one leaves more than one hex).

Layout: `board` (tiles, setup, printing), `rule` (clue definitions),
`uint128` (108-hex bit masks), `search` (rule-combination search),
`game` (input parsing and solving).
