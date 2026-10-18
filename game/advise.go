package game

import (
	"fmt"
	"math"
	"sort"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

const cells = board.Width * board.Height

// CubeOption is a hex where a player may place a cube, scored by how much
// it tells the other players. Scores are expectations over the rules the
// other players may hold, summed over those players.
type CubeOption struct {
	X int `json:"x"`
	Y int `json:"y"`
	// Bits is the information the cube gives about the world (who holds
	// which rule, and so where the cryptid is): -log2 of the fraction of a
	// player's possible worlds that survive. Never negative.
	Bits float64 `json:"bits"`
	// PerPlayer[j] is player j+1's share of Bits (0 for the placer).
	PerPlayer []float64 `json:"perPlayer"`
	// LocBits is the drop in the players' uncertainty (entropy) about the
	// cryptid's location. It can be negative: ruling out the likeliest
	// hexes can leave the rest more evenly spread.
	LocBits float64 `json:"locBits"`
	// LocPerPlayer[j] is player j+1's share of LocBits (0 for the placer).
	LocPerPlayer []float64 `json:"locPerPlayer"`
}

// AdviseCube ranks the hexes where player me (1-based) may place a cube
// (their rule rules the hex out and it has no cube yet), giving away the
// least information first. Player me's rule must be known.
//
// The model: a world is a valid assignment of rules to players that fits
// all markers, and all worlds are equally likely. Another player j knows
// only their own rule rj, so they consider every world where j holds rj.
// The cube removes the worlds where me's rule allows the hex. Since we don't
// know rj, the result for j is averaged over the rules j holds in the
// worlds we consider possible (those that match every known rule).
func (g *Game) AdviseCube(me int) ([]CubeOption, error) {
	if me < 1 || me > g.Players {
		return nil, fmt.Errorf("player %d out of range 1-%d", me, g.Players)
	}
	p, err := g.prepare(false)
	if err != nil {
		return nil, err
	}
	m := me - 1
	mine := p.known[m]
	if mine < 0 {
		return nil, fmt.Errorf("player %d's rule must be known to advise on cubes", me)
	}
	n, nr := g.Players, len(p.rules)

	// cnt[j][rj][r][loc]: worlds where player j holds rj, the placer holds r,
	// and the cryptid is at loc. wt[j][rj]: worlds we consider possible
	// (every known rule matches) where j holds rj.
	cnt := make([]int32, n*nr*nr*cells)
	wt := make([]float64, n*nr)
	idx := func(j, rj, r int) int { return ((j*nr+rj)*nr + r) * cells }
	// Others' views: all worlds, sampled when there are very many.
	search.EachSampled(p.masks, p.cands, !g.AnyClues, g.setSampler(p), func(rules []int, loc int) {
		for j, rj := range rules {
			if j != m {
				cnt[idx(j, rj, rules[m])+loc]++
			}
		}
	})
	// Our view: exact.
	search.Each(p.masks, ourCands(p), !g.AnyClues, func(rules []int, loc int) {
		for j, rj := range rules {
			if j != m {
				wt[j*nr+rj]++
			}
		}
	})

	// Each other player's view before the cube, for each rule they may hold.
	type view struct {
		j, rj   int
		weight  float64 // share of our possible worlds where j holds rj
		total   float64
		entropy float64
	}
	var views []view
	for j := 0; j < n; j++ {
		if j == m {
			continue
		}
		var sum float64
		for rj := 0; rj < nr; rj++ {
			sum += wt[j*nr+rj]
		}
		if sum == 0 {
			return nil, fmt.Errorf("no world fits the markers and known rules")
		}
		for rj := 0; rj < nr; rj++ {
			if wt[j*nr+rj] == 0 {
				continue
			}
			var hist [cells]float64
			for r := 0; r < nr; r++ {
				for loc, c := range cnt[idx(j, rj, r) : idx(j, rj, r)+cells] {
					hist[loc] += float64(c)
				}
			}
			t, h := entropy(hist[:])
			if t == 0 {
				continue // lost to sampling; vanishingly rare
			}
			views = append(views, view{j, rj, wt[j*nr+rj] / sum, t, h})
		}
	}

	var out []CubeOption
	for h := 0; h < cells; h++ {
		x, y := h%board.Width, h/board.Width
		if p.masks[mine].Bit(h) || p.board[y][x].Cube != 0 {
			continue
		}
		opt := CubeOption{X: x, Y: y, PerPlayer: make([]float64, n), LocPerPlayer: make([]float64, n)}
		for _, v := range views {
			// Worlds j keeps: those where the placer's rule rules out h.
			var hist [cells]float64
			for r := 0; r < nr; r++ {
				if p.masks[r].Bit(h) {
					continue
				}
				for loc, c := range cnt[idx(v.j, v.rj, r) : idx(v.j, v.rj, r)+cells] {
					hist[loc] += float64(c)
				}
			}
			t, e := entropy(hist[:])
			if t == 0 {
				continue // lost to sampling
			}
			opt.PerPlayer[v.j] += v.weight * math.Log2(v.total/t)
			opt.LocBits += v.weight * (v.entropy - e)
			opt.LocPerPlayer[v.j] += v.weight * (v.entropy - e)
		}
		for _, b := range opt.PerPlayer {
			opt.Bits += b
		}
		out = append(out, opt)
	}
	sort.SliceStable(out, func(a, b int) bool {
		if math.Abs(out[a].Bits-out[b].Bits) > 1e-9 {
			return out[a].Bits < out[b].Bits
		}
		return out[a].LocBits < out[b].LocBits
	})
	return out, nil
}

// entropy returns the total count and the Shannon entropy (bits) of the
// distribution given by counts.
func entropy(counts []float64) (total, bits float64) {
	var s float64
	for _, c := range counts {
		if c > 0 {
			total += c
			s += c * math.Log2(c)
		}
	}
	if total == 0 {
		return 0, 0
	}
	return total, math.Log2(total) - s/total
}
