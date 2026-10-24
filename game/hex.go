package game

import (
	"fmt"
	"sort"
	"strings"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

// HexCount is what the solver's worlds say about one board hex.
type HexCount struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Total  int `json:"total"`  // worlds fitting the markers and known rules
	Worlds int `json:"worlds"` // worlds that put the cryptid on this hex
	// Players is per player (0-based), the rules they may hold in those
	// worlds, most worlds first.
	Players [][]RuleCount `json:"players"`
	// Groups partitions the players (0-based seats) into interchangeable
	// players: those with the same candidate rules. Swapping two players of a
	// group gives another world, so Sets orders their rules canonically.
	// Every seat is in exactly one group, singletons included.
	Groups [][]int `json:"groups"`
	// Sets is each combination of rules, one per player, that puts the
	// cryptid on this hex, most worlds first.
	Sets []ClueSet `json:"sets"`
}

// ClueSet is one combination of clues and the worlds that have it.
type ClueSet struct {
	// Rules has one name per player in seat order. Within each group of
	// interchangeable players the names are sorted, since their seating is
	// not part of the set.
	Rules  []string `json:"rules"`
	Worlds int      `json:"worlds"`
}

// HexSummary counts the worlds fitting the markers and known rules, and
// which rules each player holds in the worlds that put the cryptid on hex
// (x, y), both per player and as whole clue sets.
func (g *Game) HexSummary(x, y int) (*HexCount, error) {
	if x < 0 || x >= board.Width || y < 0 || y >= board.Height {
		return nil, fmt.Errorf("hex %d,%d is off the board", x, y)
	}
	p, err := g.prepare(true)
	if err != nil {
		return nil, err
	}
	nr := len(p.rules)
	loc := y*board.Width + x
	rules := make([]int, g.Players*nr)
	groups := interchangeable(p.cands)
	h := &HexCount{X: x, Y: y, Players: make([][]RuleCount, g.Players), Groups: groups, Sets: []ClueSet{}}
	sets := make(map[string]int) // key of a set -> index in h.Sets
	search.Each(p.masks, p.cands, !g.AnyClues, func(rs []int, l int) {
		h.Total++
		if l != loc {
			return
		}
		h.Worlds++
		for j, r := range rs {
			rules[j*nr+r]++
		}
		pick := canonical(rs, groups)
		key := fmt.Sprint(pick)
		i, ok := sets[key]
		if !ok {
			i = len(h.Sets)
			sets[key] = i
			names := make([]string, len(pick))
			for j, r := range pick {
				names[j] = p.rules[r].Name
			}
			h.Sets = append(h.Sets, ClueSet{Rules: names})
		}
		h.Sets[i].Worlds++
	})
	for j := 0; j < g.Players; j++ {
		rc := []RuleCount{}
		for r := 0; r < nr; r++ {
			if c := rules[j*nr+r]; c > 0 {
				rc = append(rc, RuleCount{Rule: p.rules[r].Name, Worlds: c})
			}
		}
		sort.SliceStable(rc, func(a, b int) bool { return rc[a].Worlds > rc[b].Worlds })
		h.Players[j] = rc
	}
	sort.Slice(h.Sets, func(a, b int) bool {
		if h.Sets[a].Worlds != h.Sets[b].Worlds {
			return h.Sets[a].Worlds > h.Sets[b].Worlds
		}
		return strings.Join(h.Sets[a].Rules, "\x00") < strings.Join(h.Sets[b].Rules, "\x00")
	})
	return h, nil
}

// interchangeable groups the players (0-based seats, in seat order) whose
// candidate rules are identical. Players in one group may swap rules and
// still hold a valid world.
func interchangeable(cands [][]int) [][]int {
	var groups [][]int
	for j := range cands {
		placed := false
		for gi, g := range groups {
			if sameRules(cands[g[0]], cands[j]) {
				groups[gi] = append(g, j)
				placed = true
				break
			}
		}
		if !placed {
			groups = append(groups, []int{j})
		}
	}
	return groups
}

// sameRules reports whether two candidate lists hold the same rules.
func sameRules(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// canonical returns the rules of a world with each group's rules sorted into
// its seats in order, so that every seating of the same set gives one result.
func canonical(rs []int, groups [][]int) []int {
	out := append([]int(nil), rs...)
	for _, g := range groups {
		vals := make([]int, len(g))
		for i, s := range g {
			vals[i] = rs[s]
		}
		sort.Ints(vals)
		for i, s := range g {
			out[s] = vals[i]
		}
	}
	return out
}
