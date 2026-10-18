package main

import (
	"fmt"
	"math/rand"
	"strings"

	"github.com/epsalon/decryptid/game"
	"github.com/epsalon/decryptid/sim"
)

func adviseTurn(g *game.Game, who string, top int, lambda, searchAt float64) error {
	me, err := game.ParsePlayer(who)
	if err != nil {
		return err
	}
	adv, err := g.AdviseTurn(me, lambda)
	if err != nil {
		return err
	}
	b, err := g.Board()
	if err != nil {
		return err
	}
	q, s := adv.Choose(searchAt)
	switch {
	case s != nil:
		b[s.Y][s.X].Highlighted = true
	case q != nil:
		b[q.Y][q.X].Highlighted = true
	}
	fmt.Print(b)
	fmt.Printf("\n%s (%s): cryptid is on one of %d hexes (%.2f bits of uncertainty).\n",
		game.PlayerColors[me-1], g.Known[me], adv.Locations, adv.Entropy)
	switch {
	case s != nil:
		fmt.Printf("\n>>> SEARCH (%d,%d) %s: %.0f%% chance it's there.\n", s.X, s.Y, describe(b[s.Y][s.X]), 100*s.P)
	case q != nil:
		fmt.Printf("\n>>> ASK %s about (%d,%d) %s.\n", game.PlayerColors[q.Player-1], q.X, q.Y, describe(b[q.Y][q.X]))
	default:
		fmt.Println("\nNo legal action.")
		return nil
	}

	if top <= 0 {
		top = 10
	}
	fmt.Printf("\nBest questions (score = gain - %.2f x leak; bits of location information):\n", lambda)
	fmt.Printf("  %-8s %-7s %-34s %5s %6s %6s %6s\n", "ask", "hex", "", "yes%", "gain", "leak", "score")
	for i, q := range adv.Questions {
		if i == top {
			break
		}
		fmt.Printf("  %-8s %-7s %-34s %5.0f %6.3f %6.3f %6.3f\n", game.PlayerColors[q.Player-1],
			fmt.Sprintf("(%d,%d)", q.X, q.Y), describe(b[q.Y][q.X]), 100*q.PYes, q.Gain, q.Leak, q.Score)
	}
	fmt.Println("\nLikeliest hexes to search:")
	for i, s := range adv.Searches {
		if i == top {
			break
		}
		fmt.Printf("  (%d,%d) %-34s %5.1f%%\n", s.X, s.Y, describe(b[s.Y][s.X]), 100*s.P)
	}
	return nil
}

func simulate(games, players int, advanced bool, policyList string, seed int64, verbose bool) error {
	var pols []sim.Policy
	for _, name := range strings.Split(policyList, ",") {
		p, err := sim.ParsePolicy(strings.TrimSpace(name))
		if err != nil {
			return err
		}
		pols = append(pols, p)
	}
	type tally struct {
		seats, wins, turns int
	}
	stats := map[string]*tally{}
	for _, p := range pols {
		stats[p.Name] = &tally{}
	}
	rng := rand.New(rand.NewSource(seed))
	var totalTurns, unfinished int
	for i := 0; i < games; i++ {
		// Shuffle policies into seats so none keeps the first move or the
		// same neighbours.
		seats := make([]sim.Policy, players)
		for s, k := range rng.Perm(players) {
			seats[s] = pols[(k+i)%len(pols)]
			stats[seats[s].Name].seats++
		}
		cfg := sim.Config{Players: players, Advanced: advanced}
		if verbose {
			fmt.Printf("--- game %d: %v\n", i+1, names(seats))
			cfg.Log = func(s string) { fmt.Println(s) }
		}
		res, err := sim.Play(rng, cfg, seats)
		if err != nil {
			return fmt.Errorf("game %d: %v", i+1, err)
		}
		totalTurns += res.Turns
		if res.Winner == 0 {
			unfinished++
			continue
		}
		st := stats[seats[res.Winner-1].Name]
		st.wins++
		st.turns += res.Turns
	}
	fmt.Printf("%d games, %d players, %s mode: %.1f turns per game on average",
		games, players, map[bool]string{true: "advanced", false: "basic"}[advanced], float64(totalTurns)/float64(games))
	if unfinished > 0 {
		fmt.Printf(", %d unfinished", unfinished)
	}
	fmt.Printf("\n\n  %-10s %6s %6s %8s %13s\n", "policy", "seats", "wins", "win/seat", "turns to win")
	for _, p := range pols {
		st := stats[p.Name]
		if st.seats == 0 {
			continue
		}
		avg := 0.0
		if st.wins > 0 {
			avg = float64(st.turns) / float64(st.wins)
		}
		fmt.Printf("  %-10s %6d %6d %8.2f %13.1f\n", p.Name, st.seats, st.wins, float64(st.wins)/float64(st.seats), avg)
	}
	fmt.Printf("\n(an even split would be %.2f wins per seat)\n", 1/float64(players))
	return nil
}

func names(ps []sim.Policy) []string {
	var out []string
	for _, p := range ps {
		out = append(out, p.Name)
	}
	return out
}
