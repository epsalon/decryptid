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
	Text     string     `json:"text,omitempty"`     // parse
	Players  int        `json:"players,omitempty"`  // randomSetup
	Advanced bool       `json:"advanced,omitempty"` // rules, randomSetup
	Seed     int64      `json:"seed,omitempty"`     // randomSetup
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
		players := r.Players
		if players == 0 {
			players = 4
		}
		rng := rand.New(rand.NewSource(r.Seed))
		for i := 0; i < 100; i++ {
			g := &game.Game{Spec: sim.RandomSpec(rng, r.Advanced), Players: players, Advanced: r.Advanced}
			if _, _, _, ok, err := g.SampleWorld(rng); err != nil {
				return nil, err
			} else if ok {
				return g, nil
			}
		}
		return nil, fmt.Errorf("no valid random board found")
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
	case "adviseCube":
		return g.AdviseCube(r.Player)
	case "adviseTurn":
		lambda, searchAt := sim.Default.Lambda, sim.Default.SearchAt
		if r.Lambda != nil {
			lambda = *r.Lambda
		}
		if r.SearchAt != nil {
			searchAt = *r.SearchAt
		}
		adv, err := g.AdviseTurn(r.Player, lambda)
		if err != nil {
			return nil, err
		}
		q, s := adv.Choose(searchAt)
		return TurnResult{TurnAdvice: adv, Ask: q, Search: s}, nil
	}
	return nil, fmt.Errorf("unknown op %q", r.Op)
}
