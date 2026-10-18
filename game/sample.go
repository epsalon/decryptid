package game

import "github.com/epsalon/decryptid/search"

// SampleLimit caps how many worlds the advice functions use to estimate
// other players' views. Above it they keep a uniform random sample of rule
// sets (about this many worlds' worth). Our own view is always counted
// exactly. 0 means never sample. Estimates only feed entropies and
// fractions, so a few hundred thousand worlds are plenty, and this keeps
// early 5-player games fast.
var SampleLimit = 300000

// setSampler returns a keep function for search.EachSampled, or nil when
// all sets should be kept. Sets are kept by a hash of their rules, so the
// sample (and thus the advice) is deterministic.
func (g *Game) setSampler(p *prepared) func([]int) bool {
	if SampleLimit <= 0 {
		return nil
	}
	sets := search.CountSets(p.masks, p.cands, !g.AnyClues)
	perms := 1 // upper bound on assignments per set
	for i := 2; i <= g.Players; i++ {
		perms *= i
	}
	if sets*perms <= SampleLimit {
		return nil
	}
	threshold := uint64(float64(SampleLimit) / float64(sets*perms) * (1 << 63) * 2)
	return func(set []int) bool {
		h := uint64(14695981039346656037) // FNV-1a
		for _, r := range set {
			h ^= uint64(r)
			h *= 1099511628211
		}
		h ^= h >> 31 // spread low-entropy input
		h *= 0x9E3779B97F4A7C15
		return h < threshold
	}
}

// ourCands narrows candidates to the known rules, giving the worlds we
// consider possible.
func ourCands(p *prepared) [][]int {
	out := make([][]int, len(p.cands))
	for k, cs := range p.cands {
		if p.known[k] < 0 {
			out[k] = cs
			continue
		}
		for _, r := range cs {
			if r == p.known[k] {
				out[k] = []int{r}
			}
		}
	}
	return out
}
