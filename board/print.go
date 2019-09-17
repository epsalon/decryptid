package board

import "strings"
import "github.com/fatih/color"

// .._____..   Cube = ◾
// ./Cougr\.   Shack = ▲
// /^^^^^^^\️   Stone = ⬣
// \^^^^^^^/   Disc = ●
// .\_____/.


func center(txt string, tl int, pad string, l int) string {
	pl := l - tl
	if pl <= 0 {
		return txt
	}
	bp := pl / 2
	ap := pl - bp
	return strings.Repeat(pad, bp) + txt + strings.Repeat(pad, ap)
}

func ccenter(txt string, tc *color.Color, pad string, pc *color.Color, l int) string {
	return center(tc.SprintfFunc()(txt), len(txt), pc.SprintfFunc()(pad), l)
}

var landInfo = [] struct {
  Char string
  Color color.Attribute
}{
  {"#", color.BgGreen},  // Forest
  {"·", color.BgHiBlack},  // Swamp
  {"^", color.BgWhite},  // Mountain
  {"*", color.BgYellow}, // Desert
  {"~", color.BgCyan}, // Water
}

var terrInfo = [] struct {
  Name string
  Color color.Attribute
}{
	{"", color.FgBlack}, // NoTerr
	{"Bear", color.FgBlack},
	{"Cougr", color.FgRed},
}

var bldgIcon = []string {"", "Stone", "Shed"}
var bldgColor = []color.Attribute {
	color.FgBlack,
	color.FgHiWhite,
	color.FgHiBlue,
	color.FgHiGreen,
}

var playerColor = []color.Attribute {
	color.FgHiYellow,
	color.FgHiMagenta,
	color.FgHiBlue,
	color.FgHiCyan,
	color.FgHiBlack,
}

func playerStr(playerSet PlayerSet) (string, int) {
	var sb strings.Builder
	var ln int
	p := PlayerSet(1)
	for _, c := range playerColor {
		if playerSet & p != 0 {
			sb.WriteString(color.New(c).SprintFunc()("●"))
			ln += 1
		}
		p <<= 1
	}
	return sb.String(), ln
}

func (h Hex) FillStr() []string {
	l := landInfo[h.L]
	t := terrInfo[h.T]
	lc := color.New(l.Color, color.FgBlack)
	tc := color.New(l.Color, t.Color)
	bc := color.New(bldgColor[h.C], color.BgBlack)
	ps, psl := playerStr(h.Discs)
	if (h.Cube != 0) {
		ps = color.New(playerColor[h.Cube-1]).SprintfFunc()("x") + ps
		psl += 1
	}
	return []string {
		" _____ ",
		"/" + ccenter(t.Name, tc, l.Char, lc, 5) + "\\",
		"/" + ccenter(bldgIcon[h.B], bc, l.Char, lc, 7) + "\\",
		"\\" + center(ps, psl, lc.SprintfFunc()(l.Char), 7) + "/",
		"\\_____/",
	}
}

func (h Hex) String() string {
	f := h.FillStr()
	return "\n " + f[0] + "\n " + f[1] + "\n" + f[2] + "\n" + f[3] + "\n " + f[4] + "\n"
}

var emptyHex = []string {
  "      ",
  "/     ",
  "/       ",
  "\\       ",
  "\\     ",
}

// fillStr = [7, 7, 9, 9, 7]

//0 .\_____/.......\_____/
//1 ./LINE1\......./LINE1\
//2 /*LINE2*\_____/*LINE2*\ 9 / 7 / 9 / 7 / 9 ...
//3 \*LINE3*/LINE1\*LINE3*/ 9[ ]7[ ]9[ ]7[ ]9 ...
//4 .\_____/*LINE2*\_____/  > 7[ ]9
//5 ./LINE1\*LINE3*/LINE1\  > 
//6 /*LINE2*\_____/*LINE2*\

func (b Board) String() string {
	var fillStrs = make([][][]string, len(b))
	for i, br := range b {
		fillStrs[i] = make ([][]string, len(br))
		for j, hex := range br {
			fillStrs[i][j] = hex.FillStr()
		}
	}
	ncols := len(b[0])
	var sb strings.Builder
	sb.WriteString("\n")
	sb.WriteString(strings.Repeat("  _____       ", ncols / 2))
	sb.WriteString("\n")
	for row := 0; row < len(b) + 1; row++ {
		lmx := 4
		if row == len(b) {
		  lmx = 2
		}
		for l := 0; l < lmx; l++ {
			if l == 0 || l == 3 {
				sb.WriteString(" ")
			}
			for c := 0; c < ncols; c++ {
				xr, xl := row, l
				if c & 1 == 1 {
					xl = l - 2
					if xl < 0 {
					  xl += 4
					  xr -= 1
					}
				}
				if (xr < 0 || xr >= len(b) ) {
					sb.WriteString(emptyHex[xl + 1])
				} else {
					fs := fillStrs[xr][c][xl + 1]
					if c < ncols - 1 {
					  fs = fs[:len(fs) - 1]
					}
					sb.WriteString(fs)
				}
			}
			sb.WriteString("\n")
		}
	}
	return sb.String()
}
