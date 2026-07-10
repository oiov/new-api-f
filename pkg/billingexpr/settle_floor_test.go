package billingexpr

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

// TestSettleFloorsNegativeQuota verifies that a negative expression result is
// floored at 0 (billing must never credit the user) and surfaced as an
// underflow clamp for the admin_info audit trail.
func TestSettleFloorsNegativeQuota(t *testing.T) {
	exprStr := `(p - c) * 30`
	snap := &BillingSnapshot{
		BillingMode:  "tiered_expr",
		ModelName:    "test-model",
		ExprString:   exprStr,
		ExprHash:     ExprHashString(exprStr),
		GroupRatio:   1,
		QuotaPerUnit: 500000,
	}

	tr, err := ComputeTieredQuota(snap, TokenParams{P: 100, C: 100000, Len: 100})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tr.ActualQuotaAfterGroup != 0 {
		t.Fatalf("negative settle result must floor at 0, got %d", tr.ActualQuotaAfterGroup)
	}
	if tr.Clamp == nil {
		t.Fatal("negative settle result must surface a clamp marker for auditing")
	}
	if tr.Clamp.Kind != common.QuotaClampUnderflow {
		t.Fatalf("expected underflow clamp, got %s", tr.Clamp.Kind)
	}
	if tr.Clamp.Original >= 0 {
		t.Fatalf("clamp must record the original negative value, got %g", tr.Clamp.Original)
	}
}

// TestSettlePositiveResultUnaffectedByFloor ensures the floor does not alter
// normal positive settlements.
func TestSettlePositiveResultUnaffectedByFloor(t *testing.T) {
	exprStr := `p * 5 + c * 30`
	snap := &BillingSnapshot{
		BillingMode:  "tiered_expr",
		ModelName:    "test-model",
		ExprString:   exprStr,
		ExprHash:     ExprHashString(exprStr),
		GroupRatio:   1,
		QuotaPerUnit: 500000,
	}

	tr, err := ComputeTieredQuota(snap, TokenParams{P: 1000, C: 1000, Len: 1000})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// (1000*5 + 1000*30) / 1e6 * 500000 = 17500
	if tr.ActualQuotaAfterGroup != 17500 {
		t.Fatalf("expected 17500, got %d", tr.ActualQuotaAfterGroup)
	}
	if tr.Clamp != nil {
		t.Fatalf("no clamp expected for a normal settlement, got %+v", tr.Clamp)
	}
}

// TestSettleNaNBillsZeroWithClamp verifies NaN results do not panic and are
// converted to 0 with a NaN clamp marker (audited, not silently free).
func TestSettleNaNBillsZeroWithClamp(t *testing.T) {
	exprStr := `p / c * 30`
	snap := &BillingSnapshot{
		BillingMode:  "tiered_expr",
		ModelName:    "test-model",
		ExprString:   exprStr,
		ExprHash:     ExprHashString(exprStr),
		GroupRatio:   1,
		QuotaPerUnit: 500000,
	}

	tr, err := ComputeTieredQuota(snap, TokenParams{P: 0, C: 0, Len: 0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tr.ActualQuotaAfterGroup != 0 {
		t.Fatalf("NaN settle must bill 0, got %d", tr.ActualQuotaAfterGroup)
	}
	if tr.Clamp == nil || tr.Clamp.Kind != common.QuotaClampNaN {
		t.Fatalf("NaN settle must surface a NaN clamp, got %+v", tr.Clamp)
	}
	if !math.IsNaN(tr.ActualQuotaBeforeGroup) {
		t.Fatalf("ActualQuotaBeforeGroup should preserve the raw NaN for auditing, got %g", tr.ActualQuotaBeforeGroup)
	}
}
