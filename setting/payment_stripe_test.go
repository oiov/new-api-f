package setting

import "testing"

func TestIsStripeTopUpEnabledRequiresValidPriceId(t *testing.T) {
	oldApiSecret := StripeApiSecret
	oldWebhookSecret := StripeWebhookSecret
	oldPriceId := StripePriceId
	t.Cleanup(func() {
		StripeApiSecret = oldApiSecret
		StripeWebhookSecret = oldWebhookSecret
		StripePriceId = oldPriceId
	})

	StripeApiSecret = "sk_test_123"
	StripeWebhookSecret = "whsec_123"
	StripePriceId = "<nil>"

	if IsStripeTopUpEnabled() {
		t.Fatal("expected Stripe top-up to be disabled for invalid price id")
	}

	StripePriceId = "price_123"
	if !IsStripeTopUpEnabled() {
		t.Fatal("expected Stripe top-up to be enabled for valid Stripe settings")
	}
}
