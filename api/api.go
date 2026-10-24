// Package api answers JSON requests for the web UI. The wasm build wraps
// Handle; keeping it here lets it be tested natively.
package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/game"
	"github.com/epsalon/decryptid/sim"
)

// Request is one call from the UI. Which fields matter depends on Op.
type Request struct {
	Op       string     `json:"op"`
	Game     *game.Game `json:"game,omitempty"`
	Player   int        `json:"player,omitempty"`   // 1-based, for advice
	Lambda   *float64   `json:"lambda,omitempty"`   // adviseTurn; default sim.Default
	SearchAt *float64   `json:"searchAt,omitempty"` // adviseTurn; default sim.Default
	WinValue *float64   `json:"winValue,omitempty"` // adviseTurn; default sim.Default; > 0 ranks searches with questions
	Text     string     `json:"text,omitempty"`     // parse
	Players  int        `json:"players,omitempty"`  // randomSetup
	Advanced bool       `json:"advanced,omitempty"` // rules, randomSetup
	Seed     int64      `json:"seed,omitempty"`     // randomSetup, newMatch
	Rules    []string   `json:"rules,omitempty"`    // masks
	X        int        `json:"x,omitempty"`        // hex, for hex
	Y        int        `json:"y,omitempty"`        // hex, for hex
}

// Response carries either a result or an error message.
type Response struct {
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Hex is one board hex as the UI draws it.
type Hex struct {
	X         int                 `json:"x"`
	Y         int                 `json:"y"`
	Terrain   board.Landscape     `json:"terrain"`
	Animal    board.Territory     `json:"animal,omitempty"`
	Structure board.BuildingType  `json:"structure,omitempty"`
	Color     board.BuildingColor `json:"color,omitempty"`
}

// Match is a freshly dealt game against AI opponents: a random board, each
// seat's secret rule, and where the cryptid is.
type Match struct {
	Game     *game.Game `json:"game"`
	Rules    []string   `json:"rules"`
	Location struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"location"`
}

// TurnResult is turn advice plus the action the AI would take.
type TurnResult struct {
	*game.TurnAdvice
	Ask    *game.Question `json:"ask,omitempty"`
	Search *game.Search   `json:"search,omitempty"`
}

// Handle answers one JSON request with one JSON response.
func Handle(req []byte) []byte {
	var r Request
	var res any
	err := json.Unmarshal(req, &r)
	if err == nil {
		res, err = handle(&r)
	}
	var out Response
	if err != nil {
		out.Error = err.Error()
	} else {
		out.Result = res
	}
	b, err := json.Marshal(out)
	if err != nil {
		b, _ = json.Marshal(Response{Error: err.Error()})
	}
	return b
}

func handle(r *Request) (any, error) {
	needGame := func() error {
		if r.Game == nil {
			return fmt.Errorf("%s needs a game", r.Op)
		}
		return nil
	}
	switch r.Op {
	case "rules":
		var names []string
		for _, rule := range (&game.Game{Advanced: r.Advanced}).Rules() {
			names = append(names, rule.Name)
		}
		return names, nil
	case "colors":
		return game.PlayerColors, nil
	case "parse":
		return game.Parse(strings.NewReader(r.Text))
	case "randomSetup":
		m, err := deal(r)
		if err != nil {
			return nil, err
		}
		return m.Game, nil
	case "newMatch":
		return deal(r)
	}
	if err := needGame(); err != nil {
		return nil, err
	}
	g := r.Game
	switch r.Op {
	case "format":
		return g.Format(), nil
	case "board":
		b := board.MakeBoard(g.Spec)
		hexes := make([]Hex, 0, board.Width*board.Height)
		for y, row := range b {
			for x, h := range row {
				hexes = append(hexes, Hex{X: x, Y: y, Terrain: h.L, Animal: h.T, Structure: h.B, Color: h.C})
			}
		}
		return hexes, nil
	case "summary":
		return g.Summary()
	case "hex":
		return g.HexSummary(r.X, r.Y)
	case "validate":
		// Whether some world fits the markers and the known rules; nothing
		// else is revealed.
		return g.Validate()
	case "masks":
		// For each named rule, which hexes it allows (index y*12 + x).
		byName := map[string]int{}
		rules := g.Rules()
		for i, rl := range rules {
			byName[rl.Name] = i
		}
		b := board.MakeBoard(g.Spec)
		out := make([][]bool, len(r.Rules))
		for i, name := range r.Rules {
			j, ok := byName[name]
			if !ok {
				return nil, fmt.Errorf("unknown rule %q", name)
			}
			out[i] = rules[j].OnBoard(&b).ToBoolSlice()
		}
		return out, nil
	case "adviseCube":
		return g.AdviseCube(r.Player)
	case "adviseTurn":
		pol := sim.Default
		if r.Lambda != nil {
			pol.Lambda = *r.Lambda
		}
		if r.SearchAt != nil {
			pol.SearchAt = *r.SearchAt
		}
		if r.WinValue != nil {
			pol.WinValue = *r.WinValue
		}
		adv, err := g.AdviseTurn(r.Player, pol.TurnOptions())
		if err != nil {
			return nil, err
		}
		q, s := pol.Choose(adv)
		return TurnResult{TurnAdvice: adv, Ask: q, Search: s}, nil
	}
	return nil, fmt.Errorf("unknown op %q", r.Op)
}

// deal makes a random board with at least one valid world, and samples one
// world uniformly: the secret rule of each seat and the cryptid's hex.
func deal(r *Request) (*Match, error) {
	players := r.Players
	if players == 0 {
		players = 4
	}
	rng := rand.New(rand.NewSource(r.Seed))
	for i := 0; i < 100; i++ {
		g := &game.Game{Spec: sim.RandomSpec(rng, r.Advanced), Players: players, Advanced: r.Advanced}
		rules, x, y, ok, err := g.SampleWorld(rng)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		m := &Match{Game: g}
		for _, rl := range rules {
			m.Rules = append(m.Rules, rl.Name)
		}
		m.Location.X, m.Location.Y = x, y
		return m, nil
	}
	return nil, fmt.Errorf("no valid random board found")
}
