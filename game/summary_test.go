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

func TestColors(t *testing.T) {
	in := `tiles 6F 1F 3 5F 4 2F
stone 0 1 blue
colors red cyan purple
mode basic
disc cyan 6 2
cube purple 3 5
disc 1 1 1
rule cyan Distance 1 from Swamp
`
	g, err := Parse(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if g.Players != 3 || g.ColorName(2) != "cyan" || g.ColorName(3) != "purple" {
		t.Fatalf("colors: players %d, seats %q", g.Players, g.Colors)
	}
	want := []Marker{{Player: 2, X: 6, Y: 2}, {Player: 3, X: 3, Y: 5, Cube: true}, {Player: 1, X: 1, Y: 1}}
	if !reflect.DeepEqual(g.Markers, want) {
		t.Errorf("markers %+v, want %+v", g.Markers, want)
	}
	if g.Known[2] != "Distance 1 from Swamp" {
		t.Errorf("known %v", g.Known)
	}
	g2, err := Parse(strings.NewReader(g.Format()))
	if err != nil || !reflect.DeepEqual(g, g2) {
		t.Errorf("round trip: %v\n%s", err, g.Format())
	}
	// Printing shows pieces in their colour: cyan is colour 4, purple 5.
	b, _ := g.Board()
	d := g.DisplayBoard(b)
	if d[2][6].Discs != 1<<3 || d[5][3].Cube != 5 {
		t.Errorf("display: discs %b cube %d", d[2][6].Discs, d[5][3].Cube)
	}
	for _, bad := range []string{"colors red red green", "colors red blue green", "disc yellow 1 1\ncolors red cyan green"} {
		if _, err := Parse(strings.NewReader("tiles 1 2 3 4 5 6\nmode basic\n" + bad + "\n")); err == nil {
			t.Errorf("%q: want error", bad)
		}
	}
}
