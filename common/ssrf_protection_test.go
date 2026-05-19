package common

import (
	"strings"
	"testing"
)

func TestValidateURLWithFetchSettingAppliesDomainIPFilterByDefault(t *testing.T) {
	err := ValidateURLWithFetchSetting(
		"http://localhost/resource",
		true,
		false,
		false,
		false,
		nil,
		nil,
		[]string{"80", "443"},
		true,
	)

	if err == nil {
		t.Fatal("expected localhost domain resolution to be blocked")
	}
	if !strings.Contains(err.Error(), "private IP address not allowed") {
		t.Fatalf("expected private IP error, got %v", err)
	}
}

func TestValidateURLWithFetchSettingRejectsSpecialPurposeIPv4Ranges(t *testing.T) {
	urls := []string{
		"http://0.0.0.0/",
		"http://100.64.0.1/",
		"http://192.0.2.1/",
		"http://198.18.0.1/",
		"http://198.51.100.1/",
		"http://203.0.113.1/",
	}

	for _, rawURL := range urls {
		t.Run(rawURL, func(t *testing.T) {
			err := ValidateURLWithFetchSetting(rawURL, true, false, false, false, nil, nil, []string{"80"}, true)
			if err == nil {
				t.Fatal("expected special-purpose IPv4 address to be blocked")
			}
			if !strings.Contains(err.Error(), "private IP address not allowed") {
				t.Fatalf("expected private IP error, got %v", err)
			}
		})
	}
}
