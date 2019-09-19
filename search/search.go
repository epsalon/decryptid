package search

import "fmt"
import "log"
import "github.com/epsalon/decryptid/uint128"

type Rule interface {
	ToBoolSlice() []bool
	fmt.Stringer
}

type RuleSet []Rule

type rule = uint128.Uint128
type ruleSet = []uint128.Uint128

func FindRuleSets (xrs RuleSet) []RuleSet {
	rs := make(ruleSet, 0, len(xrs))
	for _, r := range xrs {
		bs := r.ToBoolSlice()
		u := uint128.FromBoolSlice(bs)
		log.Printf("rule = %v slice = %v", bs, u)
		rs = append(rs, u)
	}
	idxSet, posLoc := findRulesets(rs)
	log.Printf("Possible locations = %v\n", posLoc)
	out := make([]RuleSet, 0, len(idxSet))
	for _, s := range idxSet {
		ors := make([]Rule, 0, len(s))
		for _, r := range s {
		  ors = append(ors, xrs[r])
		}
		out = append(out, RuleSet(ors))
	}
	return out
}

func consistent(rs ruleSet, is []int) bool {
	for i, _ := range is {
		m := uint128.Ones(9 * 12)
		for j, r := range is {
			if i != j {
				m = m.And(rs[r])
			}
		}
		if m.OnesCount() == 1 {
			return false
		}
	}
	return true
}

func findRulesets (rs ruleSet) ([][]int, rule) {
	log.Printf("ruleset = %v", rs)
	out := [][]int{}
	cur := []int{}
	posloc := uint128.Uint128{}
	mask := uint128.Ones(9 * 12)
	masks := []rule{}
	for i := 0; ; {
		// log.Printf("External loop i=%v cur=%v mask=%v masks=%v", i, cur, mask, masks)
		for ; i < len(rs); i++ {
			cur = append(cur, i)
			masks = append(masks, mask)
			mask = mask.And(rs[i])
			// log.Printf("  Inner loop i=%v cur=%v mask=%v masks=%v", i, cur, mask, masks)
			if (mask.IsZero()) {
				// Dead end
				cur = cur[:len(cur) - 1]
				mask, masks = masks[len(masks) - 1], masks[:len(masks) - 1]
				// log.Printf("    Zero mask pop!")
				continue
			}
			if (mask.OnesCount() == 1) {
				// Found possible solution!
				if consistent(rs, cur) {
					// log.Printf("    Found solution: %v", cur)
					posloc = posloc.Or(mask)
					out = append(out, append([]int(nil), cur...))
				}
				cur = cur[:len(cur) - 1]
				mask, masks = masks[len(masks) - 1], masks[:len(masks) - 1]
				continue
			}
			if len(cur) > 4 {
				cur = cur[:len(cur) - 1]
				mask, masks = masks[len(masks) - 1], masks[:len(masks) - 1]
				continue
			}
			// Recurse deeper
		}
		if len(cur) == 0 {
			break
		}
		i, cur = cur[len(cur) - 1] + 1, cur[:len(cur) - 1] 
		mask, masks = masks[len(masks) - 1], masks[:len(masks) - 1]
	}
	return out, posloc
}