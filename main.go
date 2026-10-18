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
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [-v] GAMEFILE|-\n       %s -rules [-basic]\n", os.Args[0], os.Args[0])
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
	if err := run(flag.Arg(0), *verbose); err != nil {
		fmt.Fprintln(os.Stderr, "decryptid:", err)
		os.Exit(1)
	}
}

func run(path string, verbose bool) error {
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
