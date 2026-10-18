// Command decryptid lists where the cryptid can be, given a board setup and
// the discs and cubes players have placed. See game.Parse for the input format.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/epsalon/decryptid/board"
	"github.com/epsalon/decryptid/game"
)

func main() {
	verbose := flag.Bool("v", false, "list the rule assignments behind each location and each player's possible rules")
	listRules := flag.Bool("rules", false, "list rule names and numbers (for 'rule' lines) and exit")
	basic := flag.Bool("basic", false, "with -rules, list only basic-mode rules")
	cube := flag.String("cube", "", "rank hexes where `PLAYER` (whose rule must be known) can place a cube, least informative to others first")
	top := flag.Int("n", 10, "with -cube, how many options to show")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [-v] GAMEFILE|-\n       %s -cube PLAYER [-n N] GAMEFILE|-\n       %s -rules [-basic]\n", os.Args[0], os.Args[0], os.Args[0])
		flag.PrintDefaults()
	}
	flag.Parse()

	if *listRules {
		g := game.Game{Advanced: !*basic}
		for i, r := range g.Rules() {
			fmt.Printf("%3d  %s\n", i+1, r.Name)
		}
		return
	}
	if flag.NArg() != 1 {
		flag.Usage()
		os.Exit(2)
	}
	if err := run(flag.Arg(0), *verbose, *cube, *top); err != nil {
		fmt.Fprintln(os.Stderr, "decryptid:", err)
		os.Exit(1)
	}
}

func run(path string, verbose bool, cube string, top int) error {
	var in io.Reader = os.Stdin
	if path != "-" {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		in = f
	}
	g, err := game.Parse(in)
	if err != nil {
		return err
	}
	if cube != "" {
		return adviseCube(g, cube, top)
	}
	res, err := g.Solve()
	if err != nil {
		return err
	}

	fmt.Print(res.Board)
	locs := res.Locations()
	if len(locs) == 0 {
		fmt.Println("\nNo viable locations: the markers don't fit any valid rule combination.")
		return nil
	}
	fmt.Printf("\n%d viable location(s), with the number of rule assignments leading to each:\n", len(locs))
	for _, l := range locs {
		fmt.Printf("  (%d,%d)  %-40s %d\n", l.X, l.Y, describe(res.Board[l.Y][l.X]), len(l.Solutions))
		if verbose {
			for _, s := range l.Solutions {
				names := make([]string, len(s.Rules))
				for p, r := range s.Rules {
					names[p] = fmt.Sprintf("%s: %s", game.PlayerColors[p], res.Rules[r])
				}
				fmt.Printf("      %s\n", strings.Join(names, " | "))
			}
		}
	}
	if verbose {
		printPlayerRules(res)
	}
	return nil
}

// printPlayerRules lists, per player, the rules still possible for them.
func printPlayerRules(res *game.Result) {
	fmt.Println("\nPossible rules per player:")
	for p := range res.Candidates {
		seen := map[int]bool{}
		var names []string
		for _, s := range res.Solutions {
			if r := s.Rules[p]; !seen[r] {
				seen[r] = true
				names = append(names, res.Rules[r].Name)
			}
		}
		fmt.Printf("  %d (%s): %d\n", p+1, game.PlayerColors[p], len(names))
		for _, n := range names {
			fmt.Printf("      %s\n", n)
		}
	}
}

func describe(h board.Hex) string {
	parts := []string{h.L.String()}
	if h.T != board.NoTerritory {
		parts = append(parts, h.T.String()+" territory")
	}
	if h.B != board.NoBuilding {
		parts = append(parts, h.C.String()+" "+h.B.String())
	}
	return strings.Join(parts, ", ")
}

func adviseCube(g *game.Game, who string, top int) error {
	me, err := game.ParsePlayer(who)
	if err != nil {
		return err
	}
	opts, err := g.AdviseCube(me)
	if err != nil {
		return err
	}
	b, err := g.Board()
	if err != nil {
		return err
	}
	if top <= 0 || top > len(opts) {
		top = len(opts)
	}
	for _, o := range opts[:top] {
		b[o.Y][o.X].Highlighted = true
	}
	fmt.Print(b)

	fmt.Printf("\n%d hexes where %s (%s) can place a cube; best %d, least informative first.\n",
		len(opts), game.PlayerColors[me-1], g.Known[me], top)
	fmt.Println("Bits = what the cube tells the others (summed, expected over their possible rules);")
	fmt.Println("Loc = drop in their uncertainty about the location (can be negative).")
	fmt.Printf("\n  %-7s %-38s %6s %6s", "hex", "", "bits", "loc")
	for p := 1; p <= g.Players; p++ {
		if p != me {
			fmt.Printf(" %8s", game.PlayerColors[p-1])
		}
	}
	fmt.Println()
	for _, o := range opts[:top] {
		fmt.Printf("  %-7s %-38s %6.3f %6.3f", fmt.Sprintf("(%d,%d)", o.X, o.Y), describe(b[o.Y][o.X]), o.Bits, o.LocBits)
		for p := 1; p <= g.Players; p++ {
			if p != me {
				fmt.Printf(" %8.3f", o.PerPlayer[p-1])
			}
		}
		fmt.Println()
	}
	if top < len(opts) {
		w := opts[len(opts)-1]
		fmt.Printf("  ...\n  worst: (%d,%d) at %.3f bits\n", w.X, w.Y, w.Bits)
	}
	return nil
}
