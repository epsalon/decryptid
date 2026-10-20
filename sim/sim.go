// Package sim plays complete Cryptid games between AI players, to compare
// strategies. Boards are random (random tile layout and building spots),
// and the hidden clues are a uniformly random valid world on that board.
package sim

import (
	"fmt"
	"math/rand"
	"strings"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/game"
)

// Policy is how an AI player picks moves.
type Policy struct {
	Name     string
	Lambda   float64 // weight of information given to others vs. gained
	SearchAt float64 // search once the likeliest hex has at least this chance (if WinValue is 0)
	WinValue float64 // if > 0, rank searches with questions; a win is worth this many bits
	Order    float64 // leak weight by turn order, see game.TurnOptions (0 = equal)
	Urgency  float64 // search sooner when an opponent is close to winning, see game.TurnOptions
	Tau      float64 // how sure an opponent must be before we expect a search (0 = default)
	Random   bool    // ask random questions and place random cubes
}

// Default is the strongest policy found so far by self-play. It ranks
// searches and questions together, valuing a win at 16 bits; that ties the
// best fixed search threshold (15%) head-to-head, and gives one ranking.
// SearchAt is the fallback threshold if WinValue is set to 0. Urgency 3 with
// Tau 0.15 searches sooner when an opponent is close to winning: it wins
// about 2.4 points more per seat in 5-player advanced games (the only ones
// where the AI asks questions) and changes nothing elsewhere.
var Default = Policy{Name: "ai", Lambda: 0.5, SearchAt: 0.15, WinValue: 16, Urgency: 3, Tau: 0.15}

// Policies are the built-in strategies, by name.
var Policies = map[string]Policy{
	"ai":        Default,
	"patient":   {Name: "patient", Lambda: 0.5, SearchAt: 0.15, WinValue: 16}, // the default without urgency
	"threshold": {Name: "threshold", Lambda: 0.5, SearchAt: 0.15},             // searches once a hex has 15%
	"greedy":    {Name: "greedy", Lambda: 0, SearchAt: 0.15},                  // ignores leaks
	"cautious":  {Name: "cautious", Lambda: 0.5, SearchAt: 1},                 // searches only when certain
	"random":    {Name: "random", Random: true, SearchAt: 1},                  // random questions and cubes
}

// ParsePolicy accepts a built-in name, "lambda:searchAt" for a threshold
// policy (e.g. "0.3:0.8"), or "lambda/winValue" for one ranking of searches
// and questions (e.g. "0.5/3"); a third field sets the turn-order weight (e.g. "0.5/8/0.5").
func ParsePolicy(s string) (Policy, error) {
	if i := strings.Index(s, "{"); i > 0 && strings.HasSuffix(s, "}") {
		return parseOverrides(s[:i], s[i+1:len(s)-1], s)
	}
	if p, ok := Policies[s]; ok {
		return p, nil
	}
	var p Policy
	if _, err := fmt.Sscanf(s, "%g/%g/%g", &p.Lambda, &p.WinValue, &p.Order); err == nil && p.WinValue > 0 {
		p.Name = s
		return p, nil
	}
	p = Policy{}
	if _, err := fmt.Sscanf(s, "%g:%g:%g", &p.Lambda, &p.SearchAt, &p.Order); err == nil {
		p.Name = s
		return p, nil
	}
	p = Policy{}
	if _, err := fmt.Sscanf(s, "%g/%g", &p.Lambda, &p.WinValue); err == nil && p.WinValue > 0 {
		p.Name = s
		return p, nil
	}
	p = Policy{}
	if _, err := fmt.Sscanf(s, "%g:%g", &p.Lambda, &p.SearchAt); err != nil {
		return p, fmt.Errorf("unknown policy %q (want one of ai, threshold, greedy, cautious, random, lambda:searchAt or lambda/winValue)", s)
	}
	p.Name = s
	return p, nil
}

// Config describes the games to play.
type Config struct {
	Players  int
	Advanced bool
	MaxTurns int          // give up after this many turns (default 30 per player)
	Log      func(string) // if set, receives a line per move
}

