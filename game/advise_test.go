package game

import (
	"math"
	"os"
	"testing"
)

func loadFile(t *testing.T, path string) *Game {
	f, err := os.Open(path)
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

// TestAdviseCubeBruteForce checks AdviseCube's counting shortcuts against
// re-solving the game with each cube actually placed.
func TestAdviseCubeBruteForce(t *testing.T) {
	for _, tc := range []struct {
		file string
		me   int
	}{
		{"../examples/game.txt", 1},
		{"../examples/setup.txt", 2},
	} {
		g := loadFile(t, tc.file)
		if _, ok := g.Known[tc.me]; !ok {
			// Give the placer a rule they could have.
			res, err := g.Solve()
			if err != nil {
				t.Fatal(err)
			}
			g.Known = map[int]string{tc.me: res.Rules[res.Solutions[0].Rules[tc.me-1]].Name}
		}
		opts, err := g.AdviseCube(tc.me)
		if err != nil {
			t.Fatal(err)
		}
		if len(opts) == 0 {
			t.Fatalf("%s: no options", tc.file)
		}
		for i := 1; i < len(opts); i++ {
			if opts[i].Bits < opts[i-1].Bits-1e-9 {
				t.Errorf("%s: options not sorted at %d", tc.file, i)
			}
		}
		for _, o := range opts {
			bits, loc := bruteForceCube(t, g, tc.me, o.X, o.Y)
			if bits < 0 {
				t.Errorf("%s (%d,%d): negative bits %v", tc.file, o.X, o.Y, bits)
			}
			if math.Abs(bits-o.Bits) > 1e-9 || math.Abs(loc-o.LocBits) > 1e-9 {
				t.Errorf("%s (%d,%d): got bits %.6f loc %.6f, brute force %.6f %.6f",
					tc.file, o.X, o.Y, o.Bits, o.LocBits, bits, loc)
			}
		}
		t.Logf("%s: %d options, best %.3f bits, worst %.3f bits", tc.file, len(opts), opts[0].Bits, opts[len(opts)-1].Bits)
	}
}

func bruteForceCube(t *testing.T, g *Game, me, x, y int) (bits, loc float64) {
	open := *g
	open.Known = nil
	before, err := open.Solve()
	if err != nil {
		t.Fatal(err)
	}
	open.Markers = append(append([]Marker(nil), g.Markers...), Marker{Player: me, X: x, Y: y, Cube: true})
	after, err := open.Solve()
	if err != nil {
		t.Fatal(err)
	}
	knownIdx := map[int]int{}
	for p, name := range g.Known {
		for i, r := range before.Rules {
			if r.Name == name {
				knownIdx[p-1] = i
			}
		}
	}
	locEntropy := func(res *Result, j, rj int) (float64, float64) {
		var hist [cells]float64
		for _, s := range res.Solutions {
			if s.Rules[j] == rj {
				hist[s.Location]++
			}
		}
		return entropy(hist[:])
	}
	for j := 0; j < g.Players; j++ {
		if j == me-1 {
			continue
		}
		weights := map[int]float64{}
		var sum float64
		for _, s := range before.Solutions {
			ok := true
			for k, r := range knownIdx {
				ok = ok && s.Rules[k] == r
			}
			if ok {
				weights[s.Rules[j]]++
				sum++
			}
		}
		for rj, w := range weights {
			t0, h0 := locEntropy(before, j, rj)
			t1, h1 := locEntropy(after, j, rj)
			bits += w / sum * math.Log2(t0/t1)
			loc += w / sum * (h0 - h1)
		}
	}
	return bits, loc
}
