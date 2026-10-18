package game

import (
	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

// maxScoredSearches is how many of the likeliest search hexes get a full
// score. Unlikely searches never win the ranking, and each scored hex costs
// work for every world.
const maxScoredSearches = 12

// scoreSearches fills in Gain, Leak and Score for the likeliest searches
// (keeping only those), so they can be ranked against questions:
//
//	Score = winValue*P + Gain - lambda*Leak
//
// A search at h is answered by the other players in turn order until one
// places a cube. Its outcome is who refused first, or a win if nobody did.
// Gain is what a failed search teaches us: the expected drop in our
// location entropy over the non-winning outcomes. Leak is what the others
// learn: our disc says our rule allows h, then they see the outcome; as for
// questions, each opponent k knows only their own rule. A failed search
// also costs our penalty cube (cubeLeak).
func (g *Game) scoreSearches(p *prepared, adv *TurnAdvice, me int, lambda, winValue, total float64, weights []float64) {
	if len(adv.Searches) > maxScoredSearches {
		adv.Searches = adv.Searches[:maxScoredSearches] // sorted by P already
	}
	hs := len(adv.Searches)
	if hs == 0 {
		return
	}
	m, n, nr := me-1, g.Players, len(p.rules)
	hexes := make([]int, hs)
	for i, s := range adv.Searches {
		hexes[i] = s.Y*board.Width + s.X
	}
	// Turn order of the answers: clockwise from the searcher.
	order := make([]int, 0, n-1)
	for i := 1; i < n; i++ {
		order = append(order, (m+i)%n)
	}
	// outcome is 0 for a win, or 1 + the position in order of the first
	// player whose rule rules out hex h.
	outcome := func(rules []int, h int) int {
		for i, j := range order {
			if !p.masks[rules[j]].Bit(h) {
				return i + 1
			}
		}
		return 0
	}
	no := n // outcomes: win, or refused by one of n-1 players

	// Our view (exact): location counts by (hex, outcome), and the weight of
	// each (hex, opponent k, k's rule, outcome).
	mineS := make([]float64, hs*no*cells)
	ours := make([]float64, hs*n*nr*no)
	search.Each(p.masks, ourCands(p), !g.AnyClues, func(rules []int, loc int) {
		for hi, h := range hexes {
			o := outcome(rules, h)
			mineS[(hi*no+o)*cells+loc]++
			for k, rk := range rules {
				if k != m {
					ours[((hi*n+k)*nr+rk)*no+o]++
				}
			}
		}
	})

	// Others' views (sampled when huge): each opponent's location counts
	// before the search, and after seeing our disc on h and the outcome.
	prior := make([]float32, n*nr*cells)
	post := make([]float32, n*nr*hs*no*cells)
	search.EachSampled(p.masks, p.cands, !g.AnyClues, g.setSampler(p), func(rules []int, loc int) {
		mine := p.masks[rules[m]]
		for k, rk := range rules {
			if k != m {
				prior[(k*nr+rk)*cells+loc]++
			}
		}
		for hi, h := range hexes {
			if !mine.Bit(h) {
				continue // our disc on h rules this world out for everyone
			}
			o := outcome(rules, h)
			for k, rk := range rules {
				if k != m {
					post[((((k*nr+rk)*hs+hi)*no+o)*cells)+loc]++
				}
			}
		}
	})

	hist := func(src []float32) []float64 {
		out := make([]float64, cells)
		for i, c := range src {
			out[i] = float64(c)
		}
		return out
	}
	priorH := make([]float64, n*nr)
	for k := 0; k < n; k++ {
		for rk := 0; rk < nr; rk++ {
			_, priorH[k*nr+rk] = entropy(hist(prior[(k*nr+rk)*cells:][:cells]))
		}
	}

	for hi := range adv.Searches {
		s := &adv.Searches[hi]
		var fail float64
		for o := 1; o < no; o++ {
			t, h := entropy(mineS[(hi*no+o)*cells:][:cells])
			s.Gain += t / total * (adv.Entropy - h)
			fail += t
		}
		s.Leak = fail / total * adv.CubeLeak
		for k := 0; k < n; k++ {
			if k == m {
				continue
			}
			for rk := 0; rk < nr; rk++ {
				for o := 0; o < no; o++ {
					w := ours[((hi*n+k)*nr+rk)*no+o]
					if w == 0 {
						continue
					}
					_, after := entropy(hist(post[((((k*nr+rk)*hs+hi)*no + o) * cells):][:cells]))
					s.Leak += weights[k] * w / total * (priorH[k*nr+rk] - after)
				}
			}
		}
		s.Score = winValue*s.P + s.Gain - lambda*s.Leak
	}
}
