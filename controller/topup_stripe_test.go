package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/form"
	"github.com/stripe/stripe-go/v81/webhook"
	"gorm.io/gorm"
)

type captureStripeBackend struct {
	method    string
	path      string
	key       string
	values    url.Values
	lineItems []*stripe.LineItem
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
	b.method = method
	b.path = path
	b.key = key
	if body != nil {
		parsed, err := url.ParseQuery(body.Encode())
		if err != nil {
			return err
		}
		b.values = parsed
	}
	lineItemList, ok := v.(*stripe.LineItemList)
	if ok {
		lineItemList.Data = b.lineItems
		lineItemList.ListMeta = stripe.ListMeta{HasMore: false}
		return nil
	}
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

func TestValidateStripeTopUpSessionAcceptsPaidConfiguredPriceEvenWhenRuntimePriceIdChanged(t *testing.T) {
	oldBackend := stripe.GetBackend(stripe.APIBackend)
	oldKey := stripe.Key
	oldSecret := setting.StripeApiSecret
	oldPriceID := setting.StripePriceId
	t.Cleanup(func() {
		stripe.SetBackend(stripe.APIBackend, oldBackend)
		stripe.Key = oldKey
		setting.StripeApiSecret = oldSecret
		setting.StripePriceId = oldPriceID
	})

	backend := &captureStripeBackend{
		lineItems: []*stripe.LineItem{
			{
				AmountSubtotal: 1000,
				AmountTotal:    1000,
				Quantity:       10,
				Price: &stripe.Price{
					ID:         "price_checkout_created_with",
					UnitAmount: 100,
				},
			},
		},
	}
	stripe.SetBackend(stripe.APIBackend, backend)
	setting.StripeApiSecret = "sk_test_123"
	setting.StripePriceId = "price_runtime_changed"

	topUp := &model.TopUp{
		Amount: 10,
	}

	err := validateStripeTopUpSession("cs_test_paid", topUp, 1000)
	if err != nil {
		t.Fatalf("validateStripeTopUpSession returned error: %v", err)
	}
	assertFormValue(t, backend.values, "limit", "2")
	assertFormValue(t, backend.values, "expand[0]", "data.price")

	if body, err := common.Marshal(backend.lineItems[0]); err != nil || !strings.Contains(string(body), "price_checkout_created_with") {
		t.Fatalf("test fixture should include the checkout price id, body=%s err=%v", string(body), err)
	}
}

func TestStripeWebhookReturnsServerErrorWhenCompletedSessionCannotBeProcessed(t *testing.T) {
	withStripeWebhookTestDB(t)
	if err := model.DB.Create(&model.TopUp{
		UserId:        1,
		Amount:        10,
		Money:         10,
		TradeNo:       "ref_pending_for_retry",
		PaymentMethod: PaymentMethodStripe,
		Status:        common.TopUpStatusPending,
		CreateTime:    time.Now().Unix(),
	}).Error; err != nil {
		t.Fatalf("create topup: %v", err)
	}

	backend := &captureStripeBackend{
		lineItems: []*stripe.LineItem{
			{
				AmountSubtotal: 1000,
				AmountTotal:    999,
				Quantity:       10,
				Price: &stripe.Price{
					ID:         "price_cny_unit_123",
					UnitAmount: 100,
				},
			},
		},
	}
	stripe.SetBackend(stripe.APIBackend, backend)
	setting.StripeApiSecret = "sk_test_123"
	setting.StripeWebhookSecret = "whsec_test_123"

	recorder := postStripeWebhook(t, "ref_pending_for_retry", "cs_test_failed_processing", 1000)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("StripeWebhook status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
}

func TestStripeWebhookCompletedSessionRechargesPendingTopUp(t *testing.T) {
	db := withStripeWebhookTestDB(t)
	if err := model.DB.Create(&model.User{
		Id:       7,
		Username: "stripe-user",
		Password: "hashed-password",
		Quota:    20,
		Group:    "default",
	}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := model.DB.Create(&model.TopUp{
		UserId:        7,
		Amount:        10,
		Money:         10,
		TradeNo:       "ref_success_recharge",
		PaymentMethod: PaymentMethodStripe,
		Status:        common.TopUpStatusPending,
		CreateTime:    time.Now().Unix(),
	}).Error; err != nil {
		t.Fatalf("create topup: %v", err)
	}

	backend := &captureStripeBackend{
		lineItems: []*stripe.LineItem{
			{
				AmountSubtotal: 1000,
				AmountTotal:    1000,
				Quantity:       10,
				Price: &stripe.Price{
					ID:         "price_cny_unit_123",
					UnitAmount: 100,
				},
			},
		},
	}
	stripe.SetBackend(stripe.APIBackend, backend)
	setting.StripeApiSecret = "sk_test_123"
	setting.StripeWebhookSecret = "whsec_test_123"

	recorder := postStripeWebhook(t, "ref_success_recharge", "cs_test_success", 1000)
	if recorder.Code != http.StatusOK {
		t.Fatalf("StripeWebhook status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var topUp model.TopUp
	if err := db.Where("trade_no = ?", "ref_success_recharge").First(&topUp).Error; err != nil {
		t.Fatalf("load topup: %v", err)
	}
	if topUp.Status != common.TopUpStatusSuccess {
		t.Fatalf("topup status = %q, want %q", topUp.Status, common.TopUpStatusSuccess)
	}
	if topUp.CompleteTime == 0 {
		t.Fatalf("topup complete_time should be set")
	}

	var user model.User
	if err := db.First(&user, 7).Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	wantQuota := 20 + int(10*common.QuotaPerUnit)
	if user.Quota != wantQuota {
		t.Fatalf("user quota = %d, want %d", user.Quota, wantQuota)
	}
	if user.StripeCustomer != "cus_test" {
		t.Fatalf("stripe customer = %q, want cus_test", user.StripeCustomer)
	}
}

func withStripeWebhookTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	oldBackend := stripe.GetBackend(stripe.APIBackend)
	oldKey := stripe.Key
	oldSecret := setting.StripeApiSecret
	oldWebhookSecret := setting.StripeWebhookSecret
	oldDB := model.DB
	oldLogDB := model.LOG_DB
	oldRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		stripe.SetBackend(stripe.APIBackend, oldBackend)
		stripe.Key = oldKey
		setting.StripeApiSecret = oldSecret
		setting.StripeWebhookSecret = oldWebhookSecret
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		common.RedisEnabled = oldRedisEnabled
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.SubscriptionOrder{}, &model.Log{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	return db
}

func postStripeWebhook(t *testing.T, referenceID string, sessionID string, amountTotal int64) *httptest.ResponseRecorder {
	t.Helper()
	payload := []byte(fmt.Sprintf(`{
		"id": "evt_test_webhook",
		"type": "checkout.session.completed",
		"data": {
			"object": {
				"id": %q,
				"object": "checkout.session",
				"status": "complete",
				"client_reference_id": %q,
				"customer": "cus_test",
				"amount_total": %d,
				"currency": "cny"
			}
		}
	}`, sessionID, referenceID, amountTotal))
	signedPayload := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload:   payload,
		Secret:    setting.StripeWebhookSecret,
		Timestamp: time.Now(),
	})

	router := gin.New()
	router.POST("/api/stripe/webhook", StripeWebhook)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/stripe/webhook", bytes.NewReader(payload))
	request.Header.Set("Stripe-Signature", signedPayload.Header)
	router.ServeHTTP(recorder, request)
	return recorder
}

func assertFormValue(t *testing.T, values url.Values, key string, want string) {
	t.Helper()
	if got := values.Get(key); got != want {
		t.Fatalf("%s = %q, want %q", key, got, want)
	}
}
