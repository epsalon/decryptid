package game

import (
	"math"
	"testing"
)

// TestSamplingAccuracy compares sampled advice with exact advice on a game
// big enough to be sampled when the limit is lowered.
func TestSamplingAccuracy(t *testing.T) {
	g := loadFile(t, "../examples/advanced.txt")
	g.Known = map[int]string{1: "Distance 2 from Standing Stone"}
	defer func(old int) { SampleLimit = old }(SampleLimit)

	SampleLimit = 0
	exactTurn, err := g.AdviseTurn(1, 0.5)
	if err != nil {
		t.Fatal(err)
	}
	exactCube, _ := g.AdviseCube(1)
	s, _ := g.Summary()
	t.Logf("%d possible worlds for us", s.Worlds)

	SampleLimit = 50000
	turn, _ := g.AdviseTurn(1, 0.5)
	cube, _ := g.AdviseCube(1)

	leak := map[[3]int]float64{}
	for _, q := range exactTurn.Questions {
		leak[[3]int{q.Player, q.X, q.Y}] = q.Leak
	}
	var maxErr float64
	for _, q := range turn.Questions {
		maxErr = math.Max(maxErr, math.Abs(q.Leak-leak[[3]int{q.Player, q.X, q.Y}]))
		if e := exactTurn.Questions; q.Gain != 0 && math.Abs(q.Gain-func() float64 {
			for _, x := range e {
				if x.Player == q.Player && x.X == q.X && x.Y == q.Y {
					return x.Gain
				}
			}
			return math.NaN()
		}()) > 1e-9 {
			t.Errorf("gain should be exact, differs for %+v", q)
		}
	}
	bits := map[[2]int]float64{}
	for _, o := range exactCube {
		bits[[2]int{o.X, o.Y}] = o.Bits
	}
	var maxCube float64
	for _, o := range cube {
		maxCube = math.Max(maxCube, math.Abs(o.Bits-bits[[2]int{o.X, o.Y}]))
	}
	t.Logf("max leak error %.3f bits; max cube error %.3f bits", maxErr, maxCube)
	if maxErr > 0.1 || maxCube > 0.1 {
		t.Errorf("sampling error too large")
	}
}
