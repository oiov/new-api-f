package oauth

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

func TestResolveGoogleRedirectBase(t *testing.T) {
	originalAddr := system_setting.ServerAddress
	defer func() { system_setting.ServerAddress = originalAddr }()

	tests := []struct {
		name          string
		serverAddress string
		want          string
	}{
		{
			name:          "production: nbility.dev",
			serverAddress: "https://nbility.dev",
			want:          "https://nbility.dev",
		},
		{
			name:          "trailing slash stripped",
			serverAddress: "https://nbility.dev/",
			want:          "https://nbility.dev",
		},
		{
			name:          "local dev default",
			serverAddress: "http://localhost:3000",
			want:          "http://localhost:3000",
		},
		{
			name:          "custom domain",
			serverAddress: "https://example.com",
			want:          "https://example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			system_setting.ServerAddress = tt.serverAddress
			got := resolveGoogleRedirectBase(nil)
			if got != tt.want {
				t.Errorf("resolveGoogleRedirectBase() = %q, want %q", got, tt.want)
			}
		})
	}
}
