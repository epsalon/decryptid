package game

import (
	"math/rand"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

func loadGame(tb testing.TB, path string) *Game {
	tb.Helper()
	f, err := os.Open(path)
	if err != nil {
		tb.Fatal(err)
	}
	defer f.Close()
	g, err := Parse(f)
	if err != nil {
		tb.Fatal(err)
	}
	return g
}

func loadSetup(tb testing.TB) *Game {
	return loadGame(tb, "../examples/setup.txt")
}

// TestMarkersNarrowDown plays out random games: pick a real solution, have
// players place markers that agree with their rules, and check that the
// solver keeps that solution and only returns solutions fitting the markers.
func TestMarkersNarrowDown(t *testing.T) {
	g := loadSetup(t)
	base, err := g.Solve()
	if err != nil {
		t.Fatal(err)
	}
	if len(base.Solutions) == 0 {
		t.Fatal("no solutions on empty board")
	}
	rng := rand.New(rand.NewSource(1))
	for trial := 0; trial < 20; trial++ {
		truth := base.Solutions[rng.Intn(len(base.Solutions))]
		b := board.MakeBoard(g.Spec)
		allowed := make([][]bool, g.Players)
		for p, r := range truth.Rules {
			allowed[p] = base.Rules[r].OnBoard(&b).ToBoolSlice()
		}
		tg := *g
		tg.Markers = nil
		cubed := map[int]bool{}
		for i := 0; i < 12; i++ {
			p, cell := rng.Intn(g.Players), rng.Intn(board.Width*board.Height)
			m := Marker{Player: p + 1, X: cell % board.Width, Y: cell / board.Width}
			if !allowed[p][cell] {
				if cubed[cell] {
					continue
				}
				m.Cube, cubed[cell] = true, true
			}
			tg.Markers = append(tg.Markers, m)
		}
		if trial%2 == 0 {
			tg.Known = map[int]string{1: base.Rules[truth.Rules[0]].Name}
		}
		res, err := tg.Solve()
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, s := range res.Solutions {
			if reflect.DeepEqual(s, truth) {
				found = true
			}
			for p, r := range s.Rules {
				mask := base.Rules[r].OnBoard(&b).ToBoolSlice()
				for _, m := range tg.Markers {
					if m.Player == p+1 && mask[m.Y*board.Width+m.X] == m.Cube {
						t.Errorf("trial %d: solution %v breaks marker %+v", trial, s, m)
					}
				}
			}
		}
		if !found {
			t.Errorf("trial %d: true solution %v missing", trial, truth)
		}
		if len(res.Solutions) > len(base.Solutions) {
			t.Errorf("trial %d: markers added solutions", trial)
		}
		t.Logf("trial %d: %d markers -> %d solutions, %d locations", trial, len(tg.Markers), len(res.Solutions), len(res.Locations()))
	}
}

func TestParseErrors(t *testing.T) {
	g := loadSetup(t)
	g.Markers = []Marker{{Player: 1, X: 0, Y: 0, Cube: true}, {Player: 2, X: 0, Y: 0, Cube: true}}
	if _, err := g.Solve(); err == nil {
		t.Error("two cubes on one hex: want error")
	}
	g.Markers = nil
	g.Known = map[int]string{1: "Not Distance 1 from Water"} // advanced-only rule in a basic game
	if _, err := g.Solve(); err == nil {
		t.Error("unknown rule: want error")
	}
}

func TestBlackBuildings(t *testing.T) {
	const black = "Distance 3 from Black structure"
	has := func(g *Game) bool {
		for _, r := range g.Rules() {
			if r.Name == black {
				return true
			}
		}
		return false
	}
	if g := loadSetup(t); has(g) {
		t.Errorf("basic game offers %q", black)
	}

	in := "tiles 6F 1F 3 5F 4 2F\nstone 4 6 black\nmode advanced\nrule 1 " + black + "\n"
	g, err := Parse(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if !has(g) {
		t.Errorf("advanced game lacks %q", black)
	}
	b, _ := g.Board()
	if h := b[6][4]; h.B != board.Stone || h.C != board.Black {
		t.Errorf("hex (4,6) = %+v, want black stone", h)
	}
	res, err := g.Solve()
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range res.Locations() {
		if d := hexDist(l.X, l.Y, 4, 6); d > 3 {
			t.Errorf("location (%d,%d) is %d from the black stone", l.X, l.Y, d)
		}
	}

	if _, err := Parse(strings.NewReader("tiles 1 2 3 4 5 6\nshed 0 0 black\nmode basic\n")); err == nil {
		t.Error("black building in basic game: want error")
	}
}

// hexDist is the hex distance between columns/rows in the board's layout
// (odd columns shifted down), computed independently of the rule package.
func hexDist(x1, y1, x2, y2 int) int {
	cube := func(x, y int) (int, int, int) {
		q := x
		r := y - (x-(x&1))/2
		return q, r, -q - r
	}
	a1, b1, c1 := cube(x1, y1)
	a2, b2, c2 := cube(x2, y2)
	abs := func(v int) int {
		if v < 0 {
			return -v
		}
		return v
	}
	return max(abs(a1-a2), abs(b1-b2), abs(c1-c2))
}

// BenchmarkSolve measures the end-to-end solving and search process across
// multiple representative game configurations (in-progress game, empty setups
// with 3 to 5 players, and advanced rules).
func BenchmarkSolve(b *testing.B) {
	b.Run("GameInProgress", func(b *testing.B) {
		g := loadGame(b, "../examples/game.txt")
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("Setup3P", func(b *testing.B) {
		g := loadGame(b, "../examples/setup.txt")
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("Setup4P", func(b *testing.B) {
		g := loadGame(b, "../examples/setup.txt")
		g.Players = 4
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("Setup5P", func(b *testing.B) {
		g := loadGame(b, "../examples/setup.txt")
		g.Players = 5
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("Advanced4P", func(b *testing.B) {
		g := loadGame(b, "../examples/advanced.txt")
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
}

// BenchmarkSolveStages breaks down the solving process into individual stages:
// board/candidate preparation, combinatorial search, and the full Solve.
func BenchmarkSolveStages(b *testing.B) {
	g := loadGame(b, "../examples/game.txt")
	b.Run("Prepare", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			if _, err := g.prepare(true); err != nil {
				b.Fatal(err)
			}
		}
	})
	p, err := g.prepare(true)
	if err != nil {
		b.Fatal(err)
	}
	b.Run("Search", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_ = search.Solve(p.masks, p.cands, !g.AnyClues)
		}
	})
	b.Run("FullSolve", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			if _, err := g.Solve(); err != nil {
				b.Fatal(err)
			}
		}
	})
}
