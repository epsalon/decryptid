package api

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/epsalon/decryptid/game"
)

func call(t *testing.T, req any) json.RawMessage {
	t.Helper()
	b, _ := json.Marshal(req)
	var resp struct {
		Result json.RawMessage
		Error  string
	}
	if err := json.Unmarshal(Handle(b), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error != "" {
		t.Fatalf("%s: %s", b, resp.Error)
	}
	return resp.Result
}

func TestOps(t *testing.T) {
	text, err := os.ReadFile("../examples/game.txt")
	if err != nil {
		t.Fatal(err)
	}
	var g game.Game
	if err := json.Unmarshal(call(t, map[string]any{"op": "parse", "text": string(text)}), &g); err != nil {
		t.Fatal(err)
	}
	if g.Players != 3 || len(g.Markers) != 8 || g.Spec.Buildings[0].C.Key() != "blue" {
		t.Errorf("parse: unexpected game %+v", g)
	}

	var hexes []Hex
	json.Unmarshal(call(t, map[string]any{"op": "board", "game": g}), &hexes)
	if len(hexes) != 108 {
		t.Errorf("board: %d hexes", len(hexes))
	}

	var sum game.Summary
	json.Unmarshal(call(t, map[string]any{"op": "summary", "game": g}), &sum)
	if len(sum.Locations) != 1 || sum.Locations[0].X != 3 || sum.Locations[0].Y != 3 {
		t.Errorf("summary: %+v", sum.Locations)
	}

	var turn TurnResult
	json.Unmarshal(call(t, map[string]any{"op": "adviseTurn", "game": g, "player": 1}), &turn)
	if turn.Search == nil || turn.Search.X != 3 || turn.Search.Y != 3 {
		t.Errorf("adviseTurn: want search (3,3), got ask=%+v search=%+v", turn.Ask, turn.Search)
	}

	var cubes []game.CubeOption
	json.Unmarshal(call(t, map[string]any{"op": "adviseCube", "game": g, "player": 1}), &cubes)
	if len(cubes) == 0 {
		t.Error("adviseCube: no options")
	}

	var txt string
	json.Unmarshal(call(t, map[string]any{"op": "format", "game": g}), &txt)
	if len(txt) == 0 {
		t.Error("format: empty")
	}

	var rnd game.Game
	json.Unmarshal(call(t, map[string]any{"op": "randomSetup", "players": 5, "advanced": true, "seed": 3}), &rnd)
	if rnd.Players != 5 || len(rnd.Spec.Buildings) != 8 {
		t.Errorf("randomSetup: %+v", rnd)
	}

	var rules []string
	json.Unmarshal(call(t, map[string]any{"op": "rules", "advanced": true}), &rules)
	if len(rules) != 48 {
		t.Errorf("rules: %d", len(rules))
	}
}

func TestErrors(t *testing.T) {
	for _, req := range []string{`{"op":"nope"}`, `{"op":"summary"}`, `not json`} {
		var resp Response
		json.Unmarshal(Handle([]byte(req)), &resp)
		if resp.Error == "" {
			t.Errorf("%s: want error", req)
		}
	}
}

func TestMatch(t *testing.T) {
	var m Match
	if err := json.Unmarshal(call(t, map[string]any{"op": "newMatch", "players": 4, "advanced": true, "seed": 5}), &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Rules) != 4 || m.Game.Players != 4 {
		t.Fatalf("newMatch: %+v", m)
	}
	var masks [][]bool
	json.Unmarshal(call(t, map[string]any{"op": "masks", "game": m.Game, "rules": m.Rules}), &masks)
	if len(masks) != 4 {
		t.Fatalf("masks: %d", len(masks))
	}
	// The cryptid's hex is the one hex every seat's rule allows.
	for i := 0; i < 108; i++ {
		all := true
		for _, mk := range masks {
			all = all && mk[i]
		}
		if all != (i == m.Location.Y*12+m.Location.X) {
			t.Errorf("hex %d: allowed by all = %v, cryptid at (%d,%d)", i, all, m.Location.X, m.Location.Y)
		}
	}
}
