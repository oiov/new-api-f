package config

import "testing"

type mapConfigForTest struct {
	BillingMode map[string]string `json:"billing_mode"`
	BillingExpr map[string]string `json:"billing_expr"`
}

// TestUpdateConfigFromMapClearsRemovedMapKeys guards the fresh-map allocation
// in updateConfigFromMap: json.Unmarshal merges into existing maps, so without
// it a model removed from billing_setting.billing_mode would keep billing with
// the stale tiered expression until process restart.
func TestUpdateConfigFromMapClearsRemovedMapKeys(t *testing.T) {
	cfg := &mapConfigForTest{
		BillingMode: map[string]string{
			"gpt-5.6":   "tiered_expr",
			"old-model": "tiered_expr",
		},
		BillingExpr: map[string]string{
			"gpt-5.6":   `p * 5 + c * 30`,
			"old-model": `p * 1 + c * 2`,
		},
	}

	err := UpdateConfigFromMap(cfg, map[string]string{
		"billing_mode": `{"gpt-5.6":"tiered_expr"}`,
		"billing_expr": `{"gpt-5.6":"p * 5 + c * 30"}`,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, ok := cfg.BillingMode["old-model"]; ok {
		t.Error("removed key old-model must be cleared from BillingMode, not merged")
	}
	if _, ok := cfg.BillingExpr["old-model"]; ok {
		t.Error("removed key old-model must be cleared from BillingExpr, not merged")
	}
	if cfg.BillingMode["gpt-5.6"] != "tiered_expr" {
		t.Errorf("retained key must survive, got %q", cfg.BillingMode["gpt-5.6"])
	}
}

// TestUpdateConfigFromMapInvalidJSONKeepsOldMap: an unparseable value must not
// wipe the existing map (the update is skipped, matching scalar behavior).
func TestUpdateConfigFromMapInvalidJSONKeepsOldMap(t *testing.T) {
	cfg := &mapConfigForTest{
		BillingMode: map[string]string{"gpt-5.6": "tiered_expr"},
	}

	err := UpdateConfigFromMap(cfg, map[string]string{
		"billing_mode": `{not-json`,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.BillingMode["gpt-5.6"] != "tiered_expr" {
		t.Error("invalid JSON must leave the existing map untouched")
	}
}
