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

func TestFromBool(t *testing.T) {
	u := FromBoolSlice(testSlice)
	exp := Uint128{576460752303423488, 8}
	if !u.Equals(exp) {
		t.Errorf("Bad encoding for array. Expected %+v, got %+v", exp, u)
	}
}
