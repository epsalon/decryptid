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

func TestAnd(t *testing.T) {
	andSlice := make([]bool, len(testSlice))
	for i := range testSlice {
		andSlice[i] = testSlice[i] && testSlice2[i]
	}
	and128 := FromBoolSlice(testSlice).And(FromBoolSlice(testSlice2))
	exp := FromBoolSlice(andSlice)
	if !and128.Equals(exp) {
		t.Errorf("Bad result for And. Expected %+v, got %+v", exp, and128)
	}
}

func TestAndNot(t *testing.T) {
	andSlice := make([]bool, len(testSlice))
	for i := range testSlice {
		andSlice[i] = testSlice[i] && !testSlice2[i]
	}
	and128 := FromBoolSlice(testSlice).AndNot(FromBoolSlice(testSlice2))
	exp := FromBoolSlice(andSlice)
	if !and128.Equals(exp) {
		t.Errorf("Bad result for AndNot. Expected %+v, got %+v", exp, and128)
	}
}

func TestOnesCount(t *testing.T) {
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

func TestBits(t *testing.T) {
	var u Uint128
	for _, i := range []int{3, 64, 100} {
		u = u.SetBit(i)
	}
	if !u.Bit(3) || !u.Bit(64) || !u.Bit(100) || u.Bit(4) || u.OnesCount() != 3 {
		t.Errorf("SetBit/Bit mismatch: %v", u)
	}
	if tz := u.TrailingZeros(); tz != 3 {
		t.Errorf("TrailingZeros = %v, want 3", tz)
	}
	if tz := (Uint128{Hi: 2}).TrailingZeros(); tz != 65 {
		t.Errorf("TrailingZeros = %v, want 65", tz)
	}
}

func TestToBoolSlice(t *testing.T) {
	u := FromBoolSlice(testSlice)
	s := u.ToBoolSlice(len(testSlice))
	for i := range testSlice {
		if s[i] != testSlice[i] {
			t.Fatalf("ToBoolSlice mismatch at %d: got %v, want %v", i, s[i], testSlice[i])
		}
	}
}

func TestOnes(t *testing.T) {
	tests := []struct {
		l    int
		ones int
	}{
		{0, 0},
		{1, 1},
		{63, 63},
		{64, 64},
		{65, 65},
		{108, 108},
		{128, 128},
	}
	for _, tt := range tests {
		u := Ones(tt.l)
		if c := u.OnesCount(); c != tt.ones {
			t.Errorf("Ones(%d).OnesCount() = %d, want %d", tt.l, c, tt.ones)
		}
	}
}

func TestIntersects(t *testing.T) {
	u1 := FromBoolSlice(testSlice)
	u2 := FromBoolSlice(testSlice2)
	// testSlice and testSlice2 both have bit 123 set (index 123)
	if !u1.Intersects(u2) {
		t.Error("Intersects: expected true, got false")
	}
	uZero := Uint128{}
	if u1.Intersects(uZero) {
		t.Error("Intersects with zero: expected false, got true")
	}
	uLo := Uint128{Lo: 1}
	uHi := Uint128{Hi: 1}
	if uLo.Intersects(uHi) {
		t.Error("Intersects disjoint: expected false, got true")
	}
	if !uLo.Intersects(Uint128{Lo: 3}) {
		t.Error("Intersects on Lo: expected true, got false")
	}
}

func TestContains(t *testing.T) {
	u1 := FromBoolSlice(testSlice)
	if !u1.Contains(u1) {
		t.Error("Contains self: expected true, got false")
	}
	if !u1.Contains(Uint128{}) {
		t.Error("Contains empty: expected true, got false")
	}
	sub := Uint128{Lo: 8} // bit 3
	if !u1.Contains(sub) {
		t.Error("Contains subset: expected true, got false")
	}
	sup := Uint128{Lo: 12} // bits 2 and 3
	if u1.Contains(sup) {
		t.Error("Contains superset: expected false, got true")
	}
}

func TestForEachBit(t *testing.T) {
	u := Uint128{Hi: (1 << 10) | 1, Lo: (1 << 3) | 1} // bits 0, 3, 64, 74
	var bits []int
	u.ForEachBit(func(i int) {
		bits = append(bits, i)
	})
	expected := []int{0, 3, 64, 74}
	if len(bits) != len(expected) {
		t.Fatalf("ForEachBit count mismatch: got %v, want %v", bits, expected)
	}
	for i := range expected {
		if bits[i] != expected[i] {
			t.Errorf("ForEachBit bit %d = %d, want %d", i, bits[i], expected[i])
		}
	}
}

func BenchmarkFromBoolSlice(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = FromBoolSlice(testSlice)
	}
}

func BenchmarkToBoolSlice(b *testing.B) {
	u := FromBoolSlice(testSlice)
	for i := 0; i < b.N; i++ {
		_ = u.ToBoolSlice(108)
	}
}

func BenchmarkIntersects(b *testing.B) {
	u1 := FromBoolSlice(testSlice)
	u2 := FromBoolSlice(testSlice2)
	for i := 0; i < b.N; i++ {
		_ = u1.Intersects(u2)
	}
}

func BenchmarkContains(b *testing.B) {
	u1 := FromBoolSlice(testSlice)
	u2 := FromBoolSlice(testSlice2)
	for i := 0; i < b.N; i++ {
		_ = u1.Contains(u2)
	}
}

func BenchmarkForEachBit(b *testing.B) {
	u := FromBoolSlice(testSlice)
	for i := 0; i < b.N; i++ {
		count := 0
		u.ForEachBit(func(int) { count++ })
	}
}

func BenchmarkIsZero(b *testing.B) {
	u := FromBoolSlice(testSlice)
	for i := 0; i < b.N; i++ {
		_ = u.IsZero()
	}
}

func BenchmarkOnes(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = Ones(108)
	}
}
