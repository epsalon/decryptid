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
	top := flag.Int("n", 10, "with -cube or -turn, how many options to show")
	turn := flag.String("turn", "", "advise `PLAYER` (whose rule must be known) on their turn: what to ask or where to search")
	lambda := flag.Float64("lambda", 0.5, "with -turn, how much to avoid giving others information (0 = ignore)")
	searchAt := flag.Float64("search-at", 0.15, "with -turn, search once the likeliest hex has at least this chance")
	simGames := flag.Int("sim", 0, "play `N` AI-vs-AI games on random boards and report results")
	simPlayers := flag.Int("players", 4, "with -sim, number of players")
	simAdvanced := flag.Bool("advanced", true, "with -sim, play the advanced game")
	simPolicies := flag.String("policies", "ai,greedy,cautious,random", "with -sim, comma-separated policies, shuffled into seats each game (ai, greedy, cautious, random, or lambda:searchAt)")
	seed := flag.Int64("seed", 1, "with -sim, random seed")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `Usage: %[1]s [-v] GAMEFILE|-
       %[1]s -cube PLAYER [-n N] GAMEFILE|-
       %[1]s -turn PLAYER [-lambda L] [-search-at P] [-n N] GAMEFILE|-
       %[1]s -sim N [-players N] [-advanced=false] [-policies A,B,...] [-seed S] [-v]
       %[1]s -rules [-basic]
`, os.Args[0])
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
	if *simGames > 0 {
		if err := simulate(*simGames, *simPlayers, *simAdvanced, *simPolicies, *seed, *verbose); err != nil {
			fmt.Fprintln(os.Stderr, "decryptid:", err)
			os.Exit(1)
		}
		return
	}
	if flag.NArg() != 1 {
		flag.Usage()
		os.Exit(2)
	}
	if err := run(flag.Arg(0), *verbose, *cube, *turn, *top, *lambda, *searchAt); err != nil {
		fmt.Fprintln(os.Stderr, "decryptid:", err)
		os.Exit(1)
	}
}

func run(path string, verbose bool, cube, turn string, top int, lambda, searchAt float64) error {
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
	if turn != "" {
		return adviseTurn(g, turn, top, lambda, searchAt)
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
