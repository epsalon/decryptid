// Terminal rendering of hexes and boards, in ANSI colours.
//
// Each hex is drawn as five lines (see fillStr):
//
//	  _____      top border (shared with the hex above)
//	 /Bear#\     animal territory, on the terrain's fill character
//	/#Shed##\    structure, in the structure's colour
//	\#●●x###/    discs (●) and cube (x), in player colours
//	 \_3,4_/     bottom border with X,Y coordinates
package board

import (
	"fmt"
	"strings"

	"github.com/fatih/color"
)

// center pads txt (whose visible width is tl; it may contain colour codes)
// with pad on both sides to width l.
func center(txt string, tl int, pad string, l int) string {
	pl := l - tl
	if pl <= 0 {
		return txt
	}
	bp := pl / 2
	ap := pl - bp
	return strings.Repeat(pad, bp) + txt + strings.Repeat(pad, ap)
}

// ccenter is center with the text and the padding each in its own colour.
func ccenter(txt string, tc *color.Color, pad string, pc *color.Color, l int) string {
	return center(tc.SprintfFunc()(txt), len(txt), pc.SprintfFunc()(pad), l)
}

// landInfo is each terrain's fill character and background, by Landscape.
var landInfo = []struct {
	Char  string
	Color color.Attribute
}{
	{"#", color.BgGreen},   // Forest
	{"·", color.BgHiBlack}, // Swamp
	{"^", color.BgWhite},   // Mountain
	{"*", color.BgYellow},  // Desert
	{"~", color.BgCyan},    // Water
}

// terrInfo is each animal territory's label and colour, by Territory.
var terrInfo = []struct {
	Name  string
	Color color.Attribute
}{
	{"", color.FgBlack}, // NoTerr
	{"Bear", color.FgBlack},
	{"Cougr", color.FgRed},
}

// bldgIcon (by BuildingType) and bldgColor (by BuildingColor) draw structures.
var bldgIcon = []string{"", "Stone", "Shed"}
var bldgColor = []color.Attribute{
	color.FgBlack,
	color.FgHiWhite,
	color.FgHiBlue,
	color.FgHiGreen,
	color.FgBlack,
}

// playerColor is each player's colour, matching the physical set's pieces.
// It must stay in the same order as game.PlayerColors.
var playerColor = []color.Attribute{
	color.FgHiYellow,
	color.FgHiRed,
	color.FgHiGreen,
	color.FgHiCyan,
	color.FgHiMagenta, // purple
}

// playerStr draws a disc per player in the set, returning the string and
// its visible width.
func playerStr(playerSet PlayerSet) (string, int) {
	var sb strings.Builder
	n := 0
	for i, c := range playerColor {
		if playerSet&(1<<i) != 0 {
			sb.WriteString(color.New(c).Sprint("●"))
			n++
		}
	}
	return sb.String(), n
}

var highlightColor = color.New(color.BgHiRed, color.FgHiWhite, color.Bold)

// FillStr renders the hex as 5 lines. The bottom border shows the hex's
// X,Y coordinates, highlighted when h.Highlighted is set.
func (h Hex) FillStr() []string {
	return h.fillStr(-1, -1)
}

// fillStr renders the hex as 5 lines, labelled with coordinates (x, y)
// unless x is negative.
func (h Hex) fillStr(x, y int) []string {
	l := landInfo[h.L]
	t := terrInfo[h.T]
	lc := color.New(l.Color, color.FgBlack)
	tc := color.New(l.Color, t.Color)
	bg := color.BgBlack
	if h.C == Black {
		bg = color.BgHiWhite // black text needs a light background
	}
	bc := color.New(bldgColor[h.C], bg)
	ps, psl := playerStr(h.Discs)
	if h.Cube != 0 {
		ps = color.New(playerColor[h.Cube-1]).SprintfFunc()("x") + ps
		psl++
	}
	return []string{
		" _____ ",
		"/" + ccenter(t.Name, tc, l.Char, lc, 5) + "\\",
		"/" + ccenter(bldgIcon[h.B], bc, l.Char, lc, 7) + "\\",
		"\\" + center(ps, psl, lc.SprintfFunc()(l.Char), 7) + "/",
		"\\" + coordStr(x, y, h.Highlighted) + "/",
	}
}

// coordStr is the 5-wide bottom border label: "x,y" padded with '_',
// on a highlight colour when hl is set.
func coordStr(x, y int, hl bool) string {
	txt := ""
	if x >= 0 {
		txt = fmt.Sprintf("%d,%d", x, y)
	}
	if hl {
		if txt == "" {
			txt = "!!!"
		}
		return center(highlightColor.Sprint(txt), len(txt), "_", 5)
	}
	return center(txt, len(txt), "_", 5)
}

// String draws a single hex.
func (h Hex) String() string {
	f := h.FillStr()
	return "\n " + f[0] + "\n " + f[1] + "\n" + f[2] + "\n" + f[3] + "\n " + f[4] + "\n"
}

// emptyHex fills the space of a hex that is off the board, so the borders
// of the hexes around it still line up.
var emptyHex = []string{
	"      ",
	"/     ",
	"/       ",
	"\\       ",
	"\\     ",
}

// String draws the whole board. Odd columns sit half a hex (two lines)
// lower than even ones, so each text line pairs a line of the even-column
// hexes with a line of the odd-column hexes, two lines further up:
//
//	 /LINE1\*LINE3*/LINE1\     even: line 1 (territory)  odd: line 3, row above
//	/*LINE2*\_____/*LINE2*\    even: line 2 (structure)  odd: bottom, row above
//	\*LINE3*/LINE1\*LINE3*/    even: line 3 (markers)    odd: line 1
//	 \_____/*LINE2*\_____/     even: bottom border       odd: line 2
//
// Neighbouring hexes share a border character, so each hex's last
// character is dropped except in the final column.
func (b Board) String() string {
	fillStrs := make([][][]string, len(b))
	for i, br := range b {
		fillStrs[i] = make([][]string, len(br))
		for j, hex := range br {
			fillStrs[i][j] = hex.fillStr(j, i)
		}
	}
	ncols := len(b[0])
	var sb strings.Builder
	sb.WriteString("\n")
	sb.WriteString(strings.Repeat("  _____       ", ncols/2))
	sb.WriteString("\n")
	for row := 0; row < len(b)+1; row++ {
		lmx := 4
		if row == len(b) {
			lmx = 2
		}
		for l := 0; l < lmx; l++ {
			if l == 0 || l == 3 {
				sb.WriteString(" ")
			}
			for c := 0; c < ncols; c++ {
				// Column c shows line xl+1 of the hex in row xr.
				xr, xl := row, l
				if c&1 == 1 {
					xl = l - 2
					if xl < 0 {
						xl += 4
						xr--
					}
				}
				if xr < 0 || xr >= len(b) {
					sb.WriteString(emptyHex[xl+1])
				} else {
					fs := fillStrs[xr][c][xl+1]
					if c < ncols-1 {
						fs = fs[:len(fs)-1]
					}
					sb.WriteString(fs)
				}
			}
			sb.WriteString("\n")
		}
	}
	return sb.String()
}
