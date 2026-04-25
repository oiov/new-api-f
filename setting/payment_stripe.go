package setting

import "strings"

var StripeApiSecret = ""
var StripeWebhookSecret = ""
var StripePriceId = ""
var StripeUnitPrice = 8.0
var StripeMinTopUp = 1
var StripePromotionCodesEnabled = false

func IsStripeTopUpEnabled() bool {
	apiSecret := strings.TrimSpace(StripeApiSecret)
	webhookSecret := strings.TrimSpace(StripeWebhookSecret)
	priceId := strings.TrimSpace(StripePriceId)
	return (strings.HasPrefix(apiSecret, "sk_") || strings.HasPrefix(apiSecret, "rk_")) &&
		strings.HasPrefix(webhookSecret, "whsec_") &&
		strings.HasPrefix(priceId, "price_")
}
