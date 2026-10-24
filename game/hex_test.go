package game

import (
	"fmt"
	"strings"
	"testing"

	"github.com/epsalon/decryptid/board"
)

// TestHexSummaryMatchesSummary: for every hex, the worlds counted by
// HexSummary equal those Summary reports, and the totals agree.
func TestHexSummaryMatchesSummary(t *testing.T) {
	for _, f := range []string{"../examples/game.txt", "../examples/setup.txt"} {
		g := loadFile(t, f)
		sum, err := g.Summary()
		if err != nil {
			t.Fatal(err)
		}
		want := make(map[[2]int]int)
		for _, l := range sum.Locations {
			want[[2]int{l.X, l.Y}] = l.Worlds
		}
		for y := 0; y < board.Height; y++ {
			for x := 0; x < board.Width; x++ {
				h, err := g.HexSummary(x, y)
				if err != nil {
					t.Fatal(err)
				}
				if h.Total != sum.Worlds {
					t.Errorf("%s: hex %d,%d total %d, want %d", f, x, y, h.Total, sum.Worlds)
				}
				if h.Worlds != want[[2]int{x, y}] {
					t.Errorf("%s: hex %d,%d has %d worlds, Summary says %d", f, x, y, h.Worlds, want[[2]int{x, y}])
				}
				if len(h.Players) != g.Players {
					t.Fatalf("%s: hex %d,%d has %d players, want %d", f, x, y, len(h.Players), g.Players)
				}
				for j, rcs := range h.Players {
					n := 0
					for _, rc := range rcs {
						n += rc.Worlds
					}
					if h.Worlds > 0 && n != h.Worlds {
						t.Errorf("%s: hex %d,%d player %d rule counts sum to %d, want %d", f, x, y, j+1, n, h.Worlds)
					}
					if h.Worlds == 0 && n != 0 {
						t.Errorf("%s: hex %d,%d has rules for player %d but no worlds", f, x, y, j+1)
					}
				}
			}
		}
	}
}

// TestHexSummaryOffBoard: hexes outside the board are an error, not a
// zero count.
func TestHexSummaryOffBoard(t *testing.T) {
	g := loadFile(t, "../examples/game.txt")
	for _, xy := range [][2]int{{-1, 0}, {0, -1}, {board.Width, 0}, {0, board.Height}} {
		if _, err := g.HexSummary(xy[0], xy[1]); err == nil {
			t.Errorf("hex %d,%d: no error", xy[0], xy[1])
		}
	}
}

// TestHexSetsMatchSolve: the clue sets at a hex are the solver's solutions
// there, with each group of interchangeable players sorted, and the groups
// are the ones expected.
func TestHexSetsMatchSolve(t *testing.T) {
	setup := loadFile(t, "../examples/setup.txt")
	partial := loadFile(t, "../examples/setup.txt")
	partial.Markers = append(partial.Markers, Marker{Player: 1, X: 0, Y: 0})
	for _, tc := range []struct {
		name   string
		g      *Game
		groups [][]int
	}{
		{"ordered", loadFile(t, "../examples/game.txt"), [][]int{{0}, {1}, {2}}},
		{"symmetric", setup, [][]int{{0, 1, 2}}},
		{"partial", partial, [][]int{{0}, {1, 2}}},
	} {
		g := tc.g
		res, err := g.Solve()
		if err != nil {
			t.Fatal(err)
		}
		names := make(map[int]string)
		for i, r := range g.Rules() {
			names[i] = r.Name
		}
		// Expected sets per hex, from the solver's solutions.
		var groups [][]int
		want := make(map[[2]int]map[string]int)
		for _, s := range res.Solutions {
			k := [2]int{s.Location % board.Width, s.Location / board.Width}
			if want[k] == nil {
				want[k] = make(map[string]int)
			}
			if groups == nil {
				h, err := g.HexSummary(k[0], k[1])
				if err != nil {
					t.Fatal(err)
				}
				groups = h.Groups
			}
			rs := canonical(s.Rules, groups)
			parts := make([]string, len(rs))
			for j, r := range rs {
				parts[j] = names[r]
			}
			want[k][strings.Join(parts, "|")]++
		}
		if len(want) == 0 {
			t.Fatalf("%s: no solutions to check", tc.name)
		}
		if fmt.Sprint(groups) != fmt.Sprint(tc.groups) {
			t.Errorf("%s: groups %v, want %v", tc.name, groups, tc.groups)
		}
		for k, sets := range want {
			h, err := g.HexSummary(k[0], k[1])
			if err != nil {
				t.Fatal(err)
			}
			if fmt.Sprint(h.Groups) != fmt.Sprint(groups) {
				t.Errorf("%s: groups %v, want %v", tc.name, h.Groups, groups)
			}
			got := make(map[string]int)
			total := 0
			for _, s := range h.Sets {
				got[strings.Join(s.Rules, "|")] += s.Worlds
				total += s.Worlds
			}
			if total != h.Worlds {
				t.Errorf("%s: hex %v sets hold %d worlds, want %d", tc.name, k, total, h.Worlds)
			}
			if len(got) != len(sets) {
				t.Errorf("%s: hex %v has %d sets, want %d", tc.name, k, len(got), len(sets))
			}
			for key, n := range sets {
				if got[key] != n {
					t.Errorf("%s: hex %v set %s has %d worlds, Solve found %d", tc.name, k, key, got[key], n)
				}
			}
		}
	}
}
