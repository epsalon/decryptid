package game

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/epsalon/decryptid/board"
)

// PlayerColors are the colors of the physical set, in seat order: the Greek
// letter order of the clue books (alpha red, beta green, gamma cyan, delta
// yellow, epsilon purple). A game's seats may use any of them (Game.Colors).
var PlayerColors = []string{"red", "green", "cyan", "yellow", "purple"}

// Parse reads a game description. Blank lines and text after '#' are
// ignored. Lines are:
//
//	tiles 6F 1F 3 5F 4 2F     six tile ids in reading order; F = flipped
//	stone|shed X Y COLOR      building at hex (X, Y); COLOR = white|blue|green|black
//	players N                 number of players (default 3)
//	mode basic|advanced       advanced adds "Not ..." rules and black buildings (default advanced)
//	clues minimal|any         minimal: every clue is needed to pin the cryptid (default)
//	disc PLAYER X Y           PLAYER's rule allows the cryptid at (X, Y)
//	cube PLAYER X Y           PLAYER's rule rules out (X, Y)
//	colors C1 C2 ...          the colors playing, in turn order (default: the first
//	                          'players' of PlayerColors); also sets the player count
//	rule PLAYER NAME...       PLAYER's rule is known (name or number from -rules)
//
// PLAYER is a seat number from 1 (turn order) or a color playing.
func Parse(r io.Reader) (*Game, error) {
	g := &Game{Players: 3, Advanced: true, Known: map[int]string{}}
	known := map[string]string{} // player token -> rule, resolved at the end
	var markers []pendingMarker
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
		if err := parseLine(g, f, known, &markers, &sawTiles); err != nil {
			return nil, fmt.Errorf("line %d: %v", ln, err)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if !sawTiles {
		return nil, fmt.Errorf("missing 'tiles' line")
	}
	if !g.Advanced {
		for _, b := range g.Spec.Buildings {
			if b.C == board.Black {
				return nil, fmt.Errorf("black buildings need 'mode advanced'")
			}
		}
	}
	if err := g.checkColors(); err != nil {
		return nil, err
	}
	for _, pm := range markers {
		p, err := g.Player(pm.player)
		if err != nil {
			return nil, err
		}
		pm.m.Player = p
		g.Markers = append(g.Markers, pm.m)
	}
	rules := g.Rules()
	for tok, name := range known {
		p, err := g.Player(tok)
		if err != nil {
			return nil, err
		}
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

// pendingMarker is a marker whose player is resolved once the colors are known.
type pendingMarker struct {
	player string
	m      Marker
}

func parseLine(g *Game, f []string, known map[string]string, markers *[]pendingMarker, sawTiles *bool) error {
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
		c, ok := map[string]board.BuildingColor{"white": board.White, "blue": board.Blue, "green": board.Green, "black": board.Black}[args[2]]
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
	case "clues":
		if err := need(1); err != nil {
			return err
		}
		switch args[0] {
		case "minimal":
			g.AnyClues = false
		case "any":
			g.AnyClues = true
		default:
			return fmt.Errorf("clues must be minimal or any")
		}
	case "disc", "cube":
		if err := need(3); err != nil {
			return err
		}
		if _, err := g.Player(args[0]); err != nil && !isColor(args[0]) {
			return err
		}
		x, y, err := xy(args[1], args[2])
		if err != nil {
			return err
		}
		*markers = append(*markers, pendingMarker{player: args[0], m: Marker{X: x, Y: y, Cube: f[0] == "cube"}})
	case "rule":
		if len(args) < 2 {
			return fmt.Errorf("rule takes a player and a rule name")
		}
		if _, err := g.Player(args[0]); err != nil && !isColor(args[0]) {
			return err
		}
		known[args[0]] = strings.Join(args[1:], " ")
	case "colors", "colours":
		if len(args) < 1 || len(args) > len(PlayerColors) {
			return fmt.Errorf("colors takes 1-%d colors", len(PlayerColors))
		}
		g.Colors = append([]string(nil), args...)
		g.Players = len(args)
	default:
		return fmt.Errorf("unknown command %q", f[0])
	}
	return nil
}

// Player parses a seat number (from 1) or the color of a seat.
func (g *Game) Player(s string) (int, error) {
	s = strings.ToLower(s)
	for p := 1; p <= g.Players; p++ {
		if g.ColorName(p) == s {
			return p, nil
		}
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 || n > len(PlayerColors) {
		if isColor(s) {
			return 0, fmt.Errorf("%s is not playing", s)
		}
		return 0, fmt.Errorf("bad player %q", s)
	}
	return n, nil
}

func isColor(s string) bool {
	for _, c := range PlayerColors {
		if c == s {
			return true
		}
	}
	return false
}

func xy(xs, ys string) (int, int, error) {
	x, err1 := strconv.Atoi(xs)
	y, err2 := strconv.Atoi(ys)
	if err1 != nil || err2 != nil || x < 0 || x >= board.Width || y < 0 || y >= board.Height {
		return 0, 0, fmt.Errorf("bad hex %s,%s (x is 0-%d, y is 0-%d)", xs, ys, board.Width-1, board.Height-1)
	}
	return x, y, nil
}
