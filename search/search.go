// Package search finds rule combinations that pin the cryptid to one hex.
// Rules are represented as bit masks over the 108 board hexes.
package search

import "github.com/epsalon/decryptid/uint128"

const boardCells = 9 * 12

type mask = uint128.Uint128

// Solution is one assignment of rules to players that leaves exactly one hex.
type Solution struct {
	Rules    []int // Rules[p] is the index of player p's rule
	Location int   // index of the cryptid's hex (y*12 + x)
}

// Solve finds every assignment of distinct rules to players such that
// player p's rule is one of cands[p], the rules together match exactly one
// hex, and every rule is needed (dropping any one leaves more than one hex).
func Solve(masks []mask, cands [][]int) []Solution {
	var out []Solution
	Each(masks, cands, func(rules []int, loc int) {
		out = append(out, Solution{Rules: append([]int(nil), rules...), Location: loc})
	})
	return out
}

// Each calls fn for every solution Solve would return, without storing them.
// The rules slice is reused between calls, so fn must copy it to keep it.
func Each(masks []mask, cands [][]int, fn func(rules []int, loc int)) {
	n := len(cands)
	canHave := make([][]bool, n)
	inUnion := make([]bool, len(masks))
	for p, cs := range cands {
		canHave[p] = make([]bool, len(masks))
		for _, r := range cs {
			canHave[p][r] = true
			inUnion[r] = true
		}
	}
	allowed := []int{}
	for r, ok := range inUnion {
		if ok {
			allowed = append(allowed, r)
		}
	}

	for _, set := range combos(masks, allowed, n) {
		if !consistent(masks, set) {
			continue
		}
		loc := intersect(masks, set, -1).TrailingZeros()
		assign(set, canHave, func(a []int) { fn(a, loc) })
	}
}

func intersect(masks []mask, set []int, skip int) mask {
	m := uint128.Ones(boardCells)
	for i, r := range set {
		if i != skip {
			m = m.And(masks[r])
		}
	}
	return m
}

// combos returns every n-element subset of allowed (in increasing order)
// whose masks intersect in exactly one hex. A branch is cut as soon as it
// reaches one hex early, since any extra rule would then be redundant.
func combos(masks []mask, allowed []int, n int) [][]int {
	var out [][]int
	cur := make([]int, 0, n)
	var rec func(start int, m mask)
	rec = func(start int, m mask) {
		if len(cur) == n {
			out = append(out, append([]int(nil), cur...))
			return
		}
		for i := start; i < len(allowed); i++ {
			r := allowed[i]
			nm := m.And(masks[r])
			c := nm.OnesCount()
			if c == 0 || (c == 1) != (len(cur)+1 == n) {
				continue
			}
			cur = append(cur, r)
			rec(i+1, nm)
			cur = cur[:len(cur)-1]
		}
	}
	rec(0, uint128.Ones(boardCells))
	return out
}

// consistent reports whether every rule in the set is needed, i.e. dropping
// any single rule leaves more than one possible hex.
func consistent(masks []mask, set []int) bool {
	for i := range set {
		if intersect(masks, set, i).OnesCount() == 1 {
			return false
		}
	}
	return true
}

// assign calls fn with every way to give each player a different rule from
// set, where player p may only get rules with canHave[p][r].
func assign(set []int, canHave [][]bool, fn func([]int)) {
	n := len(canHave)
	cur := make([]int, n)
	used := make([]bool, len(set))
	var rec func(p int)
	rec = func(p int) {
		if p == n {
			fn(cur)
			return
		}
		for i, r := range set {
			if !used[i] && canHave[p][r] {
				used[i] = true
				cur[p] = r
				rec(p + 1)
				used[i] = false
			}
		}
	}
	rec(0)
}
