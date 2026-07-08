package common

import (
	"net"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
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

func TestSSRFProtectionRejectsLiteralPrivateAndReservedIPs(t *testing.T) {
	protection := &SSRFProtection{
		AllowPrivateIp:   false,
		DomainFilterMode: false,
		IpFilterMode:     false,
	}

	tests := []string{
		"127.0.0.1",
		"10.0.0.1",
		"169.254.169.254",
		"fc00::1",
		"::ffff:127.0.0.1",
	}
	for _, host := range tests {
		t.Run(host, func(t *testing.T) {
			require.Error(t, protection.ValidateNetworkTarget(host, 80))
		})
	}
}

func TestSSRFProtectionAllowsPrivateIPWhenExplicitlyEnabled(t *testing.T) {
	protection := &SSRFProtection{
		AllowPrivateIp:   true,
		DomainFilterMode: false,
		IpFilterMode:     false,
	}

	require.NoError(t, protection.ValidateNetworkTarget("10.0.0.1", 80))
}

func TestSSRFProtectionRejectsResolvedPrivateIP(t *testing.T) {
	protection := &SSRFProtection{
		AllowPrivateIp:         false,
		DomainFilterMode:       false,
		IpFilterMode:           false,
		ApplyIPFilterForDomain: true,
	}

	require.NoError(t, protection.ValidateNetworkTarget("example.com", 80))
	require.Error(t, protection.ValidateResolvedIP("example.com", net.ParseIP("169.254.169.254")))
}

func TestNewSSRFProtectionFromFetchSettingParsesPortRanges(t *testing.T) {
	protection, err := NewSSRFProtectionFromFetchSetting(false, false, false, nil, nil, []string{"80", "8000-8001"}, true)
	require.NoError(t, err)

	require.NoError(t, protection.ValidateNetworkTarget("example.com", 8001))
	require.Error(t, protection.ValidateNetworkTarget("example.com", 9000))
}
