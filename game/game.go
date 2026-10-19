// Package game describes a game in progress (board setup, the discs and
// cubes players have placed, and any known rules) and works out where the
// cryptid can be.
package game

import (
	"fmt"
	"math/rand"
	"sort"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/rule"
	"github.com/epsalon/decryptid/search"
	"github.com/epsalon/decryptid/uint128"
)

// Game is a game in progress. Players are numbered from 1.
type Game struct {
	Spec     board.BoardSpec `json:"spec"`
	Players  int             `json:"players"`
	Advanced bool            `json:"advanced,omitempty"` // whether "Not ..." rules and black buildings are in play
	AnyClues bool            `json:"anyClues,omitempty"` // allow clue sets where some clue is redundant (default: every clue is needed)
	// Colors is each seat's color, in turn order (names from PlayerColors).
	// Empty means the first Players colors of PlayerColors.
	Colors  []string       `json:"colors,omitempty"`
	Markers []Marker       `json:"markers,omitempty"` // discs and cubes on the board
	Known   map[int]string `json:"known,omitempty"`   // player -> rule name, for rules we know
}

// Marker is a disc or cube placed by a player at board hex (X, Y).
type Marker struct {
	Player int  `json:"player"`
	X      int  `json:"x"`
	Y      int  `json:"y"`
	Cube   bool `json:"cube,omitempty"`
}

// Rules returns the rules that can be in play for this game's mode. The
// slice is shared (see rule.AllRules): don't modify or append to it.
func (g *Game) Rules() []rule.RuleSpec {
	if g.Advanced {
		return rule.AllRules()
	}
	return rule.BasicRules()
}

// ColorName is the color of seat p (1-based).
func (g *Game) ColorName(p int) string {
	return PlayerColors[g.colorIndex(p)]
}

// colorIndex is seat p's color as an index into PlayerColors.
func (g *Game) colorIndex(p int) int {
	if p-1 < len(g.Colors) {
		for i, c := range PlayerColors {
			if c == g.Colors[p-1] {
				return i
			}
		}
	}
	return p - 1
}

// checkColors validates Colors: one distinct, known color per seat.
func (g *Game) checkColors() error {
	if len(g.Colors) == 0 {
		return nil
	}
	if len(g.Colors) != g.Players {
		return fmt.Errorf("%d colors for %d players", len(g.Colors), g.Players)
	}
	seen := map[string]bool{}
	for _, c := range g.Colors {
		known := false
		for _, k := range PlayerColors {
			known = known || c == k
		}
		if !known || seen[c] {
			return fmt.Errorf("bad or repeated color %q", c)
		}
		seen[c] = true
	}
	return nil
}

// DisplayBoard re-labels a board's pieces (stored by seat) by color, for
// printing: the terminal draws each color in its own ANSI color.
func (g *Game) DisplayBoard(b board.Board) board.Board {
	for y := range b {
		for x := range b[y] {
			h := &b[y][x]
			var d board.PlayerSet
			for p := 1; p <= g.Players; p++ {
				if h.Discs&(1<<(p-1)) != 0 {
					d |= 1 << g.colorIndex(p)
				}
			}
			h.Discs = d
			if h.Cube != 0 {
				h.Cube = g.colorIndex(h.Cube) + 1
			}
		}
	}
	return b
}

// Board builds the board with all markers placed on it.
func (g *Game) Board() (board.Board, error) {
	b := board.MakeBoard(g.Spec)
	if err := g.checkColors(); err != nil {
		return b, err
	}
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
	p, err := g.prepare(true)
	if err != nil {
		return nil, err
	}
	res := &Result{Rules: p.rules, Candidates: p.cands}
	res.Solutions = search.Solve(p.masks, p.cands, !g.AnyClues)
	b := p.board
	for _, s := range res.Solutions {
		b[s.Location/board.Width][s.Location%board.Width].Highlighted = true
	}
	res.Board = b
	return res, nil
}

// prepared is everything needed to run a search for a game.
type prepared struct {
	board board.Board
	rules []rule.RuleSpec
	masks []uint128.Uint128 // per rule, the hexes it allows
	cands [][]int           // per player (0-based), rules matching their markers
	known []int             // per player (0-based), known rule index or -1
}

var (
	allRuleIndex   = makeRuleIndex(rule.AllRules())
	basicRuleIndex = makeRuleIndex(rule.BasicRules())
)

func makeRuleIndex(rules []rule.RuleSpec) map[string]int {
	m := make(map[string]int, len(rules))
	for i, r := range rules {
		m[r.Name] = i
	}
	return m
}

// prepare builds the board and per-player candidate rules. With useKnown
// false, known rules are looked up (in p.known) but don't restrict p.cands.
func (g *Game) prepare(useKnown bool) (*prepared, error) {
	b, err := g.Board()
	if err != nil {
		return nil, err
	}
	res := &prepared{board: b, rules: g.Rules()}

	res.masks = make([]uint128.Uint128, len(res.rules))
	for i, r := range res.rules {
		res.masks[i] = r.OnBoard(&b).Mask()
	}

	byName := basicRuleIndex
	if g.Advanced {
		byName = allRuleIndex
	}

	discsMask := make([]uint128.Uint128, g.Players)
	cubesMask := make([]uint128.Uint128, g.Players)
	for _, m := range g.Markers {
		idx := m.Y*board.Width + m.X
		if m.Cube {
			cubesMask[m.Player-1] = cubesMask[m.Player-1].SetBit(idx)
		} else {
			discsMask[m.Player-1] = discsMask[m.Player-1].SetBit(idx)
		}
	}

	res.known = make([]int, g.Players)
	res.cands = make([][]int, g.Players)
	for p := 1; p <= g.Players; p++ {
		res.known[p-1] = -1
		if name, ok := g.Known[p]; ok {
			i, ok := byName[name]
			if !ok {
				return nil, fmt.Errorf("player %d: rule %q is not in play", p, name)
			}
			res.known[p-1] = i
		}
		dm, cm := discsMask[p-1], cubesMask[p-1]
		var ok []int
		if res.known[p-1] >= 0 && useKnown {
			k := res.known[p-1]
			if res.masks[k].Contains(dm) && !res.masks[k].Intersects(cm) {
				ok = []int{k}
			}
		} else {
			for i, m := range res.masks {
				if m.Contains(dm) && !m.Intersects(cm) {
					ok = append(ok, i)
				}
			}
		}
		if len(ok) == 0 {
			if _, known := g.Known[p]; known {
				return nil, fmt.Errorf("player %d: known rule %q contradicts their markers", p, g.Known[p])
			}
			return nil, fmt.Errorf("player %d: no rule matches their markers", p)
		}
		res.cands[p-1] = ok
	}
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

// SampleWorld picks a world (rule per player and cryptid hex) uniformly at
// random among those fitting the markers and known rules. ok is false if
// there are none.
func (g *Game) SampleWorld(rng *rand.Rand) (rules []rule.RuleSpec, x, y int, ok bool, err error) {
	p, err := g.prepare(true)
	if err != nil {
		return nil, 0, 0, false, err
	}
	var pick []int
	loc, seen := 0, 0
	search.Each(p.masks, p.cands, !g.AnyClues, func(rs []int, l int) {
		seen++
		if rng.Intn(seen) == 0 {
			pick, loc = append(pick[:0], rs...), l
		}
	})
	if seen == 0 {
		return nil, 0, 0, false, nil
	}
	for _, r := range pick {
		rules = append(rules, p.rules[r])
	}
	return rules, loc % board.Width, loc / board.Width, true, nil
}
