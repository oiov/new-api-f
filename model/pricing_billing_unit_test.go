package model

import "testing"

func TestModelBillingUnitMarksSeedance2OfficialModelsAsPerSecond(t *testing.T) {
	models := []string{
		"seedance-2",
		"seedance-2-480p",
		"seedance-2-720p",
		"seedance-2-1080p",
		"seedance-2-2k",
		"seedance-2-4k",
		"seedance-2-fast-720p",
		"seedance-2-mini-720p",
		"seedance-2-pro-720p",
	}

	for _, model := range models {
		if got := modelBillingUnit(model, 1); got != "second" {
			t.Fatalf("modelBillingUnit(%q, 1) = %q, want second", model, got)
		}
	}
}

func TestModelBillingUnitKeepsSeedanceCheapAsPerCall(t *testing.T) {
	if got := modelBillingUnit("seedance-2-cheap", 1); got != "call" {
		t.Fatalf("modelBillingUnit(seedance-2-cheap, 1) = %q, want call", got)
	}
}

func TestModelBillingUnitKeepsTokenModelsAsToken(t *testing.T) {
	if got := modelBillingUnit("seedance-2-720p", 0); got != "token" {
		t.Fatalf("modelBillingUnit(seedance-2-720p, 0) = %q, want token", got)
	}
}
