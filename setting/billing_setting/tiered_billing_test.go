package billing_setting

import (
	"strings"
	"testing"
)

func TestSmokeTestExprAcceptsValidExpressions(t *testing.T) {
	valid := []string{
		`p * 5 + c * 30`,
		`len <= 272000 ? tier("standard", p * 5 + c * 30 + cr * 0.5) : tier("long_context", p * 10 + c * 45 + cr * 1.0)`,
		`p * 1.25 + c * 10 + cr * 0.125 + cc * 1.5625 + cc1h * 2.5`,
		`(p * 2 + c * 8) * (hour("Asia/Shanghai") < 8 ? 0.5 : 1)`,
	}
	for _, exprStr := range valid {
		if err := smokeTestExpr(exprStr); err != nil {
			t.Errorf("expected valid, got error for %q: %v", exprStr, err)
		}
	}
}

// TestSmokeTestExprRejectsNegativeCapableExpressions covers the blind spot
// where all-symmetric (p == c) vectors let differential expressions pass:
// `(p - c) * 30` is exactly 0 on symmetric vectors but negative whenever
// c > p, which would credit the user at settle time.
func TestSmokeTestExprRejectsNegativeCapableExpressions(t *testing.T) {
	negatives := []string{
		`(p - c) * 30`,
		`p * 5 - cr * 100`,
		`c * 10 - p * 20`,
	}
	for _, exprStr := range negatives {
		err := smokeTestExpr(exprStr)
		if err == nil {
			t.Errorf("expected rejection for negative-capable expr %q", exprStr)
			continue
		}
		if !strings.Contains(err.Error(), "< 0") {
			t.Errorf("expected negative-result error for %q, got: %v", exprStr, err)
		}
	}
}

// TestSmokeTestExprRejectsNonFiniteExpressions: NaN compares false with
// everything and +Inf is > 0, so `result < 0` alone cannot catch either.
// NaN at settle time bills 0 (free rides); +Inf saturates to int32 max.
func TestSmokeTestExprRejectsNonFiniteExpressions(t *testing.T) {
	nonFinite := []string{
		`p / c * 30 + p * 5`, // NaN at {P:0, C:0}, +Inf at {P:500000, C:0}
		`(p + 1) / (c - c)`,  // +Inf on every vector
	}
	for _, exprStr := range nonFinite {
		err := smokeTestExpr(exprStr)
		if err == nil {
			t.Errorf("expected rejection for non-finite expr %q", exprStr)
			continue
		}
		if !strings.Contains(err.Error(), "not a finite number") {
			t.Errorf("expected non-finite error for %q, got: %v", exprStr, err)
		}
	}
}
