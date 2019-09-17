package board

type Landscape int
const (
	Forest Landscape = iota
	Swamp
	Mountain
	Desert
	Water
)

type Territory int
const (
	NoTerritory Territory = iota
	Bear
	Cougar
)

type BuildingType int
const (
	NoBuilding BuildingType = iota
	Stone
	Shed
)

type BuildingColor int
const (
	NoColor BuildingColor = iota
	White
	Blue
	Green
)

type PlayerSet uint8

type Hex struct {
	L Landscape
	T Territory
	B BuildingType
	C BuildingColor
	Discs PlayerSet
	Cube int
	Highlighted bool
}

type Tile [3][6]Hex

var Tiles = []Tile{
	{
		{{L:Water}, {L:Water}, {L:Water}, {L:Water}, {L:Forest}, {L:Forest}},
		{{L:Swamp}, {L:Swamp}, {L:Water}, {L:Desert}, {L:Forest}, {L:Forest}},
		{{L:Swamp}, {L:Swamp}, {L:Desert}, {L:Desert, T:Bear}, {L:Desert, T:Bear}, {L:Forest, T:Bear}},
	},
	{
		{{L:Swamp, T:Cougar}, {L:Forest, T:Cougar}, {L:Forest, T:Cougar}, {L:Forest}, {L:Forest}, {L:Forest}},
		{{L:Swamp}, {L:Swamp}, {L:Forest}, {L:Desert}, {L:Desert}, {L:Desert}},
		{{L:Swamp}, {L:Mountain}, {L:Mountain}, {L:Mountain}, {L:Mountain}, {L:Desert}},
	},
	{
		{{L:Swamp}, {L:Swamp}, {L:Forest}, {L:Forest}, {L:Forest}, {L:Water}},
		{{L:Swamp, T:Cougar}, {L:Swamp, T:Cougar}, {L:Forest}, {L:Mountain}, {L:Water}, {L:Water}},
		{{L:Mountain, T:Cougar}, {L:Mountain}, {L:Mountain}, {L:Mountain}, {L:Water}, {L:Water}},
	},
	{
		{{L:Desert}, {L:Desert}, {L:Mountain}, {L:Mountain}, {L:Mountain}, {L:Mountain}},
		{{L:Desert}, {L:Desert}, {L:Mountain}, {L:Water}, {L:Water}, {L:Water, T:Cougar}},
		{{L:Desert}, {L:Desert}, {L:Desert}, {L:Forest}, {L:Forest}, {L:Forest, T:Cougar}},
	},
	{
		{{L:Swamp}, {L:Swamp}, {L:Swamp}, {L:Mountain}, {L:Mountain}, {L:Mountain}},
		{{L:Swamp}, {L:Desert}, {L:Desert}, {L:Water}, {L:Mountain}, {L:Mountain, T:Bear}},
		{{L:Desert}, {L:Desert}, {L:Water}, {L:Water}, {L:Water, T:Bear}, {L:Water, T:Bear}},
	},
	{
		{{L:Desert, T:Bear}, {L:Desert}, {L:Swamp}, {L:Swamp}, {L:Swamp}, {L:Forest}},
		{{L:Mountain, T:Bear}, {L:Mountain}, {L:Swamp}, {L:Swamp}, {L:Forest}, {L:Forest}},
		{{L:Mountain}, {L:Water}, {L:Water}, {L:Water}, {L:Water}, {L:Forest}},
	},
}

type Board [9][12]Hex

type TileId struct {
	Id int
	Flipped bool
}

type BuildingSpec struct {
	X int
	Y int
	B BuildingType
	C BuildingColor
}

type BoardSpec struct {
	Tiles [3][2]TileId
	Buildings []BuildingSpec
}

func calcPos(bidx int, tidx int, tsz int, flip bool) int {
	if flip {
		return (bidx + 1) * tsz - tidx -1
	} else {
		return bidx * tsz + tidx
	}
}

func MakeBoard(s BoardSpec) Board {
	b := Board{}
	for br, c := range s.Tiles {
		for bc, tid := range c {
			tile := Tiles[tid.Id - 1]
			flip := tid.Flipped
			for tr, trv := range tile {
				brid := calcPos(br, tr, 3, flip)
				for tc, hex := range trv {
				  bcid := calcPos(bc, tc, 6, flip)
				  b[brid][bcid] = hex
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