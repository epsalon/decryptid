# Roadmap

1. ~~Search sooner when an opponent's view is nearly certain~~ (done: the
   urgency term in `TurnOptions`, default on). About +0.01 wins per seat in
   5-player advanced self-play, and no change elsewhere. Also tried and found
   not to matter: weighting leaks by turn order (`TurnOptions.Order`), ~900
   head-to-head games.
2. ~~Tell which rule sets would put the cryptid on each hex~~ (done: tap a
   hex in the Search tab, key 5. `HexSummary` counts the solver's worlds on
   that hex and, per player, the rules they hold in those worlds. Tested
   against `Solve` and `Summary`).
3. (Pie in the sky) Recognize the board state from a photo of the real
   game: tiles, structures, discs and cubes.
   - Collect labeled photos of real boards first, to measure accuracy.
   - Find the board, correct perspective, and map hex centers to (x, y).
   - Read pieces by color, with shape for disc vs. cube and structures.
     Report "unsure" rather than guess when pieces are stacked or hidden.
   - Identify tiles and their flips from terrain patterns, without shipping
     the game's artwork.
   - Show the reading as an editable overlay on the photo, and solve only
     after the user confirms it.
   - Prefer classical image processing in the stdlib (or in the browser) to
     keep the web build dependency-free. A cloud vision model is a fallback.
   - Video: the board is assumed steady. A new board means a new capture, or
     manual delta entry. Read a steady scene by voting per hex over frames,
     which handles hands and pieces passing over the board.
   - Manual deltas are checked: one disc or cube per action, and no silent
     overwrite of an occupied hex.
