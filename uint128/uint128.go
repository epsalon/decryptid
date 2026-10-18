// Package uint128 is a minimal 128-bit unsigned integer used as a bit set.
// The board has 108 hexes, so a rule's allowed hexes, or a player's
// markers, fit in one value, and combining rules is a couple of ANDs.
package uint128

import (
	"fmt"
	"math/bits"
)

// Uint128 is a 128-bit value: bits 0-63 in Lo, bits 64-127 in Hi.
type Uint128 struct {
	Hi, Lo uint64
}

// OnesCount returns the number of set bits.
func (u Uint128) OnesCount() int {
	return bits.OnesCount64(u.Lo) + bits.OnesCount64(u.Hi)
}

// IsZero reports whether no bit is set.
func (u Uint128) IsZero() bool {
	return u.Lo == 0 && u.Hi == 0
}

func (u Uint128) And(o Uint128) Uint128    { return Uint128{u.Hi & o.Hi, u.Lo & o.Lo} }
func (u Uint128) Or(o Uint128) Uint128     { return Uint128{u.Hi | o.Hi, u.Lo | o.Lo} }
func (u Uint128) Not() Uint128             { return Uint128{^u.Hi, ^u.Lo} }
func (u Uint128) AndNot(o Uint128) Uint128 { return Uint128{u.Hi &^ o.Hi, u.Lo &^ o.Lo} }
func (u Uint128) Equals(o Uint128) bool    { return u == o }

// Ones returns a value with the lowest l bits set (0 <= l <= 128).
func Ones(l int) Uint128 {
	if l < 64 {
		return Uint128{0, uint64(1)<<l - 1}
	}
	return Uint128{uint64(1)<<(l-64) - 1, ^uint64(0)}
}

// Bit reports whether bit i is set.
func (u Uint128) Bit(i int) bool {
	if i < 64 {
		return u.Lo&(uint64(1)<<i) != 0
	}
	return u.Hi&(uint64(1)<<(i-64)) != 0
}

// SetBit returns u with bit i set.
func (u Uint128) SetBit(i int) Uint128 {
	if i < 64 {
		u.Lo |= uint64(1) << i
	} else {
		u.Hi |= uint64(1) << (i - 64)
	}
	return u
}

// TrailingZeros returns the index of the lowest set bit, or 128 if u is zero.
func (u Uint128) TrailingZeros() int {
	if u.Lo != 0 {
		return bits.TrailingZeros64(u.Lo)
	}
	return 64 + bits.TrailingZeros64(u.Hi)
}

// FromBoolSlice sets bit i for each true s[i]. Entries past 128 are ignored.
func FromBoolSlice(s []bool) Uint128 {
	var u Uint128
	for i, v := range s {
		if v && i < 128 {
			u = u.SetBit(i)
		}
	}
	return u
}

// ToBoolSlice returns the lowest l bits as a slice.
func (u Uint128) ToBoolSlice(l int) []bool {
	s := make([]bool, l)
	for i := range s {
		s[i] = i < 128 && u.Bit(i)
	}
	return s
}

// String formats u as 32 hex digits.
func (u Uint128) String() string {
	return fmt.Sprintf("%016x%016x", u.Hi, u.Lo)
}
