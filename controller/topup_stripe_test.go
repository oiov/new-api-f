package controller

import (
	"bytes"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/form"
)

type captureStripeBackend struct {
	method string
	path   string
	key    string
	values url.Values
}

func (b *captureStripeBackend) Call(method, path, key string, params stripe.ParamsContainer, v stripe.LastResponseSetter) error {
	values := &form.Values{}
	form.AppendTo(values, params)
	parsed, err := url.ParseQuery(values.Encode())
	if err != nil {
		return err
	}
	b.method = method
	b.path = path
	b.key = key
	b.values = parsed

	session, ok := v.(*stripe.CheckoutSession)
	if ok {
		session.URL = "https://checkout.stripe.test/session"
	}
	return nil
}

func (b *captureStripeBackend) CallStreaming(method, path, key string, params stripe.ParamsContainer, v stripe.StreamingLastResponseSetter) error {
	return nil
}

func (b *captureStripeBackend) CallRaw(method, path, key string, body *form.Values, params *stripe.Params, v stripe.LastResponseSetter) error {
	return nil
}

func (b *captureStripeBackend) CallMultipart(method, path, key, boundary string, body *bytes.Buffer, params *stripe.Params, v stripe.LastResponseSetter) error {
	return nil
}

func (b *captureStripeBackend) SetMaxNetworkRetries(maxNetworkRetries int64) {}

func TestStripeAmountCentsRoundsToMinorUnits(t *testing.T) {
	cases := []struct {
		name   string
		amount float64
		want   int64
	}{
		{name: "whole dollars", amount: 10, want: 1000},
		{name: "discounted cents", amount: 8.5, want: 850},
		{name: "rounding", amount: 1.235, want: 124},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripeAmountCents(tc.amount); got != tc.want {
				t.Fatalf("stripeAmountCents(%v) = %d, want %d", tc.amount, got, tc.want)
			}
		})
	}
}

func TestGenStripeLinkUsesConfiguredPriceWithRequestedQuantity(t *testing.T) {
	oldBackend := stripe.GetBackend(stripe.APIBackend)
	oldKey := stripe.Key
	oldSecret := setting.StripeApiSecret
	oldPriceID := setting.StripePriceId
	oldPromotionCodesEnabled := setting.StripePromotionCodesEnabled
	oldServerAddress := system_setting.ServerAddress
	t.Cleanup(func() {
		stripe.SetBackend(stripe.APIBackend, oldBackend)
		stripe.Key = oldKey
		setting.StripeApiSecret = oldSecret
		setting.StripePriceId = oldPriceID
		setting.StripePromotionCodesEnabled = oldPromotionCodesEnabled
		system_setting.ServerAddress = oldServerAddress
	})

	backend := &captureStripeBackend{}
	stripe.SetBackend(stripe.APIBackend, backend)
	setting.StripeApiSecret = "sk_test_123"
	setting.StripePriceId = "price_cny_unit_123"
	setting.StripePromotionCodesEnabled = true
	system_setting.ServerAddress = "https://example.com"

	payLink, err := genStripeLink("ref_123", "", "buyer@example.com", 10, "", "")
	if err != nil {
		t.Fatalf("genStripeLink returned error: %v", err)
	}
	if payLink != "https://checkout.stripe.test/session" {
		t.Fatalf("payLink = %q, want mocked checkout url", payLink)
	}
	if backend.method != "POST" || backend.path != "/v1/checkout/sessions" {
		t.Fatalf("unexpected Stripe call %s %s", backend.method, backend.path)
	}
	if backend.key != "sk_test_123" {
		t.Fatalf("Stripe key = %q, want sk_test_123", backend.key)
	}

	assertFormValue(t, backend.values, "line_items[0][price]", "price_cny_unit_123")
	assertFormValue(t, backend.values, "line_items[0][quantity]", "10")
	assertFormValue(t, backend.values, "mode", "payment")
	assertFormValue(t, backend.values, "allow_promotion_codes", "true")
	assertFormValue(t, backend.values, "client_reference_id", "ref_123")
	assertFormValue(t, backend.values, "customer_email", "buyer@example.com")
	assertFormValue(t, backend.values, "success_url", "https://example.com/console/log")
	assertFormValue(t, backend.values, "cancel_url", "https://example.com/console/topup")

	for key := range backend.values {
		if strings.HasPrefix(key, "line_items[0][price_data]") {
			t.Fatalf("unexpected dynamic price_data parameter %q=%q", key, backend.values.Get(key))
		}
	}
}

func assertFormValue(t *testing.T, values url.Values, key string, want string) {
	t.Helper()
	if got := values.Get(key); got != want {
		t.Fatalf("%s = %q, want %q", key, got, want)
	}
}
