package board

import "testing"

var testSpec = BoardSpec{
	Tiles: [3][2]TileId{
		{{Id: 1}, {Id: 4}},
		{{Id: 2}, {Id: 5, Flipped: true}},
		{{Id: 6}, {Id: 3}},
	},
	Buildings: []BuildingSpec{
		{6, 4, Shed, Blue},
		{8, 3, Stone, White},
		{0, 0, Shed, White},
		{3, 7, Stone, Blue},
	},
}

func TestMakeBoard(t *testing.T) {
	b := MakeBoard(testSpec)
	checks := []struct {
		x, y int
		want Hex
	}{
		{0, 0, Hex{L: Water, B: Shed, C: White}}, // tile 1 top-left, plus building
		{5, 2, Hex{L: Forest, T: Bear}},          // tile 1 bottom-right
		{6, 0, Hex{L: Desert}},                   // tile 4 top-left
		// Tile 5 is flipped (rotated 180°): its hex (row r, col c) lands at (11-c, 5-r).
		{11, 3, Hex{L: Desert}},                             // tile 5 r2 c0
		{6, 5, Hex{L: Mountain}},                            // tile 5 r0 c5
		{6, 4, Hex{L: Mountain, T: Bear, B: Shed, C: Blue}}, // tile 5 r1 c5, plus building
	}
	for _, c := range checks {
		if got := b[c.y][c.x]; got != c.want {
			t.Errorf("hex (%d,%d) = %+v, want %+v", c.x, c.y, got, c.want)
		}
	}
	t.Log(b)
}
