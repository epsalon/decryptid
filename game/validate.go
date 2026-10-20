package game

import (
	"errors"

	"github.com/epsalon/decryptid/search"
)

// contradiction is the error prepare returns when a player's known rule or
// markers leave them no rule: the game is well formed but impossible.
type contradiction struct{ msg string }

func (c *contradiction) Error() string { return c.msg }

// Validate reports whether some world fits the markers and the known rules.
// With every player's rule known, that checks the clue set itself: it must
// pin the cryptid to one hex, and every clue must be needed (unless
// AnyClues). A game that can't be set up at all is an error; a game whose
// clues contradict each other or the markers is simply not valid.
func (g *Game) Validate() (bool, error) {
	p, err := g.prepare(true)
	var c *contradiction
	if errors.As(err, &c) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	found := false
	search.Each(p.masks, p.cands, !g.AnyClues, func([]int, int) { found = true })
	return found, nil
}
