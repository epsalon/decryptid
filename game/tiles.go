package game

import (
	"sort"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/search"
)

// TileCount is what the solver's worlds say about one map tile.
type TileCount struct {
	Tile   int `json:"tile"`   // slot on the board, 0-5 (row-major: rows of two tiles)
	Worlds int `json:"worlds"` // worlds that put the cryptid on this tile
	// Players is per player (0-based), the rules they may hold in those
	// worlds, most worlds first.
	Players [][]RuleCount `json:"players"`
}

// tileOf is the map tile slot (0-5) of board hex (x, y): tiles are 6x3 hexes,
// laid out two per row.
func tileOf(x, y int) int {
	return (y/3)*2 + x/6
}

// TileSummary counts, for each map tile, the worlds fitting the markers and
// known rules that put the cryptid on it, and which rules each player holds
// in those worlds. It lists every tile, including those with no worlds.
func (g *Game) TileSummary() ([]TileCount, error) {
	p, err := g.prepare(true)
	if err != nil {
		return nil, err
	}
	nr := len(p.rules)
	worlds := make([]int, 6)
	rules := make([]int, 6*g.Players*nr)
	search.Each(p.masks, p.cands, !g.AnyClues, func(rs []int, loc int) {
		t := tileOf(loc%board.Width, loc/board.Width)
		worlds[t]++
		for j, r := range rs {
			rules[(t*g.Players+j)*nr+r]++
		}
	})
	out := make([]TileCount, 6)
	for t := range out {
		tc := TileCount{Tile: t, Worlds: worlds[t], Players: make([][]RuleCount, g.Players)}
		for j := 0; j < g.Players; j++ {
			rc := []RuleCount{}
			for r := 0; r < nr; r++ {
				if c := rules[(t*g.Players+j)*nr+r]; c > 0 {
					rc = append(rc, RuleCount{Rule: p.rules[r].Name, Worlds: c})
				}
			}
			sort.SliceStable(rc, func(a, b int) bool { return rc[a].Worlds > rc[b].Worlds })
			tc.Players[j] = rc
		}
		out[t] = tc
	}
	return out, nil
}
