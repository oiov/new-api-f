package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
)

func notifySubscriptionPaymentSuccessAsync(tradeNo string) {
	order := model.GetSubscriptionOrderByTradeNo(strings.TrimSpace(tradeNo))
	if order == nil {
		return
	}
	service.NotifyPaymentSuccessAsync(service.PaymentSuccessNotification{
		Category:      "套餐购买",
		TradeNo:       order.TradeNo,
		UserID:        order.UserId,
		PaymentMethod: order.PaymentMethod,
		Money:         order.Money,
		Quota:         strings.TrimSpace(order.PlanTitle),
		CompletedAt:   order.CompleteTime,
	})
}
