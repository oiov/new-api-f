package controller

import "testing"

func TestNormalizeOptionValueNilBecomesEmptyString(t *testing.T) {
	if got := normalizeOptionValue(nil); got != "" {
		t.Fatalf("expected nil option value to normalize to empty string, got %q", got)
	}
}

func TestValidateOptionUpdateAcceptsKnownEmailSenderTypes(t *testing.T) {
	if err := validateOptionUpdate("EmailSenderType", "smtp"); err != nil {
		t.Fatalf("expected smtp sender type to be accepted: %v", err)
	}
	if err := validateOptionUpdate("EmailSenderType", "cloudflare_worker"); err != nil {
		t.Fatalf("expected cloudflare worker sender type to be accepted: %v", err)
	}
}

func TestValidateOptionUpdateRejectsUnknownEmailSenderType(t *testing.T) {
	if err := validateOptionUpdate("EmailSenderType", "mailgun"); err == nil {
		t.Fatal("expected unknown email sender type to be rejected")
	}
}
