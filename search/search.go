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
// player p's rule is one of cands[p] and the rules together match exactly
// one hex. If minimal is set, every rule must also be needed: dropping any
// one leaves more than one hex.
func Solve(masks []mask, cands [][]int, minimal bool) []Solution {
	var out []Solution
	chunk := 64
	var ruleBuf []int
	Each(masks, cands, minimal, func(rules []int, loc int) {
		n := len(rules)
		if len(ruleBuf) < n {
			ruleBuf = make([]int, n*chunk)
			if chunk < 2048 {
				chunk *= 4
			}
		}
		r := ruleBuf[:n:n]
		copy(r, rules)
		ruleBuf = ruleBuf[n:]
		out = append(out, Solution{Rules: r, Location: loc})
	})
	return out
}

// Each calls fn for every solution Solve would return, without storing them.
// The rules slice is reused between calls, so fn must copy it to keep it.
func Each(masks []mask, cands [][]int, minimal bool, fn func(rules []int, loc int)) {
	EachSampled(masks, cands, minimal, nil, fn)
}

// EachSampled is Each, but skips (without enumerating its assignments)
// every rule set for which keep returns false. A nil keep keeps all sets.
func EachSampled(masks []mask, cands [][]int, minimal bool, keep func(set []int) bool, fn func(rules []int, loc int)) {
	n := len(cands)
	canHave := make([]uint128.Uint128, n)
	var union uint128.Uint128
	for p, cs := range cands {
		for _, r := range cs {
			canHave[p] = canHave[p].SetBit(r)
			union = union.SetBit(r)
		}
	}
	allowed := make([]int, 0, union.OnesCount())
	union.ForEachBit(func(r int) {
		allowed = append(allowed, r)
	})

	curAssign := make([]int, n)
	var recAssign func(p int, used uint32, set []int, loc int)
	recAssign = func(p int, used uint32, set []int, loc int) {
		if p == n {
			fn(curAssign, loc)
			return
		}
		ch := canHave[p]
		for i, r := range set {
			if used&(1<<i) == 0 && ch.Bit(r) {
				curAssign[p] = r
				recAssign(p+1, used|(1<<i), set, loc)
			}
		}
	}

	eachCombo(masks, allowed, n, minimal, func(set []int, loc int) {
		if minimal && !consistent(masks, set) {
			return
		}
		if keep != nil && !keep(set) {
			return
		}
		recAssign(0, 0, set, loc)
	})
}

var allHexes = uint128.Ones(boardCells)

func intersect(masks []mask, set []int, skip int) mask {
	var m mask
	first := true
	for i, r := range set {
		if i != skip {
			if first {
				m = masks[r]
				first = false
			} else {
				m = m.And(masks[r])
			}
		}
	}
	if first {
		return allHexes
	}
	return m
}

func eachCombo(masks []mask, allowed []int, n int, minimal bool, fn func(set []int, loc int)) {
	cur := make([]int, 0, n)
	var rec func(start int, m mask)
	rec = func(start int, m mask) {
		if len(cur) == n {
			fn(cur, m.TrailingZeros())
			return
		}
		for i := start; i < len(allowed); i++ {
			r := allowed[i]
			nm := m.And(masks[r])
			c := nm.OnesCount()
			last := len(cur)+1 == n
			if c == 0 || (last && c != 1) || (minimal && !last && c == 1) {
				continue
			}
			cur = append(cur, r)
			rec(i+1, nm)
			cur = cur[:len(cur)-1]
		}
	}
	rec(0, allHexes)
}

// combos returns every n-element subset of allowed (in increasing order)
// whose masks intersect in exactly one hex. With minimal set, a branch is
// cut as soon as it reaches one hex early, since any extra rule would then
// be redundant.
func combos(masks []mask, allowed []int, n int, minimal bool) [][]int {
	var out [][]int
	eachCombo(masks, allowed, n, minimal, func(set []int, _ int) {
		out = append(out, append([]int(nil), set...))
	})
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

// CountSets returns how many rule sets Each would visit (each set yields
// one or more assignments).
func CountSets(masks []mask, cands [][]int, minimal bool) int {
	n := 0
	EachSampled(masks, cands, minimal, func([]int) bool { n++; return false }, nil)
	return n
}
