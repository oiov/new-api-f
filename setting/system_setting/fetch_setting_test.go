package system_setting

import "testing"

func TestDefaultFetchSettingAppliesIPFilterForDomain(t *testing.T) {
	if !GetFetchSetting().ApplyIPFilterForDomain {
		t.Fatal("expected domain IP filtering to be enabled by default")
	}
}
