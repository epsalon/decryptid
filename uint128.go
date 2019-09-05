package uint128

import "math/bits"

type Uint128 struct {
	Hi, Lo uint64
}

func (u Uint128) OnesCount() int {
	return bits.OnesCount64(u.Lo) + bits.OnesCount64(u.Hi)
}

func (u Uint128) IsZero() bool {
	return u.Lo == 0 && u.Hi == 0
}

func (u Uint128) And(o Uint128) Uint128 {
	return Uint128{u.Hi & o.Hi, u.Lo & o.Lo}
}

func (u Uint128) Not() Uint128 {
	return Uint128{^u.Hi, ^u.Lo}
}

func (u Uint128) AndNot(o Uint128) Uint128 {
	return Uint128{u.Hi & ^o.Hi, u.Lo & ^o.Lo}
}

func (u Uint128) Equals(o Uint128) bool {
	return u.Hi == o.Hi && u.Lo == o.Lo
}

func FromBoolSlice(s []bool) Uint128 {
	var sh, hi, lo uint64
	sh = 1
	for i := 0; i < 64 && i < len(s); i++ {
		if (s[i]) {
			lo = lo | sh
		}
		sh = sh << 1
	}
	sh = 1
	for i := 64; i < 128 && i < len(s); i++ {
		if (s[i]) {
			hi = hi | sh
		}
		sh = sh << 1
	}
	return Uint128{hi, lo}
}

func (u Uint128) ToBoolSlice(l int) []bool {
	s := make([]bool, l)
	var sh uint64
	sh = 1
	for i := 0; i < 64 && i < l; i++ {
		if (u.Lo & sh != 0) {
			s[i] = true
		}
		sh = sh << 1
	}
	sh = 1
	for i := 64; i < 128 && i < l; i++ {
		if (u.Hi & sh != 0) {
			s[i] = true
		}
		sh = sh << 1
	}
	return s
}