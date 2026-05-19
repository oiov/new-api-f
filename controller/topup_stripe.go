package controller

import (
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"
	"github.com/thanhpk/randstr"
)

const PaymentMethodStripe = model.PaymentMethodStripe

var stripeAdaptor = &StripeAdaptor{}

// StripePayRequest represents a payment request for Stripe checkout.
type StripePayRequest struct {
	// Amount is the quantity of units to purchase.
	Amount int64 `json:"amount"`
	// PaymentMethod specifies the payment method (e.g., "stripe").
	PaymentMethod string `json:"payment_method"`
	// SuccessURL is the optional custom URL to redirect after successful payment.
	// If empty, defaults to the server's console log page.
	SuccessURL string `json:"success_url,omitempty"`
	// CancelURL is the optional custom URL to redirect when payment is canceled.
	// If empty, defaults to the server's console topup page.
	CancelURL string `json:"cancel_url,omitempty"`
}

type StripeAdaptor struct {
}

func (*StripeAdaptor) RequestAmount(c *gin.Context, req *StripePayRequest) {
	if req.Amount < getStripeMinTopup() {
		c.JSON(200, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getStripeMinTopup())})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getStripePayMoney(float64(req.Amount), group)
	if payMoney <= 0.01 {
		c.JSON(200, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(200, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func (*StripeAdaptor) RequestPay(c *gin.Context, req *StripePayRequest) {
	if !setting.IsStripeTopUpEnabled() {
		c.JSON(200, gin.H{"message": "error", "data": "Stripe 支付未正确配置"})
		return
	}

	if req.PaymentMethod != model.PaymentMethodStripe {
		c.JSON(200, gin.H{"message": "error", "data": "不支持的支付渠道"})
		return
	}
	if req.Amount < getStripeMinTopup() {
		c.JSON(200, gin.H{"message": fmt.Sprintf("充值数量不能小于 %d", getStripeMinTopup()), "data": 10})
		return
	}
	if req.Amount > 10000 {
		c.JSON(200, gin.H{"message": "充值数量不能大于 10000", "data": 10})
		return
	}

	if req.SuccessURL != "" && common.ValidateRedirectURL(req.SuccessURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付成功重定向URL不在可信任域名列表中", "data": ""})
		return
	}

	if req.CancelURL != "" && common.ValidateRedirectURL(req.CancelURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付取消重定向URL不在可信任域名列表中", "data": ""})
		return
	}

	id := c.GetInt("id")
	user, _ := model.GetUserById(id, false)
	chargedMoney := GetChargedAmount(float64(req.Amount), *user)

	reference := fmt.Sprintf("new-api-ref-%d-%d-%s", user.Id, time.Now().UnixMilli(), randstr.String(4))
	referenceId := "ref_" + common.Sha1([]byte(reference))

	payLink, err := genStripeLink(referenceId, user.StripeCustomer, user.Email, req.Amount, req.SuccessURL, req.CancelURL)
	if err != nil && isStripeMissingCustomerError(err) && user.StripeCustomer != "" {
		log.Printf("Stripe customer %s 不存在，已清空用户 %d 的绑定并重试", user.StripeCustomer, user.Id)
		_ = model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("stripe_customer", "").Error
		payLink, err = genStripeLink(referenceId, "", user.Email, req.Amount, req.SuccessURL, req.CancelURL)
	}
	if err != nil {
		log.Println("获取Stripe Checkout支付链接失败", err)
		c.JSON(200, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	topUp := &model.TopUp{
		UserId:          id,
		Amount:          req.Amount,
		Money:           chargedMoney,
		TradeNo:         referenceId,
		PaymentMethod:   model.PaymentMethodStripe,
		PaymentProvider: model.PaymentProviderStripe,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	c.JSON(200, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_link": payLink,
		},
	})
}

func RequestStripeAmount(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	stripeAdaptor.RequestAmount(c, &req)
}

func RequestStripePay(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	stripeAdaptor.RequestPay(c, &req)
}

func StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Printf("解析Stripe Webhook参数失败: %v\n", err)
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	endpointSecret := setting.StripeWebhookSecret
	event, err := webhook.ConstructEventWithOptions(payload, signature, endpointSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})

	if err != nil {
		log.Printf("Stripe Webhook验签失败: %v\n", err)
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	statusCode := http.StatusOK
	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted:
		if err := sessionCompleted(event); err != nil {
			statusCode = http.StatusInternalServerError
		}
	case stripe.EventTypeCheckoutSessionExpired:
		if err := sessionExpired(event); err != nil {
			statusCode = http.StatusInternalServerError
		}
	default:
		log.Printf("不支持的Stripe Webhook事件类型: %s\n", event.Type)
	}

	c.Status(statusCode)
}

func sessionCompleted(event stripe.Event) error {
	customerId := event.GetObjectValue("customer")
	referenceId := event.GetObjectValue("client_reference_id")
	sessionId := event.GetObjectValue("id")
	status := event.GetObjectValue("status")
	if "complete" != status {
		log.Println("错误的Stripe Checkout完成状态:", status, ",", referenceId)
		return fmt.Errorf("错误的Stripe Checkout完成状态: %s", status)
	}

	// Try complete subscription order first
	LockOrder(referenceId)
	defer UnlockOrder(referenceId)
	payload := map[string]any{
		"customer":     customerId,
		"amount_total": event.GetObjectValue("amount_total"),
		"currency":     strings.ToUpper(event.GetObjectValue("currency")),
		"event_type":   string(event.Type),
	}
	if completedNow, err := model.CompleteSubscriptionOrderWithResult(referenceId, common.GetJsonString(payload)); err == nil {
		if completedNow {
			notifySubscriptionPaymentSuccessAsync(referenceId)
		}
		return nil
	} else if err != nil && !errors.Is(err, model.ErrSubscriptionOrderNotFound) {
		log.Println("complete subscription order failed:", err.Error(), referenceId)
		return err
	}

	topUp := model.GetTopUpByTradeNo(referenceId)
	if topUp == nil {
		log.Println("Stripe充值订单不存在", referenceId)
		return fmt.Errorf("Stripe充值订单不存在: %s", referenceId)
	}
	paidTotal, err := strconv.ParseInt(event.GetObjectValue("amount_total"), 10, 64)
	if err != nil {
		log.Printf("Stripe支付金额解析失败: %v, order=%s", err, referenceId)
		return err
	}
	if err := validateStripeTopUpSession(sessionId, topUp, paidTotal); err != nil {
		log.Printf("Stripe充值会话校验失败: %v, order=%s, session=%s", err, referenceId, sessionId)
		return err
	}

	completed, err := model.Recharge(referenceId, customerId)
	if err != nil {
		log.Println(err.Error(), referenceId)
		return err
	}
	if completed {
		service.NotifyPaymentSuccessAsync(service.PaymentSuccessNotification{
			Category:      "充值",
			TradeNo:       topUp.TradeNo,
			UserID:        topUp.UserId,
			PaymentMethod: topUp.PaymentMethod,
			Money:         topUp.Money,
			Quota:         logger.FormatQuota(int(topUp.Money * common.QuotaPerUnit)),
			CompletedAt:   topUp.CompleteTime,
		})
		model.NotifyTopUpSuccessToUserAsync(
			topUp.UserId,
			topUp.PaymentMethod,
			topUp.Money,
			logger.FormatQuota(int(topUp.Money*common.QuotaPerUnit)),
		)
	}

	total, _ := strconv.ParseFloat(event.GetObjectValue("amount_total"), 64)
	currency := strings.ToUpper(event.GetObjectValue("currency"))
	log.Printf("收到款项：%s, %.2f(%s)", referenceId, total/100, currency)
	return nil
}

func validateStripeTopUpSession(sessionId string, topUp *model.TopUp, paidTotal int64) error {
	if topUp == nil {
		return errors.New("充值订单不存在")
	}
	if sessionId == "" {
		return errors.New("缺少 Stripe session id")
	}
	if paidTotal <= 0 {
		return fmt.Errorf("无效的 Stripe 支付金额: %d", paidTotal)
	}
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return errors.New("无效的 Stripe API 密钥")
	}

	stripe.Key = setting.StripeApiSecret
	params := &stripe.CheckoutSessionListLineItemsParams{
		Session: stripe.String(sessionId),
	}
	params.Limit = stripe.Int64(2)
	params.AddExpand("data.price")

	iter := session.ListLineItems(params)
	lineItems := make([]*stripe.LineItem, 0, 2)
	for iter.Next() {
		lineItems = append(lineItems, iter.LineItem())
	}
	if err := iter.Err(); err != nil {
		return fmt.Errorf("获取 Stripe line items 失败: %w", err)
	}
	if len(lineItems) != 1 {
		return fmt.Errorf("Stripe line items 数量异常: %d", len(lineItems))
	}

	lineItem := lineItems[0]
	if lineItem.Price == nil {
		return errors.New("Stripe line item 缺少价格信息")
	}
	if lineItem.AmountTotal != paidTotal {
		return fmt.Errorf("Stripe 实付金额不匹配: expected=%d actual=%d", lineItem.AmountTotal, paidTotal)
	}

	if lineItem.Quantity != topUp.Amount {
		if lineItem.Quantity != 1 {
			return fmt.Errorf("Stripe 购买数量不匹配: expected=%d or 1 actual=%d", topUp.Amount, lineItem.Quantity)
		}
		group, err := model.GetUserGroup(topUp.UserId, true)
		if err != nil {
			return fmt.Errorf("获取用户分组失败: %w", err)
		}
		expectedTotal := stripeAmountCents(getStripePayMoney(float64(topUp.Amount), group))
		if paidTotal != expectedTotal {
			return fmt.Errorf("Stripe 折扣金额不匹配: expected=%d actual=%d", expectedTotal, paidTotal)
		}
		return nil
	}
	expectedSubtotal := lineItem.Price.UnitAmount * lineItem.Quantity
	if lineItem.AmountSubtotal != expectedSubtotal {
		return fmt.Errorf("Stripe 小计异常: expected=%d actual=%d", expectedSubtotal, lineItem.AmountSubtotal)
	}

	return nil
}

func sessionExpired(event stripe.Event) error {
	referenceId := event.GetObjectValue("client_reference_id")
	status := event.GetObjectValue("status")
	if "expired" != status {
		log.Println("错误的Stripe Checkout过期状态:", status, ",", referenceId)
		return fmt.Errorf("错误的Stripe Checkout过期状态: %s", status)
	}

	if len(referenceId) == 0 {
		log.Println("未提供支付单号")
		return errors.New("未提供支付单号")
	}

	// Subscription order expiration
	LockOrder(referenceId)
	defer UnlockOrder(referenceId)
	if err := model.ExpireSubscriptionOrder(referenceId); err == nil {
		return nil
	} else if err != nil && !errors.Is(err, model.ErrSubscriptionOrderNotFound) {
		log.Println("过期订阅订单失败", referenceId, ", err:", err.Error())
		return err
	}

	topUp := model.GetTopUpByTradeNo(referenceId)
	if topUp == nil {
		log.Println("充值订单不存在", referenceId)
		return fmt.Errorf("充值订单不存在: %s", referenceId)
	}

	if err := model.UpdatePendingTopUpStatus(referenceId, model.PaymentProviderStripe, common.TopUpStatusExpired); err != nil {
		log.Println("过期充值订单失败", referenceId, ", err:", err.Error())
		return err
	}

	log.Println("充值订单已过期", referenceId)
	return nil
}

// genStripeLink generates a Stripe Checkout session URL for payment.
// It creates a new checkout session with the specified parameters and returns the payment URL.
//
// Parameters:
//   - referenceId: unique reference identifier for the transaction
//   - customerId: existing Stripe customer ID (empty string if new customer)
//   - email: customer email address for new customer creation
//   - amount: quantity of units to purchase
//   - successURL: custom URL to redirect after successful payment (empty for default)
//   - cancelURL: custom URL to redirect when payment is canceled (empty for default)
//
// Returns the checkout session URL or an error if the session creation fails.
func genStripeLink(referenceId string, customerId string, email string, amount int64, successURL string, cancelURL string) (string, error) {
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return "", fmt.Errorf("无效的Stripe API密钥")
	}
	if !strings.HasPrefix(setting.StripePriceId, "price_") {
		return "", fmt.Errorf("无效的Stripe价格ID")
	}

	stripe.Key = setting.StripeApiSecret

	// Use custom URLs if provided, otherwise use defaults
	if successURL == "" {
		successURL = system_setting.ServerAddress + "/console/log"
	}
	if cancelURL == "" {
		cancelURL = system_setting.ServerAddress + "/console/topup"
	}

	params := &stripe.CheckoutSessionParams{
		ClientReferenceID: stripe.String(referenceId),
		SuccessURL:        stripe.String(successURL),
		CancelURL:         stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(setting.StripePriceId),
				Quantity: stripe.Int64(amount),
			},
		},
		Mode:                stripe.String(string(stripe.CheckoutSessionModePayment)),
		AllowPromotionCodes: stripe.Bool(setting.StripePromotionCodesEnabled),
	}

	if "" == customerId {
		if "" != email {
			params.CustomerEmail = stripe.String(email)
		}

		params.CustomerCreation = stripe.String(string(stripe.CheckoutSessionCustomerCreationAlways))
	} else {
		params.Customer = stripe.String(customerId)
	}

	result, err := session.New(params)
	if err != nil {
		return "", err
	}

	return result.URL, nil
}

func stripeAmountCents(amount float64) int64 {
	return int64(math.Round(amount * 100))
}

func isStripeMissingCustomerError(err error) bool {
	stripeErr, ok := err.(*stripe.Error)
	return ok && stripeErr.Code == stripe.ErrorCodeResourceMissing && stripeErr.Param == "customer"
}

func GetChargedAmount(count float64, user model.User) float64 {
	topUpGroupRatio := common.GetTopupGroupRatio(user.Group)
	if topUpGroupRatio == 0 {
		topUpGroupRatio = 1
	}

	return count * topUpGroupRatio
}

func getStripePayMoney(amount float64, group string) float64 {
	originalAmount := amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = amount / common.QuotaPerUnit
	}
	// Using float64 for monetary calculations is acceptable here due to the small amounts involved
	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	// apply optional preset discount by the original request amount (if configured), default 1.0
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(originalAmount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}
	payMoney := amount * setting.StripeUnitPrice * topupGroupRatio * discount
	return payMoney
}

func getStripeMinTopup() int64 {
	minTopup := setting.StripeMinTopUp
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minTopup = minTopup * int(common.QuotaPerUnit)
	}
	return int64(minTopup)
}
