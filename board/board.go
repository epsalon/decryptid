// Package board describes the Cryptid map: the six map tiles, how a
// game's setup lays them out with structures into a 12x9 board of hexes,
// and the pieces on each hex.
package board

import "fmt"

// Landscape is a hex's terrain.
type Landscape int

const (
	Forest Landscape = iota
	Swamp
	Mountain
	Desert
	Water
)

// String is the display name, as used in rule names.
func (l Landscape) String() string {
	names := []string{"Forest", "Swamp", "Mountain", "Desert", "Water"}
	return names[l]
}

// Territory is the animal territory a hex belongs to, if any.
type Territory int

const (
	NoTerritory Territory = iota
	Bear
	Cougar
)

// String is the display name, as used in rule names.
func (t Territory) String() string {
	names := []string{"None", "Bear", "Cougar"}
	return names[t]
}

// BuildingType is the kind of structure on a hex, if any.
type BuildingType int

const (
	NoBuilding BuildingType = iota
	Stone
	Shed
)

// String is the display name, as used in rule names.
func (b BuildingType) String() string {
	names := []string{"None", "Standing Stone", "Abandoned Shed"}
	return names[b]
}

// BuildingColor is a structure's colour. Black is used only in advanced games.
type BuildingColor int

const (
	NoColor BuildingColor = iota
	White
	Blue
	Green
	Black // advanced game only
)

// String is the display name, as used in rule names.
func (c BuildingColor) String() string {
	names := []string{"None", "White", "Blue", "Green", "Black"}
	return names[c]
}

// PlayerSet is a set of players: bit p-1 is player p.
type PlayerSet uint8

// Hex is one space on the board and the pieces on it.
type Hex struct {
	L           Landscape
	T           Territory
	B           BuildingType
	C           BuildingColor
	Discs       PlayerSet // players with a disc here
	Cube        int       // player with a cube here (at most one), 0 if none
	Highlighted bool      // marked for display, e.g. a viable location
}

// Tile is one map tile: 3 rows of 6 hexes, in the same odd-q layout as
// the board.
type Tile [3][6]Hex

// Tiles are the game's six map tiles, numbered 1-6. The data was checked
// hex by hex against an independent transcription of the tiles that uses
// the same numbering.
var Tiles = []Tile{
	{
		{{L: Water}, {L: Water}, {L: Water}, {L: Water}, {L: Forest}, {L: Forest}},
		{{L: Swamp}, {L: Swamp}, {L: Water}, {L: Desert}, {L: Forest}, {L: Forest}},
		{{L: Swamp}, {L: Swamp}, {L: Desert}, {L: Desert, T: Bear}, {L: Desert, T: Bear}, {L: Forest, T: Bear}},
	},
	{
		{{L: Swamp, T: Cougar}, {L: Forest, T: Cougar}, {L: Forest, T: Cougar}, {L: Forest}, {L: Forest}, {L: Forest}},
		{{L: Swamp}, {L: Swamp}, {L: Forest}, {L: Desert}, {L: Desert}, {L: Desert}},
		{{L: Swamp}, {L: Mountain}, {L: Mountain}, {L: Mountain}, {L: Mountain}, {L: Desert}},
	},
	{
		{{L: Swamp}, {L: Swamp}, {L: Forest}, {L: Forest}, {L: Forest}, {L: Water}},
		{{L: Swamp, T: Cougar}, {L: Swamp, T: Cougar}, {L: Forest}, {L: Mountain}, {L: Water}, {L: Water}},
		{{L: Mountain, T: Cougar}, {L: Mountain}, {L: Mountain}, {L: Mountain}, {L: Water}, {L: Water}},
	},
	{
		{{L: Desert}, {L: Desert}, {L: Mountain}, {L: Mountain}, {L: Mountain}, {L: Mountain}},
		{{L: Desert}, {L: Desert}, {L: Mountain}, {L: Water}, {L: Water}, {L: Water, T: Cougar}},
		{{L: Desert}, {L: Desert}, {L: Desert}, {L: Forest}, {L: Forest}, {L: Forest, T: Cougar}},
	},
	{
		{{L: Swamp}, {L: Swamp}, {L: Swamp}, {L: Mountain}, {L: Mountain}, {L: Mountain}},
		{{L: Swamp}, {L: Desert}, {L: Desert}, {L: Water}, {L: Mountain}, {L: Mountain, T: Bear}},
		{{L: Desert}, {L: Desert}, {L: Water}, {L: Water}, {L: Water, T: Bear}, {L: Water, T: Bear}},
	},
	{
		{{L: Desert, T: Bear}, {L: Desert}, {L: Swamp}, {L: Swamp}, {L: Swamp}, {L: Forest}},
		{{L: Mountain, T: Bear}, {L: Mountain}, {L: Swamp}, {L: Swamp}, {L: Forest}, {L: Forest}},
		{{L: Mountain}, {L: Water}, {L: Water}, {L: Water}, {L: Water}, {L: Forest}},
	},
}

