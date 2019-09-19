package search

import "log"
import "reflect"
import "testing"
import "github.com/epsalon/decryptid/uint128"

var consitencyTests = []struct {
	idx []int
	result bool
}{
	{[]int{0,1,2}, true},
	{[]int{4,0,1,2}, false},
	{[]int{4,2}, true},
	{[]int{4,3}, true},
	{[]int{1,4,2}, false},
	{[]int{1,4,3}, false},
}

func getRuleSet() ruleSet {
	var testSet = []uint64{0xf0, 0x33, 0x55, 0x0f, 0x81}
	us := make([]rule, 0, len(testSet))
	for _, tr := range(testSet) {
		us = append(us, uint128.Uint128{Lo:tr})
	}
	log.Printf("us = %v", us)
	return us
}

func TestConsistent (t *testing.T) {
	us := getRuleSet()
	for _, tc := range(consitencyTests) {
		r := consistent(us, tc.idx)
		if r != tc.result {
			t.Errorf("consistent(%v). Want: %v, Got: %v", tc.idx, tc.result, r)
		}
	}
}

func TestFindRulesets (t *testing.T) {
	us := findRulesets(getRuleSet())
	expected := [][]int{{0,1,2},{0,4},{1,2,3},{1,4},{2,4},{3,4}}
	if !reflect.DeepEqual(us, expected) {
		t.Errorf("Rulesets: Want: %v, Got: %v", expected, us)
	}
}