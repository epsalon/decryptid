# Roadmap

1. Search sooner when an opponent's view is nearly certain (we can compute
   every opponent's view). Tried and found not to matter: weighting leaks by
   turn order (`TurnOptions.Order`), ~900 head-to-head games.
2. Tell which rule sets would put the cryptid on each tile, once the board
   is set up (per-tile view of the solver's worlds).
3. A validation mode: check that the clues given are correct, with or
   without knowing each player's rule. If players' rules can be entered, do
   it so no one sees the others' (honor system) while the phone is passed
   around.
4. (Pie in the sky) Recognize the board state from a photo of the real
   game: tiles, structures, discs and cubes.
