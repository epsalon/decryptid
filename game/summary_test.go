package game

import (
	"reflect"
	"strings"
	"testing"
)

func TestFormatRoundTrip(t *testing.T) {
	for _, f := range []string{"../examples/game.txt", "../examples/advanced.txt", "../examples/setup.txt"} {
		g := loadFile(t, f)
		g.AnyClues = true
		g2, err := Parse(strings.NewReader(g.Format()))
		if err != nil {
			t.Fatalf("%s: %v\n%s", f, err, g.Format())
		}
		if !reflect.DeepEqual(g, g2) {
			t.Errorf("%s: round trip changed the game:\n%+v\n%+v", f, g, g2)
		}
	}
}

func TestSummaryMatchesSolve(t *testing.T) {
	for _, f := range []string{"../examples/game.txt", "../examples/setup.txt"} {
		g := loadFile(t, f)
		res, err := g.Solve()
		if err != nil {
			t.Fatal(err)
		}
		s, err := g.Summary()
		if err != nil {
			t.Fatal(err)
		}
		if s.Worlds != len(res.Solutions) {
			t.Errorf("%s: %d worlds, Solve found %d", f, s.Worlds, len(res.Solutions))
		}
		locs := res.Locations()
		if len(s.Locations) != len(locs) {
			t.Fatalf("%s: %d locations, Solve found %d", f, len(s.Locations), len(locs))
		}
		want := map[LocCount]bool{}
		for _, l := range locs {
			want[LocCount{X: l.X, Y: l.Y, Worlds: len(l.Solutions)}] = true
		}
		for _, got := range s.Locations {
			if !want[got] {
				t.Errorf("%s: unexpected location %+v", f, got)
			}
		}
		for j, rcs := range s.PlayerRules {
			sum := 0
			for _, rc := range rcs {
				sum += rc.Worlds
			}
			if sum != s.Worlds {
				t.Errorf("%s: player %d rule counts sum to %d, want %d", f, j+1, sum, s.Worlds)
			}
		}
	}
}
