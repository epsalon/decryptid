package game

import (
	"testing"

	"github.com/epsalon/decryptid/board"
)

// TestTileSummaryMatchesSolve: the per-tile counts add up to the solver's
// worlds, and each tile's worlds are the solver's solutions on that tile.
func TestTileSummaryMatchesSolve(t *testing.T) {
	for _, f := range []string{"../examples/game.txt", "../examples/setup.txt"} {
		g := loadFile(t, f)
		res, err := g.Solve()
		if err != nil {
			t.Fatal(err)
		}
		tiles, err := g.TileSummary()
		if err != nil {
			t.Fatal(err)
		}
		if len(tiles) != 6 {
			t.Fatalf("%s: %d tiles, want 6", f, len(tiles))
		}
		want := make([]int, 6)
		for _, s := range res.Solutions {
			want[tileOf(s.Location%board.Width, s.Location/board.Width)]++
		}
		sum := 0
		for i, tc := range tiles {
			sum += tc.Worlds
			if tc.Worlds != want[i] {
				t.Errorf("%s: tile %d has %d worlds, Solve found %d", f, i, tc.Worlds, want[i])
			}
			for j, rcs := range tc.Players {
				n := 0
				for _, rc := range rcs {
					n += rc.Worlds
				}
				if tc.Worlds > 0 && n != tc.Worlds {
					t.Errorf("%s: tile %d player %d rule counts sum to %d, want %d", f, i, j+1, n, tc.Worlds)
				}
			}
		}
		if sum != len(res.Solutions) {
			t.Errorf("%s: tiles hold %d worlds, Solve found %d", f, sum, len(res.Solutions))
		}
	}
}

// TestTileOf: each board hex belongs to the tile its position in the 3x2
// layout says.
func TestTileOf(t *testing.T) {
	if tileOf(0, 0) != 0 || tileOf(5, 2) != 0 || tileOf(6, 0) != 1 || tileOf(0, 3) != 2 || tileOf(11, 8) != 5 {
		t.Error("tileOf: wrong tile for a corner hex")
	}
}
