package game

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/epsalon/decryptid/board"
)

// PlayerColors are the names accepted for players 1-5, matching the colors
// the board printer uses for their discs and cubes.
var PlayerColors = []string{"yellow", "magenta", "blue", "cyan", "black"}

// Parse reads a game description. Blank lines and text after '#' are
// ignored. Lines are:
//
//	tiles 6F 1F 3 5F 4 2F     six tile ids in reading order; F = flipped
//	stone|shed X Y COLOR      building at hex (X, Y); COLOR = white|blue|green
//	players N                 number of players (default 3)
//	mode basic|advanced       advanced adds "Not ..." rules (default advanced)
//	disc PLAYER X Y           PLAYER's rule allows the cryptid at (X, Y)
//	cube PLAYER X Y           PLAYER's rule rules out (X, Y)
//	rule PLAYER NAME...       PLAYER's rule is known (name or number from -rules)
//
// PLAYER is a number from 1 or a color from PlayerColors.
func Parse(r io.Reader) (*Game, error) {
	g := &Game{Players: 3, Advanced: true, Known: map[int]string{}}
	known := map[int]string{}
	sawTiles := false
	sc := bufio.NewScanner(r)
	for ln := 1; sc.Scan(); ln++ {
		line := sc.Text()
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = line[:i]
		}
		f := strings.Fields(strings.ToLower(line))
		if len(f) == 0 {
			continue
		}
		if err := parseLine(g, f, known, &sawTiles); err != nil {
			return nil, fmt.Errorf("line %d: %v", ln, err)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if !sawTiles {
		return nil, fmt.Errorf("missing 'tiles' line")
	}
	rules := g.Rules()
	for p, name := range known {
		if p > g.Players {
			return nil, fmt.Errorf("rule given for player %d but there are only %d players", p, g.Players)
		}
		if n, err := strconv.Atoi(name); err == nil {
			if n < 1 || n > len(rules) {
				return nil, fmt.Errorf("player %d: rule number %d out of range 1-%d", p, n, len(rules))
			}
			g.Known[p] = rules[n-1].Name
			continue
		}
		found := false
		for _, r := range rules {
			if strings.EqualFold(r.Name, name) {
				g.Known[p], found = r.Name, true
			}
		}
		if !found {
			return nil, fmt.Errorf("player %d: unknown rule %q (see -rules)", p, name)
		}
	}
	return g, nil
}

func parseLine(g *Game, f []string, known map[int]string, sawTiles *bool) error {
	args := f[1:]
	need := func(n int) error {
		if len(args) != n {
			return fmt.Errorf("%s takes %d arguments, got %d", f[0], n, len(args))
		}
		return nil
	}
	switch f[0] {
	case "tiles":
		if err := need(6); err != nil {
			return err
		}
		for i, a := range args {
			t := board.TileId{}
			if strings.HasSuffix(a, "f") {
				t.Flipped, a = true, strings.TrimSuffix(a, "f")
			}
			id, err := strconv.Atoi(a)
			if err != nil || id < 1 || id > len(board.Tiles) {
				return fmt.Errorf("bad tile %q", args[i])
			}
			g.Spec.Tiles[i/2][i%2] = t
			g.Spec.Tiles[i/2][i%2].Id = id
		}
		*sawTiles = true
	case "stone", "shed":
		if err := need(3); err != nil {
			return err
		}
		x, y, err := xy(args[0], args[1])
		if err != nil {
			return err
		}
		c, ok := map[string]board.BuildingColor{"white": board.White, "blue": board.Blue, "green": board.Green}[args[2]]
		if !ok {
			return fmt.Errorf("bad building color %q", args[2])
		}
		bt := board.Stone
		if f[0] == "shed" {
			bt = board.Shed
		}
		g.Spec.Buildings = append(g.Spec.Buildings, board.BuildingSpec{X: x, Y: y, B: bt, C: c})
	case "players":
		if err := need(1); err != nil {
			return err
		}
		n, err := strconv.Atoi(args[0])
		if err != nil || n < 1 || n > len(PlayerColors) {
			return fmt.Errorf("bad player count %q", args[0])
		}
		g.Players = n
	case "mode":
		if err := need(1); err != nil {
			return err
		}
		switch args[0] {
		case "basic":
			g.Advanced = false
		case "advanced":
			g.Advanced = true
		default:
			return fmt.Errorf("mode must be basic or advanced")
		}
	case "disc", "cube":
		if err := need(3); err != nil {
			return err
		}
		p, err := player(args[0])
		if err != nil {
			return err
		}
		x, y, err := xy(args[1], args[2])
		if err != nil {
			return err
		}
		g.Markers = append(g.Markers, Marker{Player: p, X: x, Y: y, Cube: f[0] == "cube"})
	case "rule":
		if len(args) < 2 {
			return fmt.Errorf("rule takes a player and a rule name")
		}
		p, err := player(args[0])
		if err != nil {
			return err
		}
		known[p] = strings.Join(args[1:], " ")
	default:
		return fmt.Errorf("unknown command %q", f[0])
	}
	return nil
}

func player(s string) (int, error) {
	for i, c := range PlayerColors {
		if s == c {
			return i + 1, nil
		}
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 || n > len(PlayerColors) {
		return 0, fmt.Errorf("bad player %q", s)
	}
	return n, nil
}

func xy(xs, ys string) (int, int, error) {
	x, err1 := strconv.Atoi(xs)
	y, err2 := strconv.Atoi(ys)
	if err1 != nil || err2 != nil || x < 0 || x >= board.Width || y < 0 || y >= board.Height {
		return 0, 0, fmt.Errorf("bad hex %s,%s (x is 0-%d, y is 0-%d)", xs, ys, board.Width-1, board.Height-1)
	}
	return x, y, nil
}
