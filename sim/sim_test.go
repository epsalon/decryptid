package sim

import (
	"math/rand"
	"testing"
)

func TestPlay(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for _, cfg := range []Config{{Players: 3}, {Players: 4, Advanced: true}} {
		for i := 0; i < 4; i++ {
			cfg := cfg
			if i == 0 {
				cfg.Log = func(s string) { t.Log(s) }
			}
			seats := make([]Policy, cfg.Players)
			for s := range seats {
				seats[s] = Policies[[]string{"ai", "greedy", "random", "cautious"}[(s+i)%4]]
			}
			res, err := Play(rng, cfg, seats)
			if err != nil {
				t.Fatal(err)
			}
			if res.Winner == 0 {
				t.Errorf("%+v game %d: nobody won in %d turns", cfg, i, res.Turns)
			}
			t.Logf("players=%d advanced=%v game %d: P%d (%s) won in %d turns", cfg.Players, cfg.Advanced, i, res.Winner, seats[res.Winner-1].Name, res.Turns)
		}
	}
}
