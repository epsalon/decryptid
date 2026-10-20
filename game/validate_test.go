package game

import (
	"fmt"
	"math/rand"
	"testing"
)

// TestValidateMatchesSolve checks Validate against the full enumeration: a
// complete clue set is valid exactly when Solve lists it as a solution.
func TestValidateMatchesSolve(t *testing.T) {
	g := loadSetup(t)
	base, err := g.Solve()
	if err != nil {
		t.Fatal(err)
	}
	key := func(rs []int) string { return fmt.Sprint(rs) }
	valid := map[string]bool{}
	for _, s := range base.Solutions {
		valid[key(s.Rules)] = true
	}
	rng := rand.New(rand.NewSource(1))
	try := func(rs []int) {
		tg := *g
		tg.Known = map[int]string{}
		for p, r := range rs {
			tg.Known[p+1] = base.Rules[r].Name
		}
		got, err := tg.Validate()
		if err != nil {
			t.Fatal(err)
		}
		if got != valid[key(rs)] {
			t.Errorf("rules %v: Validate = %v, Solve says %v", rs, got, valid[key(rs)])
		}
	}
	for _, s := range base.Solutions[:min(len(base.Solutions), 20)] {
		try(s.Rules) // a real solution
		bad := append([]int(nil), s.Rules...)
		bad[rng.Intn(len(bad))] = rng.Intn(len(base.Rules)) // probably not
		try(bad)
	}
	for i := 0; i < 50; i++ {
		rs := make([]int, g.Players)
		for p := range rs {
			rs[p] = rng.Intn(len(base.Rules))
		}
		try(rs)
	}
}

// TestValidateMarkers: clues that contradict a player's own markers are
// invalid, not an error, and a malformed game is an error.
func TestValidateMarkers(t *testing.T) {
	g := loadSetup(t)
	base, err := g.Solve()
	if err != nil {
		t.Fatal(err)
	}
	truth := base.Solutions[0]
	g.Known = map[int]string{}
	for p, r := range truth.Rules {
		g.Known[p+1] = base.Rules[r].Name
	}
	if ok, err := g.Validate(); err != nil || !ok {
		t.Fatalf("true clues: ok=%v err=%v", ok, err)
	}
	// A cube on a hex player 1's rule allows contradicts that rule.
	b, _ := g.Board()
	allowed := base.Rules[truth.Rules[0]].OnBoard(&b).ToBoolSlice()
	for cell, ok := range allowed {
		if ok {
			g.Markers = []Marker{{Player: 1, X: cell % 12, Y: cell / 12, Cube: true}}
			break
		}
	}
	if ok, err := g.Validate(); err != nil || ok {
		t.Errorf("clue contradicting a cube: ok=%v err=%v, want invalid", ok, err)
	}
	g.Markers = []Marker{{Player: g.Players + 1, X: 0, Y: 0}}
	if _, err := g.Validate(); err == nil {
		t.Error("marker for a missing player: want an error")
	}
}
