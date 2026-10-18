package game

import (
	"fmt"
	"sort"
	"strings"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

// Summary is what Solve finds, counted rather than listed, so it stays
// small even when millions of worlds are possible.
type Summary struct {
	Worlds      int           `json:"worlds"`      // rule assignments fitting markers and known rules
	Locations   []LocCount    `json:"locations"`   // viable hexes, most worlds first
	PlayerRules [][]RuleCount `json:"playerRules"` // per player (0-based), rules they may hold
}

// LocCount is a viable hex and the number of worlds that put the cryptid there.
type LocCount struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Worlds int `json:"worlds"`
}

// RuleCount is a rule a player may hold and the number of worlds where they do.
type RuleCount struct {
	Rule   string `json:"rule"`
	Worlds int    `json:"worlds"`
}

// Summary counts the worlds fitting the markers and known rules, by
// location and by each player's rule.
func (g *Game) Summary() (*Summary, error) {
	p, err := g.prepare(true)
	if err != nil {
		return nil, err
	}
	nr := len(p.rules)
	locs := make([]int, cells)
	rules := make([]int, g.Players*nr)
	s := &Summary{}
	search.Each(p.masks, p.cands, !g.AnyClues, func(rs []int, loc int) {
		s.Worlds++
		locs[loc]++
		for j, r := range rs {
			rules[j*nr+r]++
		}
	})
	for h, c := range locs {
		if c > 0 {
			s.Locations = append(s.Locations, LocCount{X: h % board.Width, Y: h / board.Width, Worlds: c})
		}
	}
	sort.SliceStable(s.Locations, func(a, b int) bool { return s.Locations[a].Worlds > s.Locations[b].Worlds })
	for j := 0; j < g.Players; j++ {
		var rc []RuleCount
		for r := 0; r < nr; r++ {
			if c := rules[j*nr+r]; c > 0 {
				rc = append(rc, RuleCount{Rule: p.rules[r].Name, Worlds: c})
			}
		}
		sort.SliceStable(rc, func(a, b int) bool { return rc[a].Worlds > rc[b].Worlds })
		s.PlayerRules = append(s.PlayerRules, rc)
	}
	return s, nil
}

// Format writes the game in the format Parse reads.
func (g *Game) Format() string {
	var sb strings.Builder
	sb.WriteString("tiles")
	for _, row := range g.Spec.Tiles {
		for _, t := range row {
			fmt.Fprintf(&sb, " %d", t.Id)
			if t.Flipped {
				sb.WriteString("F")
			}
		}
	}
	sb.WriteString("\n")
	for _, b := range g.Spec.Buildings {
		fmt.Fprintf(&sb, "%-5s %2d %d %s\n", b.B.Key(), b.X, b.Y, b.C.Key())
	}
	fmt.Fprintf(&sb, "players %d\n", g.Players)
	if len(g.Colors) > 0 {
		fmt.Fprintf(&sb, "colors %s\n", strings.Join(g.Colors, " "))
	}
	if g.Advanced {
		sb.WriteString("mode advanced\n")
	} else {
		sb.WriteString("mode basic\n")
	}
	if g.AnyClues {
		sb.WriteString("clues any\n")
	}
	for _, m := range g.Markers {
		kind := "disc"
		if m.Cube {
			kind = "cube"
		}
		fmt.Fprintf(&sb, "%s %-6s %2d %d\n", kind, g.ColorName(m.Player), m.X, m.Y)
	}
	var ps []int
	for p := range g.Known {
		ps = append(ps, p)
	}
	sort.Ints(ps)
	for _, p := range ps {
		fmt.Fprintf(&sb, "rule %s %s\n", g.ColorName(p), g.Known[p])
	}
	return sb.String()
}
