package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/payment_notify_setting"
	"github.com/stretchr/testify/require"
)

func TestBuildPaymentNotifySettingFromRequestKeepsExistingSecretsWhenInputsEmpty(t *testing.T) {
	current := &payment_notify_setting.PaymentNotifySetting{
		TopUpEnabled:        true,
		SubscriptionEnabled: true,
		ServerChanEnabled:   true,
		ServerChanUID:       "5435",
		ServerChanSendKey:   "old-send-key",
		PushPlusEnabled:     true,
		PushPlusToken:       "old-push-token",
		Remark:              "old remark",
	}

	cfg := buildPaymentNotifySettingFromRequest(PaymentNotifySaveRequest{
		TopUpEnabled:           true,
		SubscriptionEnabled:    true,
		ServerChanEnabled:      true,
		ServerChanUID:          "5435",
		ServerChanSendKey:      "",
		ClearServerChanSendKey: false,
		PushPlusEnabled:        true,
		PushPlusToken:          "",
		ClearPushPlusToken:     false,
		Remark:                 "new remark",
	}, current)

	require.Equal(t, "old-send-key", cfg.ServerChanSendKey)
	require.Equal(t, "old-push-token", cfg.PushPlusToken)
	require.Equal(t, "new remark", cfg.Remark)
}

func TestBuildPaymentNotifySettingFromRequestClearsSecretsWhenRequested(t *testing.T) {
	current := &payment_notify_setting.PaymentNotifySetting{
		ServerChanSendKey: "old-send-key",
		PushPlusToken:     "old-push-token",
	}

	cfg := buildPaymentNotifySettingFromRequest(PaymentNotifySaveRequest{
		ClearServerChanSendKey: true,
		ClearPushPlusToken:     true,
	}, current)

	require.Empty(t, cfg.ServerChanSendKey)
	require.Empty(t, cfg.PushPlusToken)
}
