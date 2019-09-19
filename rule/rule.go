package rule

import "github.com/epsalon/decryptid/board"

type BoardRule struct {
	RuleSpec
	arr []bool
}

type Rule func (*board.Board) []bool

type hexRule func (board.Hex) bool

type RuleSpec struct {
	Name string
	hr hexRule
	d int
	neg bool
}

func (r RuleSpec) String() string {
	return r.Name
}

type coord = struct {
	X int
	Y int
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func hexDistance(o coord, d int, lenX int, lenY int) []coord {
	ox := o.X
	oz := o.Y - (o.X - (o.X&1)) / 2
	out := make([]coord, 0, 3 * d * (d+1) + 1)
	for x := -d; x <= d; x++ {	
		for  y := max(-d, -x-d); y <= min(d, -x+d); y++ {
			z := -x-y
			outX := ox + x
			outY := oz + z + (outX - (outX & 1)) / 2
			if (outX >= 0 && outX < lenX && outY >= 0 && outY < lenY) {
				out = append(out, coord{outX, outY})
			}
		}
	}
	return out
}

func rCoord (c coord) int {
	return c.Y * 12 + c.X
}

func distanceRule(hr hexRule, d int) Rule {
	return func (b *board.Board) []bool {
		out := make([]bool, 12 * 9)
		for y, row := range *b {
			for x, hex := range row {
				if hr(hex) {
					for _, c := range hexDistance(coord{x, y}, d, 12, 9) {
						out[rCoord(c)] = true
					}
				}
			}
		}
		return out
	}
}

func negate(r Rule) Rule {
	return func (b *board.Board) []bool {
		br := r(b)
		for i, v := range br {
			br[i] = !v
		}
		return br
	}
}

func (rs RuleSpec) OnBoard(b *board.Board) BoardRule {
	br := BoardRule{RuleSpec:rs}
	r := distanceRule(rs.hr, rs.d)
	if rs.neg {
		r = negate(r)
	}
	br.arr = r(b)
	return br
}

func Apply(br BoardRule, b *board.Board, p int) {
	for i, v := range br.arr {
		h := &b[i / 12][i % 12]
		if v {
			h.Discs = h.Discs | (1 << (p-1))
			if h.Cube == p {
				h.Cube = 0
			}
		} else {
			h.Discs = h.Discs &^ (1 << (p-1))
			h.Cube = p
		}
	}
}

func (b BoardRule) ToBoolSlice() []bool {
	return b.arr
}