package game

import (
	"math"
	"testing"
)

// TestAdviseTurnBruteForce recomputes question gain and leak, and search
// chances, directly from the full list of worlds.
func TestAdviseTurnBruteForce(t *testing.T) {
	g := loadFile(t, "../examples/advanced.txt")
	g.Markers = []Marker{
		{Player: 2, X: 5, Y: 3}, {Player: 3, X: 0, Y: 0, Cube: true},
		{Player: 4, X: 6, Y: 6}, {Player: 2, X: 9, Y: 8, Cube: true},
	}
	// Give player 1 a rule they could hold.
	all, err := g.Solve()
	if err != nil {
		t.Fatal(err)
	}
	me := 1
	g.Known = map[int]string{me: all.Rules[all.Solutions[len(all.Solutions)/2].Rules[me-1]].Name}

	adv, err := g.AdviseTurn(me, 0.5)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := g.Board()
	masks := make([][]bool, len(all.Rules))
	known := -1
	for i, r := range all.Rules {
		masks[i] = r.OnBoard(&b).ToBoolSlice()
		if r.Name == g.Known[me] {
			known = i
		}
	}
	var mine []int // indices into all.Solutions that we consider possible
	for i, s := range all.Solutions {
		if s.Rules[me-1] == known {
			mine = append(mine, i)
		}
	}
	hist := func(idx []int, keep func(int) bool) []float64 {
		h := make([]float64, cells)
		for _, i := range idx {
			if keep(i) {
				h[all.Solutions[i].Location]++
			}
		}
		return h
	}
	everyone := make([]int, len(all.Solutions))
	for i := range everyone {
		everyone[i] = i
	}

	checked := 0
	for qi, q := range adv.Questions {
		if qi%37 != 0 { // a spread-out sample keeps the test fast
			continue
		}
		j, h := q.Player-1, q.Y*12+q.X
		ans := func(i int) bool { return masks[all.Solutions[i].Rules[j]][h] }
		tot, h0 := entropy(hist(mine, func(int) bool { return true }))
		ty, hy := entropy(hist(mine, ans))
		tn, hn := entropy(hist(mine, func(i int) bool { return !ans(i) }))
		gain := h0 - (ty*hy+tn*hn)/tot

		leak := tn / tot * adv.CubeLeak
		for k := 0; k < g.Players; k++ {
			if k == me-1 || k == j {
				continue
			}
			for _, i := range mine {
				rk, a := all.Solutions[i].Rules[k], ans(i)
				view := func(c int) bool { return all.Solutions[c].Rules[k] == rk }
				_, before := entropy(hist(everyone, view))
				_, after := entropy(hist(everyone, func(c int) bool { return view(c) && ans(c) == a }))
				leak += (before - after) / tot
			}
		}
		if math.Abs(gain-q.Gain) > 1e-9 || math.Abs(leak-q.Leak) > 1e-9 || math.Abs(q.PYes-ty/tot) > 1e-9 {
			t.Errorf("ask P%d (%d,%d): got gain %.6f leak %.6f pyes %.4f, brute force %.6f %.6f %.4f",
				q.Player, q.X, q.Y, q.Gain, q.Leak, q.PYes, gain, leak, ty/tot)
		}
		checked++
	}
	locs := hist(mine, func(int) bool { return true })
	for _, s := range adv.Searches {
		if p := locs[s.Y*12+s.X] / float64(len(mine)); math.Abs(p-s.P) > 1e-9 {
			t.Errorf("search (%d,%d): got %.4f, want %.4f", s.X, s.Y, s.P, p)
		}
	}
	t.Logf("%d questions (%d checked), %d searches, %d locations", len(adv.Questions), checked, len(adv.Searches), adv.Locations)
}