// Board is the full map, indexed b[y][x]: 9 rows (3 tile rows of 3) by
// 12 columns (2 tile columns of 6).
type Board [Height][Width]Hex

// TileId places a map tile. Flipped tiles are rotated 180 degrees.
type TileId struct {
	Id      int  `json:"id"`
	Flipped bool `json:"flipped,omitempty"`
}

// BuildingSpec places a structure on hex (X, Y).
type BuildingSpec struct {
	X int           `json:"x"`
	Y int           `json:"y"`
	B BuildingType  `json:"type"`
	C BuildingColor `json:"color"`
}

// BoardSpec is a game's setup: the tile in each of the 3x2 tile slots
// (rows top to bottom, then left to right) and the structures.
type BoardSpec struct {
	Tiles     [3][2]TileId   `json:"tiles"`
	Buildings []BuildingSpec `json:"buildings"`
}

// boardPos maps index i within a tile (of size n along one axis) in tile
// slot slot to a board index along the same axis. A flipped tile is
// rotated 180 degrees, which reverses both axes. That keeps the odd-q
// layout intact because a tile is an even number of columns wide.
func boardPos(slot, i, n int, flip bool) int {
	if flip {
		return (slot+1)*n - i - 1
	}
	return slot*n + i
}

// MakeBoard lays out the tiles and structures of a setup.
func MakeBoard(s BoardSpec) Board {
	var b Board
	for slotRow, row := range s.Tiles {
		for slotCol, tid := range row {
			for r, tileRow := range Tiles[tid.Id-1] {
				y := boardPos(slotRow, r, 3, tid.Flipped)
				for c, hex := range tileRow {
					b[y][boardPos(slotCol, c, 6, tid.Flipped)] = hex
				}
			}
		}
	}
	for _, bd := range s.Buildings {
		hex := &b[bd.Y][bd.X]
		hex.B, hex.C = bd.B, bd.C
	}
	return b
}

// Width and Height are the board's size in hexes. Hex (x, y) is b[y][x];
// odd columns sit half a hex lower than even ones.
const (
	Width  = 12
	Height = 9
)

// Markers returns, for player p (1-based), which hexes hold that player's
// discs (their rule allows the cryptid there) and cubes (it doesn't).
// Hexes are indexed y*Width + x.
func (b *Board) Markers(p int) (discs, cubes []bool) {
	discs = make([]bool, Width*Height)
	cubes = make([]bool, Width*Height)
	for y, row := range b {
		for x, h := range row {
			discs[y*Width+x] = h.Discs&(1<<(p-1)) != 0
			cubes[y*Width+x] = h.Cube == p
		}
	}
	return discs, cubes
}

// Short lowercase names used in JSON and game files.
var (
	landscapeKeys = []string{"forest", "swamp", "mountain", "desert", "water"}
	territoryKeys = []string{"", "bear", "cougar"}
	buildingKeys  = []string{"", "stone", "shed"}
	colorKeys     = []string{"", "white", "blue", "green", "black"}
)

func lookup(keys []string, text []byte, what string) (int, error) {
	for i, k := range keys {
		if k == string(text) {
			return i, nil
		}
	}
	return 0, fmt.Errorf("unknown %s %q", what, text)
}

func (l Landscape) MarshalText() ([]byte, error) { return []byte(landscapeKeys[l]), nil }
func (l *Landscape) UnmarshalText(b []byte) error {
	i, err := lookup(landscapeKeys, b, "terrain")
	*l = Landscape(i)
	return err
}
func (t Territory) MarshalText() ([]byte, error) { return []byte(territoryKeys[t]), nil }
func (t *Territory) UnmarshalText(b []byte) error {
	i, err := lookup(territoryKeys, b, "territory")
	*t = Territory(i)
	return err
}
func (b BuildingType) MarshalText() ([]byte, error) { return []byte(buildingKeys[b]), nil }
func (b *BuildingType) UnmarshalText(t []byte) error {
	i, err := lookup(buildingKeys, t, "structure")
	*b = BuildingType(i)
	return err
}
func (c BuildingColor) MarshalText() ([]byte, error) { return []byte(colorKeys[c]), nil }
func (c *BuildingColor) UnmarshalText(b []byte) error {
	i, err := lookup(colorKeys, b, "color")
	*c = BuildingColor(i)
	return err
}

// Key returns the color's short name, as used in game files.
func (c BuildingColor) Key() string { return colorKeys[c] }

// Key returns the structure's short name, as used in game files.
func (b BuildingType) Key() string { return buildingKeys[b] }