// Result is the outcome of one game.
type Result struct {
	Winner int // seat (1-based) of the winner; 0 if nobody won
	Turns  int // turns taken, over all players
	Asks   int // turns spent asking a question
	Finds  int // searches made, including the winning one
}

type player struct {
	policy Policy
	rule   string
	allows []bool // the player's rule, per hex
}

type match struct {
	asks, finds int
	cfg         Config
	rng         *rand.Rand
	g           *game.Game
	players     []player
}

// Play plays one game on a random board. Seat i (0-based) uses seats[i],
// and seat 1 starts.
func Play(rng *rand.Rand, cfg Config, seats []Policy) (Result, error) {
	if len(seats) != cfg.Players {
		return Result{}, fmt.Errorf("%d policies for %d players", len(seats), cfg.Players)
	}
	if cfg.MaxTurns == 0 {
		cfg.MaxTurns = 30 * cfg.Players
	}
	m := &match{cfg: cfg, rng: rng}
	if err := m.deal(seats); err != nil {
		return Result{}, err
	}

	for round := 0; round < 2; round++ {
		for p := 1; p <= cfg.Players; p++ {
			if err := m.placeCube(p); err != nil {
				return Result{}, err
			}
		}
	}
	for t := 0; t < cfg.MaxTurns; t++ {
		p := t%cfg.Players + 1
		won, err := m.turn(p)
		if err != nil {
			return Result{}, fmt.Errorf("turn %d (player %d): %v", t+1, p, err)
		}
		if won {
			return Result{Winner: p, Turns: t + 1, Asks: m.asks, Finds: m.finds}, nil
		}
	}
	return Result{Turns: cfg.MaxTurns, Asks: m.asks, Finds: m.finds}, nil
}

// deal makes a random board with at least one valid world and picks one.
func (m *match) deal(seats []Policy) error {
	for attempt := 0; attempt < 100; attempt++ {
		g := &game.Game{Spec: RandomSpec(m.rng, m.cfg.Advanced), Players: m.cfg.Players, Advanced: m.cfg.Advanced}
		rules, x, y, ok, err := g.SampleWorld(m.rng)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		b, _ := g.Board()
		m.g, m.players = g, nil
		for i, r := range rules {
			m.players = append(m.players, player{policy: seats[i], rule: r.Name, allows: r.OnBoard(&b).ToBoolSlice()})
		}
		m.log(fmt.Sprintf("cryptid at (%d,%d); rules: %v", x, y, rules))
		return nil
	}
	return fmt.Errorf("no valid world on 100 random boards")
}

// RandomSpec makes a random board: random tile layout and building spots.
func RandomSpec(rng *rand.Rand, advanced bool) board.BoardSpec {
	var s board.BoardSpec
	for i, t := range rng.Perm(len(board.Tiles)) {
		s.Tiles[i/2][i%2] = board.TileId{Id: t + 1, Flipped: rng.Intn(2) == 1}
	}
	colors := []board.BuildingColor{board.White, board.Blue, board.Green}
	if advanced {
		colors = append(colors, board.Black)
	}
	used := map[int]bool{}
	for _, c := range colors {
		for _, b := range []board.BuildingType{board.Stone, board.Shed} {
			h := rng.Intn(board.Width * board.Height)
			for used[h] {
				h = rng.Intn(board.Width * board.Height)
			}
			used[h] = true
			s.Buildings = append(s.Buildings, board.BuildingSpec{X: h % board.Width, Y: h / board.Width, B: b, C: c})
		}
	}
	return s
}

func (m *match) log(s string) {
	if m.cfg.Log != nil {
		m.cfg.Log(s)
	}
}

// view is the game as player p sees it: all markers, and only their own rule.
func (m *match) view(p int) *game.Game {
	v := *m.g
	v.Known = map[int]string{p: m.players[p-1].rule}
	return &v
}

func (m *match) placeCube(p int) error {
	opts, err := m.view(p).AdviseCube(p)
	if err != nil {
		return err
	}
	if len(opts) == 0 {
		return fmt.Errorf("player %d has nowhere to place a cube", p)
	}
	o := opts[0]
	if m.players[p-1].policy.Random {
		o = opts[m.rng.Intn(len(opts))]
	}
	m.g.Markers = append(m.g.Markers, game.Marker{Player: p, X: o.X, Y: o.Y, Cube: true})
	m.log(fmt.Sprintf("  P%d cube (%d,%d)  [%.2f bits]", p, o.X, o.Y, o.Bits))
	return nil
}

