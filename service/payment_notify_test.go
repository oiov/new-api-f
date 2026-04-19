package service

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBuildPaymentSuccessMarkdownIncludesRemarkWithoutChangingCoreFields(t *testing.T) {
	markdown := buildPaymentSuccessMarkdown(PaymentSuccessNotification{
		Category:      "套餐购买",
		TradeNo:       "TEST-123",
		UserID:        42,
		PaymentMethod: "alipay",
		Money:         19.9,
		Quota:         "专业版",
		CompletedAt:   1710000000,
	}, "5435", "仅内部对账使用")

	require.Contains(t, markdown, "# 支付成功")
	require.Contains(t, markdown, "- 类型：套餐购买")
	require.Contains(t, markdown, "- 用户 ID：42")
	require.Contains(t, markdown, "- 订单号：`TEST-123`")
	require.Contains(t, markdown, "- 支付方式：alipay")
	require.Contains(t, markdown, "- 支付金额：19.90")
	require.Contains(t, markdown, "- 套餐：专业版")
	require.Contains(t, markdown, "- 备注：仅内部对账使用")
	require.Contains(t, markdown, "> 推送 UID: 5435")
}

func TestSplitNotifySecretValuesSupportsSingleAndMultiValues(t *testing.T) {
	require.Equal(t, []string{"single-key"}, splitNotifySecretValues(" single-key "))
	require.Equal(t, []string{"key-a", "key-b", "key-c"}, splitNotifySecretValues(strings.Join([]string{
		" key-a ",
		"key-b,key-a",
		"key-c；",
	}, "\n")))
}
