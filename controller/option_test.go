package controller

import "testing"

func TestNormalizeOptionValueNilBecomesEmptyString(t *testing.T) {
	if got := normalizeOptionValue(nil); got != "" {
		t.Fatalf("expected nil option value to normalize to empty string, got %q", got)
	}
}
