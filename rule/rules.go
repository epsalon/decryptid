package rule

import "fmt"
import "github.com/epsalon/decryptid/board"

func OnLandscapes(l board.Landscape, l2 board.Landscape) RuleSpec {
	return RuleSpec{
				fmt.Sprintf("On %s or %s", l, l2),
				func(h board.Hex) bool {
					return h.L == l || h.L == l2 
				},
				0,
				false,
			}
}

func D1Landscape(l board.Landscape) RuleSpec {
	return RuleSpec{
			fmt.Sprintf("Distance 1 from %s", l),
			func(h board.Hex) bool {
				return h.L == l 
			},
			1,
			false,
		}
}

func D1AnyTerritory() RuleSpec {
	return RuleSpec{
		fmt.Sprintf("Distance 1 from either animal territory"),
		func(h board.Hex) bool {
			return h.T != board.NoTerritory 
		},
		1,
		false,
	}
}

func D2Territory(t board.Territory) RuleSpec {
	return RuleSpec{
			fmt.Sprintf("Distance 2 from %s territory", t),
			func(h board.Hex) bool {
				return h.T == t 
			},
			2,
			false,
		}
}

func D2Structure(s board.BuildingType) RuleSpec {
	return RuleSpec{
			fmt.Sprintf("Distance 2 from %s", s),
			func(h board.Hex) bool {
				return h.B == s 
			},
			2,
			false,
		}
}

func D3Color(s board.BuildingColor) RuleSpec {
	return RuleSpec{
			fmt.Sprintf("Distance 3 from %s structure", s),
			func(h board.Hex) bool {
				return h.C == s 
			},
			3,
			false,
		}
}

func AllRules() []RuleSpec {
	out := []RuleSpec{}
	addWithNeg := func (r RuleSpec) {
		out = append(out, r)
		r.Name = "Not " + r.Name
		r.neg = true
		out = append(out, r)
	}
	for l := board.Forest; l < board.Water; l++ {
		for l2 := board.Landscape(int(l) + 1); l2 <= board.Water; l2++ {
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
	for s := board.White; s <= board.Green; s++ {
		addWithNeg(D3Color(s))
	}
	return out
}