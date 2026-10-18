// Package rule defines Cryptid clues ("rules") and evaluates them on a board.
//
// Every clue has the same shape: "the habitat is within D spaces of a hex
// that matches some test" (D = 0 means "on such a hex"), optionally
// negated: "Not ...", meaning the habitat is anywhere else.
package rule

import (
	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/uint128"
)

// RuleSpec is one clue.
type RuleSpec struct {
	// Name is shown to users and used in game files and by number in
	// -rules listings, so names and the order of AllRules must not change.
	Name     string
	match    func(board.Hex) bool // hexes the distance is measured from
	dist     int                  // how far from a matching hex the habitat may be
	neg      bool                 // "Not ...": the habitat is anywhere else
	advanced bool                 // only in advanced games (black structures)
}

func (r RuleSpec) String() string {
	return r.Name
}

// Advanced reports whether the rule is only used in advanced games: "Not ..."
// rules and rules about black structures.
func (r RuleSpec) Advanced() bool {
	return r.neg || r.advanced
}

// BoardRule is a rule evaluated on a particular board.
type BoardRule struct {
	RuleSpec
	mask uint128.Uint128
}

// Mask returns the rule's matching hexes as a 128-bit mask.
func (b BoardRule) Mask() uint128.Uint128 {
	return b.mask
}

// ToBoolSlice returns, per hex (indexed y*board.Width + x), whether the
// rule allows the habitat there.
func (b BoardRule) ToBoolSlice() []bool {
	return b.mask.ToBoolSlice(board.Width * board.Height)
}

var distMask [4][board.Width * board.Height]uint128.Uint128

func init() {
	for d := 0; d <= 3; d++ {
		for y := 0; y < board.Height; y++ {
			for x := 0; x < board.Width; x++ {
				var m uint128.Uint128
				for _, c := range withinDistance(x, y, d) {
					m = m.SetBit(c.y*board.Width + c.x)
				}
				distMask[d][y*board.Width+x] = m
			}
		}
	}
}

// OnBoard evaluates the rule on every hex of b.
func (r RuleSpec) OnBoard(b *board.Board) BoardRule {
	var m uint128.Uint128
	for y, row := range b {
		for x, h := range row {
			if r.match(h) {
				m = m.Or(distMask[r.dist][y*board.Width+x])
			}
		}
	}
	if r.neg {
		m = m.Not().And(uint128.Ones108)
	}
	return BoardRule{RuleSpec: r, mask: m}
}

type coord struct{ x, y int }

// withinDistance returns the on-board hexes at most d steps from (x, y).
//
// The board uses "odd-q" offset coordinates: flat-top hexes in columns,
// with odd columns shifted half a hex down. In cube coordinates (q, r, s
// with q + r + s = 0) the distance between hexes is the largest of
// |dq|, |dr|, |ds|, so we convert, enumerate every delta within d, and
// convert back. See https://www.redblobgames.com/grids/hexagons/.
func withinDistance(x, y, d int) []coord {
	q, r := x, y-(x-(x&1))/2
	out := make([]coord, 0, 3*d*(d+1)+1)
	for dq := -d; dq <= d; dq++ {
		for dr := max(-d, -dq-d); dr <= min(d, -dq+d); dr++ {
			nx := q + dq
			ny := r + dr + (nx-(nx&1))/2
			if nx >= 0 && nx < board.Width && ny >= 0 && ny < board.Height {
				out = append(out, coord{nx, ny})
			}
		}
	}
	return out
}
