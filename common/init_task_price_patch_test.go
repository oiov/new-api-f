package common

import (
	"slices"
	"testing"
)

func TestBuildTaskPricePatches_AlwaysIncludesSeedance2Cheap(t *testing.T) {
	patches := buildTaskPricePatches("")
	if !slices.Contains(patches, "seedance-2-cheap") {
		t.Fatalf("expected patches to include seedance-2-cheap, got: %#v", patches)
	}
	if len(patches) == 0 || patches[0] != "seedance-2-cheap" {
		t.Fatalf("expected seedance-2-cheap to be first, got: %#v", patches)
	}
}

func TestBuildTaskPricePatches_MergeEnvValuesAndDedupe(t *testing.T) {
	patches := buildTaskPricePatches("  sora-2 , seedance-2-cheap, sora-2,, veo-3.0-fast-generate-001  ")
	want := []string{"seedance-2-cheap", "sora-2", "veo-3.0-fast-generate-001"}
	if !slices.Equal(patches, want) {
		t.Fatalf("unexpected patches.\nwant: %#v\ngot:  %#v", want, patches)
	}

	seen := make(map[string]bool, len(patches))
	for _, p := range patches {
		if seen[p] {
			t.Fatalf("expected no duplicates, got: %#v", patches)
		}
		seen[p] = true
	}
}
