package payment_notify_setting

import "github.com/QuantumNous/new-api/setting/config"

type PaymentNotifySetting struct {
	Enabled           bool
	ServerChanEnabled bool
	ServerChanUID     string
	ServerChanSendKey string
	PushPlusEnabled   bool
	PushPlusToken     string
}

var paymentNotifySetting = PaymentNotifySetting{
	Enabled:           false,
	ServerChanEnabled: true,
	ServerChanUID:     "",
	ServerChanSendKey: "",
	PushPlusEnabled:   false,
	PushPlusToken:     "",
}

func init() {
	config.GlobalConfig.Register("payment_notify_setting", &paymentNotifySetting)
}

func GetPaymentNotifySetting() *PaymentNotifySetting {
	return &paymentNotifySetting
}
