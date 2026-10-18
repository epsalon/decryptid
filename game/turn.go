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
	Player int     `json:"player"`
	X      int     `json:"x"`
	Y      int     `json:"y"`
	PYes   float64 `json:"pYes"` // chance, from our view, that the answer is a disc
	Gain   float64 `json:"gain"` // expected bits we learn about the cryptid's location
	// Leak is the expected drop in the other players' uncertainty about
	// the location (summed over them): from the answer, for players other
	// than the one asked, plus our penalty cube when the answer is a cube.
	// Same units as Gain.
	Leak  float64 `json:"leak"`
	Score float64 `json:"score"` // Gain - lambda*Leak
}

// Search is searching (X, Y), which wins if the cryptid is there.
type Search struct {
	X     int     `json:"x"`
	Y     int     `json:"y"`
	P     float64 `json:"p"`     // chance, from our view, that the cryptid is there (we win)
	Gain  float64 `json:"gain"`  // expected bits we learn about the location when it fails
	Leak  float64 `json:"leak"`  // expected bits given to others, as for questions
	Score float64 `json:"score"` // winValue*P + Gain - lambda*Leak, comparable with Question.Score
}

// TurnAdvice ranks a player's options for their turn.
type TurnAdvice struct {
	Questions []Question `json:"questions"` // best Score first
	Searches  []Search   `json:"searches"`  // the likeliest hexes (P > 0), best Score first
	Entropy   float64    `json:"entropy"`   // our uncertainty about the location, in bits
	Locations int        `json:"locations"` // hexes the cryptid may be on, from our view
	CubeLeak  float64    `json:"cubeLeak"`  // location bits our best penalty cube would give others
	MaxGain   float64    `json:"maxGain"`   // the most any question could teach us
}

// TurnOptions tune how AdviseTurn scores moves.
type TurnOptions struct {
	// Lambda weighs information given to others against information
	// gained (0 ignores it).
	Lambda float64
	// WinValue is what winning is worth in bits, so searches (which may
	// win) rank against questions (see scoreSearches).
	WinValue float64
	// Order weighs leaks by turn order: the player d turns after us counts
	// Order^(d-1), rescaled so the weights average 1. Below 1, helping the
	// next players costs more; 0 or 1 weighs everyone equally.
	Order float64
}

// orderWeights returns each player's leak weight (see TurnOptions.Order);
// ours is 0.
func orderWeights(me, n int, order float64) []float64 {
	w := make([]float64, n)
	if order <= 0 {
		order = 1
	}
	var sum float64
	for d := 1; d < n; d++ {
		k := (me - 1 + d) % n
		w[k] = math.Pow(order, float64(d-1))
		sum += w[k]
	}
	for k := range w {
		w[k] *= float64(n-1) / sum
	}
	return w
}

// AdviseTurn scores every question and search open to player me (1-based),
// whose rule must be known; see TurnOptions.
//
// Gain is the mutual information between the answer and the cryptid's
// location over the worlds we consider possible. For leak, as in
// AdviseCube, another player k knows only their own rule rk and considers
// every world where k holds rk; the answer narrows that, and we average the
// drop in their location entropy over the worlds we consider possible.
func (g *Game) AdviseTurn(me int, opt TurnOptions) (*TurnAdvice, error) {
	lambda, winValue := opt.Lambda, opt.WinValue
	weights := orderWeights(me, g.Players, opt.Order)
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
	// Others' views: all worlds, sampled when there are very many.
	search.EachSampled(p.masks, p.cands, !g.AnyClues, g.setSampler(p), func(rules []int, loc int) {
		for k, rk := range rules {
			if k == m {
				continue
			}
			for j, rj := range rules {
				if j != k && j != m {
					others[oidx(k, rk, j, rj)+loc]++
				}
			}
		}
	})
	// Our view: exact.
	search.Each(p.masks, ourCands(p), !g.AnyClues, func(rules []int, loc int) {
		total++
		for k, rk := range rules {
			mine[(k*nr+rk)*cells+loc]++
			for j, rj := range rules {
				if j != k {
					pairMine[pair(k, rk, j, rj)]++
				}
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
		for k, l := range cubes[0].LocPerPlayer {
			adv.CubeLeak += weights[k] * l
		}
	}

	// Other player k's view of j's answer, for each rule rk that k may hold
	// in our worlds: k's location counts before any answer (all), the
	// entropy of that, and which of j's rules have any worlds in it.
	type kview struct {
		k, rk  int
		all    [cells]float64
		h0     float64
		rjs    []int
		weight []float64 // pairMine weight per rule of j
	}
	kviews := make([][]*kview, n) // by j
	for j := 0; j < n; j++ {
		if j == m {
			continue
		}
		for k := 0; k < n; k++ {
			if k == m || k == j {
				continue
			}
			for rk := 0; rk < nr; rk++ {
				v := &kview{k: k, rk: rk, weight: make([]float64, nr)}
				var w float64
				for rj := 0; rj < nr; rj++ {
					v.weight[rj] = pairMine[pair(k, rk, j, rj)]
					w += v.weight[rj]
				}
				if w == 0 {
					continue // k can't hold rk in our worlds
				}
				for rj := 0; rj < nr; rj++ {
					any := false
					for loc, c := range others[oidx(k, rk, j, rj):][:cells] {
						if c != 0 {
							v.all[loc] += float64(c)
							any = true
						}
					}
					if any {
						v.rjs = append(v.rjs, rj)
					}
				}
				_, v.h0 = entropy(v.all[:])
				kviews[j] = append(kviews[j], v)
			}
		}
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
			for _, v := range kviews[j] {
				// Our weight on each answer, given k holds rk.
				var wy, wn float64
				for rj, w := range v.weight {
					if p.masks[rj].Bit(h) {
						wy += w
					} else {
						wn += w
					}
				}
				// k's location distribution, split by the answer.
				var ky, kn [cells]float64
				for _, rj := range v.rjs {
					if p.masks[rj].Bit(h) {
						for loc, c := range others[oidx(v.k, v.rk, j, rj):][:cells] {
							ky[loc] += float64(c)
						}
					}
				}
				for loc := range kn {
					kn[loc] = v.all[loc] - ky[loc]
				}
				_, hy := entropy(ky[:])
				_, hn := entropy(kn[:])
				q.Leak += weights[v.k] * (wy*(v.h0-hy) + wn*(v.h0-hn)) / total
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
	g.scoreSearches(p, adv, me, lambda, winValue, total, weights)
	sort.SliceStable(adv.Searches, func(a, b int) bool {
		return adv.Searches[a].Score > adv.Searches[b].Score
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
		for i := range a.Searches {
			if a.Searches[i].P > s.P {
				s = &a.Searches[i]
			}
		}
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

// ChooseScored picks the best-scoring move, question or search, from one
// ranking (see AdviseTurn's winValue). A question that teaches us nothing
// is never chosen while another move exists. At most one result is non-nil.
func (a *TurnAdvice) ChooseScored() (*Question, *Search) {
	var q *Question
	for i := range a.Questions {
		if a.Questions[i].Gain >= 1e-9 {
			q = &a.Questions[i]
			break
		}
	}
	var s *Search
	if len(a.Searches) > 0 {
		s = &a.Searches[0]
	}
	switch {
	case q != nil && (s == nil || q.Score > s.Score):
		return q, nil
	case s != nil:
		return nil, s
	case len(a.Questions) > 0:
		return &a.Questions[0], nil
	}
	return nil, nil
}
