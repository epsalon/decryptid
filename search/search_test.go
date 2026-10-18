package search

import (
	"reflect"
	"testing"

	"github.com/epsalon/decryptid/uint128"
)

var consistencyTests = []struct {
	idx    []int
	result bool
}{
	{[]int{0, 1, 2}, true},
	{[]int{4, 0, 1, 2}, false},
	{[]int{4, 2}, true},
	{[]int{4, 3}, true},
	{[]int{1, 4, 2}, false},
	{[]int{1, 4, 3}, false},
}

func getRuleSet() []mask {
	testSet := []uint64{0xf0, 0x33, 0x55, 0x0f, 0x81}
	us := make([]mask, 0, len(testSet))
	for _, tr := range testSet {
		us = append(us, uint128.Uint128{Lo: tr})
	}
	return us
}

func TestConsistent(t *testing.T) {
	us := getRuleSet()
	for _, tc := range consistencyTests {
		if r := consistent(us, tc.idx); r != tc.result {
			t.Errorf("consistent(%v). Want: %v, Got: %v", tc.idx, tc.result, r)
		}
	}
}

func TestCombos(t *testing.T) {
	us := getRuleSet()
	all := []int{0, 1, 2, 3, 4}
	for n, want := range map[int][][]int{
		2: {{0, 4}, {1, 4}, {2, 4}, {3, 4}},
		// Sets like {1, 2, 4} pass here and are dropped later by consistent().
		3: {{0, 1, 2}, {1, 2, 3}, {1, 2, 4}, {1, 3, 4}, {2, 3, 4}},
	} {
		if got := combos(us, all, n, true); !reflect.DeepEqual(got, want) {
			t.Errorf("combos(n=%v): Want: %v, Got: %v", n, want, got)
		}
	}
}

func TestSolve(t *testing.T) {
	us := getRuleSet()
	all := []int{0, 1, 2, 3, 4}
	// Player 0 is known to hold rule 1; player 1 can't hold rule 2.
	got := Solve(us, [][]int{{1}, {0, 1, 3, 4}, all}, true)
	want := []Solution{
		{Rules: []int{1, 0, 2}, Location: 4},
		{Rules: []int{1, 3, 2}, Location: 0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Solve: Want: %v, Got: %v", want, got)
	}
}

func TestSolveNonMinimal(t *testing.T) {
	us := getRuleSet()
	all := []int{0, 1, 2, 3, 4}
	// {1, 2, 4} pins hex 0 but rule 2 is redundant ({1, 4} already does).
	has := func(sols []Solution) bool {
		for _, s := range sols {
			if reflect.DeepEqual(s.Rules, []int{1, 2, 4}) {
				return true
			}
		}
		return false
	}
	if has(Solve(us, [][]int{all, all, all}, true)) {
		t.Error("minimal search returned a redundant set")
	}
	if !has(Solve(us, [][]int{all, all, all}, false)) {
		t.Error("non-minimal search missed {1, 2, 4}")
	}
}

// BenchmarkSolve measures the core assignment search on candidate rule sets.
func BenchmarkSolve(b *testing.B) {
	us := getRuleSet()
	all := []int{0, 1, 2, 3, 4}
	cands := [][]int{{1}, {0, 1, 3, 4}, all}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Solve(us, cands, true)
	}
}

// BenchmarkCombos measures intersecting rule combo generation.
func BenchmarkCombos(b *testing.B) {
	us := getRuleSet()
	all := []int{0, 1, 2, 3, 4}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = combos(us, all, 3, true)
	}
}
