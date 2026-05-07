package ratio_setting

import "testing"

func TestGPT55CompletionRatioMatchesOfficialPricing(t *testing.T) {
	InitRatioSettings()

	got := GetCompletionRatio("gpt-5.5")
	want := 6.0
	if got != want {
		t.Fatalf("GetCompletionRatio(gpt-5.5) = %v, want %v", got, want)
	}

	info := GetCompletionRatioInfo("gpt-5.5")
	if !info.Locked {
		t.Fatalf("GetCompletionRatioInfo(gpt-5.5).Locked = false, want true")
	}
	if info.Ratio != want {
		t.Fatalf("GetCompletionRatioInfo(gpt-5.5).Ratio = %v, want %v", info.Ratio, want)
	}
}

func TestFormatMatchingModelNameTrimsCodexEffortSuffixes(t *testing.T) {
	tests := map[string]string{
		"gpt-5-codex-high":                        "gpt-5-codex",
		"gpt-5.1-codex-mini-low":                  "gpt-5.1-codex-mini",
		"gpt-5.1-codex-max-medium":                "gpt-5.1-codex-max",
		"gpt-5.4-mini-xhigh":                      "gpt-5.4-mini",
		"gpt-5.2-codex-high-openai-compact":       "gpt-5.2-codex-openai-compact",
		"gpt-5.1-codex-mini-xhigh-openai-compact": "gpt-5.1-codex-mini-openai-compact",
	}

	for input, want := range tests {
		got := FormatMatchingModelName(input)
		if got != want {
			t.Fatalf("FormatMatchingModelName(%q) = %q, want %q", input, got, want)
		}
	}
}
