package game

import (
	"math/rand"
	"os"
	"reflect"
	"testing"

	"github.com/epsalon/decryptid/board"
)

func loadSetup(t *testing.T) *Game {
	f, err := os.Open("../examples/setup.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	g, err := Parse(f)
	if err != nil {
		t.Fatal(err)
	}
	return g
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
