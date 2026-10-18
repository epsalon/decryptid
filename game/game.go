// Package game describes a game in progress (board setup, the discs and
// cubes players have placed, and any known rules) and works out where the
// cryptid can be.
package game

import (
	"fmt"
	"sort"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/rule"
	"github.com/epsalon/decryptid/search"
	"github.com/epsalon/decryptid/uint128"
)

// Game is a game in progress. Players are numbered from 1.
type Game struct {
	Spec     board.BoardSpec
	Players  int
	Advanced bool           // whether "Not ..." rules are in play
	Markers  []Marker       // discs and cubes on the board
	Known    map[int]string // player -> rule name, for rules we know
}

// Marker is a disc or cube placed by a player at board hex (X, Y).
type Marker struct {
	Player int
	X, Y   int
	Cube   bool
}

// Rules returns the rules that can be in play for this game's mode.
func (g *Game) Rules() []rule.RuleSpec {
	var out []rule.RuleSpec
	for _, r := range rule.AllRules() {
		if g.Advanced || !r.Negated() {
			out = append(out, r)
		}
	}
	return out
}

// Board builds the board with all markers placed on it.
func (g *Game) Board() (board.Board, error) {
	b := board.MakeBoard(g.Spec)
	for _, m := range g.Markers {
		if m.Player < 1 || m.Player > g.Players {
			return b, fmt.Errorf("player %d out of range 1-%d", m.Player, g.Players)
		}
		if m.X < 0 || m.X >= board.Width || m.Y < 0 || m.Y >= board.Height {
			return b, fmt.Errorf("hex (%d,%d) is off the board", m.X, m.Y)
		}
		h := &b[m.Y][m.X]
		bit := board.PlayerSet(1) << (m.Player - 1)
		if m.Cube {
			if h.Cube != 0 {
				return b, fmt.Errorf("hex (%d,%d) has two cubes", m.X, m.Y)
			}
			if h.Discs&bit != 0 {
				return b, fmt.Errorf("player %d has both a disc and a cube on (%d,%d)", m.Player, m.X, m.Y)
			}
			h.Cube = m.Player
		} else {
			if h.Cube == m.Player {
				return b, fmt.Errorf("player %d has both a disc and a cube on (%d,%d)", m.Player, m.X, m.Y)
			}
			h.Discs |= bit
		}
	}
	return b, nil
}

// Result is the outcome of Solve.
type Result struct {
	Board      board.Board     // board with markers, viable hexes highlighted
	Rules      []rule.RuleSpec // rules in play; indices below refer to this
	Candidates [][]int         // per player (0-based), rules matching their markers
	Solutions  []search.Solution
}

// Solve finds every way to give players rules that fits their markers and
// pins the cryptid to one hex.
func (g *Game) Solve() (*Result, error) {
	b, err := g.Board()
	if err != nil {
		return nil, err
	}
	res := &Result{Rules: g.Rules()}

	masks := make([]uint128.Uint128, len(res.Rules))
	byName := map[string]int{}
	for i, r := range res.Rules {
		masks[i] = uint128.FromBoolSlice(r.OnBoard(&b).ToBoolSlice())
		byName[r.Name] = i
	}

	for p := 1; p <= g.Players; p++ {
		var cands []int
		if name, ok := g.Known[p]; ok {
			i, ok := byName[name]
			if !ok {
				return nil, fmt.Errorf("player %d: rule %q is not in play", p, name)
			}
			cands = []int{i}
		} else {
			for i := range res.Rules {
				cands = append(cands, i)
			}
		}
		discs, cubes := b.Markers(p)
		dm, cm := uint128.FromBoolSlice(discs), uint128.FromBoolSlice(cubes)
		var ok []int
		for _, i := range cands {
			if dm.AndNot(masks[i]).IsZero() && cm.And(masks[i]).IsZero() {
				ok = append(ok, i)
			}
		}
		if len(ok) == 0 {
			if _, known := g.Known[p]; known {
				return nil, fmt.Errorf("player %d: known rule %q contradicts their markers", p, g.Known[p])
			}
			return nil, fmt.Errorf("player %d: no rule matches their markers", p)
		}
		res.Candidates = append(res.Candidates, ok)
	}

	res.Solutions = search.Solve(masks, res.Candidates)
	for _, s := range res.Solutions {
		b[s.Location/board.Width][s.Location%board.Width].Highlighted = true
	}
	res.Board = b
	return res, nil
}

// Location is a viable cryptid hex and how many rule assignments lead there.
type Location struct {
	X, Y      int
	Solutions []search.Solution
}

// Locations groups solutions by hex, most likely (most solutions) first.
func (r *Result) Locations() []Location {
	byLoc := map[int]*Location{}
	var out []*Location
	for _, s := range r.Solutions {
		l, ok := byLoc[s.Location]
		if !ok {
			l = &Location{X: s.Location % board.Width, Y: s.Location / board.Width}
			byLoc[s.Location] = l
			out = append(out, l)
		}
		l.Solutions = append(l.Solutions, s)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return len(out[i].Solutions) > len(out[j].Solutions)
	})
	res := make([]Location, len(out))
	for i, l := range out {
		res[i] = *l
	}
	return res
}
