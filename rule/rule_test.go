package rule

import "testing"

func TestWithinDistance(t *testing.T) {
	for _, tc := range []struct{ x, y, d, want int }{
		{5, 4, 0, 1}, {5, 4, 1, 7}, {5, 4, 2, 19}, {5, 4, 3, 37}, // interior: 1 + 3d(d+1)
		{0, 0, 1, 3},  // corner: itself, (0,1), (1,0)
		{11, 8, 1, 3}, // odd corner column, shifted down: itself, (10,8), (11,7)
	} {
		if got := len(withinDistance(tc.x, tc.y, tc.d)); got != tc.want {
			t.Errorf("withinDistance(%d,%d,%d): %d hexes, want %d", tc.x, tc.y, tc.d, got, tc.want)
		}
	}
}

func TestAllRules(t *testing.T) {
	rs := AllRules()
	if len(rs) != 48 {
		t.Fatalf("%d rules, want 48", len(rs))
	}
	basic := 0
	for _, r := range rs {
		if !r.Advanced() {
			basic++
		}
	}
	// Names are user-facing (game files refer to them), so pin a few.
	for i, want := range map[int]string{
		0:  "On Forest or Swamp",
		1:  "Not On Forest or Swamp",
		20: "Distance 1 from Forest",
		30: "Distance 1 from either animal territory",
		36: "Distance 2 from Standing Stone",
		46: "Distance 3 from Black structure",
	} {
		if rs[i].Name != want {
			t.Errorf("rule %d = %q, want %q", i, rs[i].Name, want)
		}
	}
	if basic != 23 {
		t.Errorf("%d basic rules, want 23", basic)
	}
}
