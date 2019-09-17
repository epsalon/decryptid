package board

import "testing"

var testSpec = BoardSpec {
	Tiles: [3][2]TileId {
		{{Id: 1}, {Id: 4}},
		{{Id: 2}, {Id: 5, Flipped: true}},
		{{Id: 6}, {Id: 3}},
	},
	Buildings: []BuildingSpec {
		{6, 4, Shed, Blue},
		{8, 3, Stone, White},
		{0, 0, Shed, White},
		{3, 7, Stone, Blue},
	},
}

func TestMakeBoard (t *testing.T) {
	b := MakeBoard(testSpec)
	t.Error(Hex{L: Water, T:Bear, B:Stone, C:Green, Discs: 11})
	t.Error(Hex{L: Desert, T:Cougar, B:Shed, C:Blue, Cube: 2})
	t.Error(b)
}