// answer has player p mark hex (x, y) truthfully and reports whether it was a disc.
func (m *match) answer(p, x, y int) bool {
	yes := m.players[p-1].allows[y*board.Width+x]
	m.g.Markers = append(m.g.Markers, game.Marker{Player: p, X: x, Y: y, Cube: !yes})
	return yes
}

func (m *match) turn(p int) (won bool, err error) {
	pol := m.players[p-1].policy
	adv, err := m.view(p).AdviseTurn(p, pol.TurnOptions())
	if err != nil {
		return false, err
	}
	q, s := pol.Choose(adv)
	m.log(fmt.Sprintf("P%d risk %.2f", p, adv.Risk))
	if pol.Random && q != nil {
		q = &adv.Questions[m.rng.Intn(len(adv.Questions))]
	}
	switch {
	case s != nil:
		m.finds++
		return m.search(p, s.X, s.Y, s.P)
	case q != nil:
		m.asks++
		yes := m.answer(q.Player, q.X, q.Y)
		m.log(fmt.Sprintf("P%d asks P%d about (%d,%d): %v  [gain %.2f leak %.2f; %d locations, %.2f bits]",
			p, q.Player, q.X, q.Y, yesNo(yes), q.Gain, q.Leak, adv.Locations, adv.Entropy))
		if !yes {
			return false, m.placeCube(p)
		}
		return false, nil
	}
	return false, fmt.Errorf("no legal action")
}

func (m *match) search(p, x, y int, prob float64) (bool, error) {
	m.log(fmt.Sprintf("P%d searches (%d,%d) [p=%.2f]", p, x, y, prob))
	b, _ := m.g.Board()
	if b[y][x].Discs&(1<<(p-1)) == 0 {
		m.g.Markers = append(m.g.Markers, game.Marker{Player: p, X: x, Y: y})
	}
	n := m.cfg.Players
	for i := 1; i < n; i++ {
		k := (p-1+i)%n + 1
		if b[y][x].Discs&(1<<(k-1)) != 0 {
			continue
		}
		if !m.answer(k, x, y) {
			m.log(fmt.Sprintf("  P%d: no", k))
			return false, m.placeCube(p)
		}
	}
	m.log(fmt.Sprintf("P%d wins", p))
	return true, nil
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

// Choose picks this policy's move from turn advice.
func (p Policy) Choose(a *game.TurnAdvice) (*game.Question, *game.Search) {
	if p.WinValue > 0 {
		return a.ChooseScored()
	}
	return a.Choose(p.SearchAt)
}

// TurnOptions are the advisor settings for this policy.
func (p Policy) TurnOptions() game.TurnOptions {
	return game.TurnOptions{Lambda: p.Lambda, WinValue: p.WinValue, Order: p.Order, Urgency: p.Urgency, UrgencyTau: p.Tau}
}

// parseOverrides builds a policy from a base policy and "key=value" settings,
// e.g. "ai{urgency=0.5,tau=0.3}"; keys are lambda, win, searchat, order,
// urgency and tau. The result is named with the full text.
func parseOverrides(base, settings, full string) (Policy, error) {
	p, err := ParsePolicy(base)
	if err != nil {
		return p, err
	}
	p.Name = full
	for _, kv := range strings.Split(settings, ",") {
		key, val, ok := strings.Cut(kv, "=")
		var f float64
		if _, err := fmt.Sscanf(val, "%g", &f); !ok || err != nil {
			return p, fmt.Errorf("bad setting %q in policy %q", kv, full)
		}
		switch key {
		case "lambda":
			p.Lambda = f
		case "win":
			p.WinValue = f
		case "searchat":
			p.SearchAt = f
		case "order":
			p.Order = f
		case "urgency":
			p.Urgency = f
		case "tau":
			p.Tau = f
		default:
			return p, fmt.Errorf("unknown setting %q in policy %q", key, full)
		}
	}
	return p, nil
}
