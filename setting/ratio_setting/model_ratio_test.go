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
