package rule

import (
	"fmt"

	"github.com/epsalon/decryptid/board"
)

// OnLandscapes is "the habitat is on l or l2".
func OnLandscapes(l, l2 board.Landscape) RuleSpec {
	return RuleSpec{
		Name:  fmt.Sprintf("On %s or %s", l, l2),
		match: func(h board.Hex) bool { return h.L == l || h.L == l2 },
	}
}

// D1Landscape is "the habitat is within one space of l".
func D1Landscape(l board.Landscape) RuleSpec {
	return RuleSpec{
		Name:  fmt.Sprintf("Distance 1 from %s", l),
		match: func(h board.Hex) bool { return h.L == l },
		dist:  1,
	}
}

// D1AnyTerritory is "the habitat is within one space of either animal territory".
func D1AnyTerritory() RuleSpec {
	return RuleSpec{
		Name:  "Distance 1 from either animal territory",
		match: func(h board.Hex) bool { return h.T != board.NoTerritory },
		dist:  1,
	}
}

// D2Territory is "the habitat is within two spaces of t territory".
func D2Territory(t board.Territory) RuleSpec {
	return RuleSpec{
		Name:  fmt.Sprintf("Distance 2 from %s territory", t),
		match: func(h board.Hex) bool { return h.T == t },
		dist:  2,
	}
}

// D2Structure is "the habitat is within two spaces of a structure of type s".
func D2Structure(s board.BuildingType) RuleSpec {
	return RuleSpec{
		Name:  fmt.Sprintf("Distance 2 from %s", s),
		match: func(h board.Hex) bool { return h.B == s },
		dist:  2,
	}
}

// D3Color is "the habitat is within three spaces of a c structure".
func D3Color(c board.BuildingColor) RuleSpec {
	return RuleSpec{
		Name:     fmt.Sprintf("Distance 3 from %s structure", c),
		match:    func(h board.Hex) bool { return h.C == c },
		dist:     3,
		advanced: c == board.Black,
	}
}

// AllRules lists every rule, each followed by its "Not ..." version.
// Basic games use the subset where Advanced() is false.
func AllRules() []RuleSpec {
	var out []RuleSpec
	addWithNeg := func(r RuleSpec) {
		out = append(out, r)
		r.Name = "Not " + r.Name
		r.neg = true
		out = append(out, r)
	}
	for l := board.Forest; l < board.Water; l++ {
		for l2 := l + 1; l2 <= board.Water; l2++ {
			addWithNeg(OnLandscapes(l, l2))
		}
	}
	for l := board.Forest; l <= board.Water; l++ {
		addWithNeg(D1Landscape(l))
	}
	addWithNeg(D1AnyTerritory())
	for t := board.Bear; t <= board.Cougar; t++ {
		addWithNeg(D2Territory(t))
	}
	for s := board.Stone; s <= board.Shed; s++ {
		addWithNeg(D2Structure(s))
	}
	for c := board.White; c <= board.Black; c++ {
		addWithNeg(D3Color(c))
	}
	return out
}
