package game

import (
	"fmt"
	"math"
	"sort"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

// Question is asking Player (1-based) whether the cryptid could be at (X, Y).
type Question struct {
	Player int
	X, Y   int
	PYes   float64 // chance, from our view, that the answer is a disc
	Gain   float64 // expected bits we learn about the cryptid's location
	// Leak is the expected drop in the other players' uncertainty about
	// the location (summed over them): from the answer, for players other
	// than the one asked, plus our penalty cube when the answer is a cube.
	// Same units as Gain.
	Leak  float64
	Score float64 // Gain - lambda*Leak
}

// Search is searching (X, Y), which wins if the cryptid is there.
type Search struct {
	X, Y int
	P    float64 // chance, from our view, that the cryptid is there
}

// TurnAdvice ranks a player's options for their turn.
type TurnAdvice struct {
	Questions []Question // best Score first
	Searches  []Search   // most likely first; only hexes with P > 0
	Entropy   float64    // our uncertainty about the location, in bits
	Locations int        // hexes the cryptid may be on, from our view
	CubeLeak  float64    // location bits our best penalty cube would give others
	MaxGain   float64    // the most any question could teach us
}

// AdviseTurn scores every question and search open to player me (1-based),
// whose rule must be known. lambda weighs information given to others
// against information gained (0 ignores it).
//
// Gain is the mutual information between the answer and the cryptid's
// location over the worlds we consider possible. For leak, as in
// AdviseCube, another player k knows only their own rule rk and considers
// every world where k holds rk; the answer narrows that, and we average the
// drop in their location entropy over the worlds we consider possible.
func (g *Game) AdviseTurn(me int, lambda float64) (*TurnAdvice, error) {
	if me < 1 || me > g.Players {
		return nil, fmt.Errorf("player %d out of range 1-%d", me, g.Players)
	}
	p, err := g.prepare(false)
	if err != nil {
		return nil, err
	}
	m, n, nr := me-1, g.Players, len(p.rules)
	if p.known[m] < 0 {
		return nil, fmt.Errorf("player %d's rule must be known to advise a turn", me)
	}

	// mine[j][rj][loc]: our possible worlds where j holds rj, cryptid at loc.
	// pairMine[k][rk][j][rj]: our possible worlds where k holds rk and j rj.
	// others[k][rk][j][rj][loc]: all worlds where k holds rk, j holds rj and
	// the cryptid is at loc, for k, j other than us (indexed by oi).
	mine := make([]float64, n*nr*cells)
	pairMine := make([]float64, n*nr*n*nr)
	pair := func(k, rk, j, rj int) int { return ((k*nr+rk)*n+j)*nr + rj }
	oi := func(k int) int { // index among the other players
		if k > m {
			return k - 1
		}
		return k
	}
	no := n - 1
	others := make([]int32, no*nr*no*nr*cells)
	oidx := func(k, rk, j, rj int) int { return (((oi(k)*nr+rk)*no+oi(j))*nr + rj) * cells }
	var total float64
	search.Each(p.masks, p.cands, !g.AnyClues, func(rules []int, loc int) {
		possible := true
		for k, r := range p.known {
			if r >= 0 && rules[k] != r {
				possible = false
				break
			}
		}
		for k, rk := range rules {
			for j, rj := range rules {
				if k == j {
					continue
				}
				if possible {
					pairMine[pair(k, rk, j, rj)]++
				}
				if k != m && j != m {
					others[oidx(k, rk, j, rj)+loc]++
				}
			}
		}
		if possible {
			total++
			for j, rj := range rules {
				mine[(j*nr+rj)*cells+loc]++
			}
		}
	})
	if total == 0 {
		return nil, fmt.Errorf("no world fits the markers and known rules")
	}

	adv := &TurnAdvice{}
	locs := mine[(m*nr+p.known[m])*cells:][:cells]
	_, adv.Entropy = entropy(locs)
	for _, c := range locs {
		if c > 0 {
			adv.Locations++
		}
	}
	if cubes, err := g.AdviseCube(me); err == nil && len(cubes) > 0 {
		adv.CubeLeak = cubes[0].LocBits
	}

	for h := 0; h < cells; h++ {
		x, y := h%board.Width, h/board.Width
		hex := p.board[y][x]
		if hex.Cube != 0 {
			continue // no one may interact with a cubed hex
		}
		if locs[h] > 0 && p.masks[p.known[m]].Bit(h) {
			adv.Searches = append(adv.Searches, Search{X: x, Y: y, P: locs[h] / total})
		}
		for j := 0; j < n; j++ {
			if j == m || hex.Discs&(1<<j) != 0 {
				continue
			}
			q := Question{Player: j + 1, X: x, Y: y}
			var yes, no [cells]float64
			for rj := 0; rj < nr; rj++ {
				dst := &no
				if p.masks[rj].Bit(h) {
					dst = &yes
				}
				for loc, c := range mine[(j*nr+rj)*cells:][:cells] {
					dst[loc] += c
				}
			}
			ty, hy := entropy(yes[:])
			tn, hn := entropy(no[:])
			q.PYes = ty / total
			q.Gain = adv.Entropy - (ty*hy+tn*hn)/total
			q.Leak = (tn / total) * adv.CubeLeak
			for k := 0; k < n; k++ {
				if k == m || k == j {
					continue
				}
				for rk := 0; rk < nr; rk++ {
					// Our weight on each answer, given k holds rk.
					var wy, wn float64
					for rj := 0; rj < nr; rj++ {
						w := pairMine[pair(k, rk, j, rj)]
						if p.masks[rj].Bit(h) {
							wy += w
						} else {
							wn += w
						}
					}
					if wy+wn == 0 {
						continue
					}
					// k's location distribution, split by the answer.
					var ky, kn [cells]float64
					for rj := 0; rj < nr; rj++ {
						dst := &kn
						if p.masks[rj].Bit(h) {
							dst = &ky
						}
						for loc, c := range others[oidx(k, rk, j, rj):][:cells] {
							dst[loc] += float64(c)
						}
					}
					var kall [cells]float64
					for loc := range kall {
						kall[loc] = ky[loc] + kn[loc]
					}
					_, h0 := entropy(kall[:])
					_, hy := entropy(ky[:])
					_, hn := entropy(kn[:])
					q.Leak += (wy*(h0-hy) + wn*(h0-hn)) / total
				}
			}
			q.Score = q.Gain - lambda*q.Leak
			adv.MaxGain = math.Max(adv.MaxGain, q.Gain)
			adv.Questions = append(adv.Questions, q)
		}
	}
	sort.SliceStable(adv.Questions, func(a, b int) bool {
		return adv.Questions[a].Score > adv.Questions[b].Score
	})
	sort.SliceStable(adv.Searches, func(a, b int) bool {
		return adv.Searches[a].P > adv.Searches[b].P
	})
	return adv, nil
}

// Choose picks the turn to take: search the likeliest hex once its chance
// reaches searchAt (or when no question would teach us anything), otherwise
// ask the best-scoring question that teaches us something. At most one
// result is non-nil; both are nil only when no action is legal.
func (a *TurnAdvice) Choose(searchAt float64) (*Question, *Search) {
	if len(a.Searches) > 0 {
		s := &a.Searches[0]
		if s.P >= searchAt-1e-9 || a.MaxGain < 1e-9 {
			return nil, s
		}
	}
	for i := range a.Questions {
		if a.Questions[i].Gain >= 1e-9 || a.MaxGain < 1e-9 {
			return &a.Questions[i], nil
		}
	}
	return nil, nil
}
