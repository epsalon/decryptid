package uint128

import "testing"

var testSlice = []bool{
	false, false, false, true, false, false, false, false, // 8
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, true} // 576460752303423488

var testSlice2 = []bool{
	false, false, false, false, false, false, false, false, 
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, true, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, true, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, false, false, false, false, false,
	false, false, false, true}

func TestAnd (t *testing.T) {
	andSlice := make([]bool, len(testSlice))
	for i := range(testSlice) {
		andSlice[i] = testSlice[i] && testSlice2[i]
	}
	and128 := FromBoolSlice(testSlice).And(FromBoolSlice(testSlice2))
	exp := FromBoolSlice(andSlice)
	if !and128.Equals(exp) {
		t.Errorf("Bad result for And. Expected %+v, got %+v", exp, and128)
	}
}

func TestAndNot (t *testing.T) {
	andSlice := make([]bool, len(testSlice))
	for i := range(testSlice) {
		andSlice[i] = testSlice[i] && !testSlice2[i]
	}
	and128 := FromBoolSlice(testSlice).AndNot(FromBoolSlice(testSlice2))
	exp := FromBoolSlice(andSlice)
	if !and128.Equals(exp) {
		t.Errorf("Bad result for AndNot. Expected %+v, got %+v", exp, and128)
	}
}

func TestOnesCount (t *testing.T) {
	c := FromBoolSlice(testSlice).OnesCount()
	if c != 2 {
		t.Errorf("Bad result for OnesCount. Expected 2, got %v", c)
	}
	c2 := FromBoolSlice(testSlice2).OnesCount()
	if c2 != 3 {
		t.Errorf("Bad result for OnesCount. Expected 3, got %v", c)
	}
}

func TestFromBool(t *testing.T) {
	u := FromBoolSlice(testSlice)
	exp := Uint128{576460752303423488, 8}
	if !u.Equals(exp) {
		t.Errorf("Bad encoding for array. Expected %+v, got %+v", exp, u)
	}
}
