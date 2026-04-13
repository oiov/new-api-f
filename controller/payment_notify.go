package controller

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/payment_notify_setting"
	"github.com/gin-gonic/gin"
)

type PaymentNotifySaveRequest struct {
	TopUpEnabled         bool   `json:"top_up_enabled"`
	SubscriptionEnabled  bool   `json:"subscription_enabled"`
	ServerChanEnabled    bool   `json:"server_chan_enabled"`
	ServerChanUID        string `json:"server_chan_uid"`
	ServerChanSendKey    string `json:"server_chan_send_key"`
	ClearServerChanSendKey bool `json:"clear_server_chan_send_key"`
	PushPlusEnabled      bool   `json:"push_plus_enabled"`
	PushPlusToken        string `json:"push_plus_token"`
	ClearPushPlusToken   bool   `json:"clear_push_plus_token"`
}

type PaymentNotifyTestRequest struct {
	TopUpEnabled          bool   `json:"top_up_enabled"`
	SubscriptionEnabled   bool   `json:"subscription_enabled"`
	ServerChanEnabled     bool   `json:"server_chan_enabled"`
	ServerChanUID         string `json:"server_chan_uid"`
	ServerChanSendKey     string `json:"server_chan_send_key"`
	ClearServerChanSendKey bool  `json:"clear_server_chan_send_key"`
	PushPlusEnabled       bool   `json:"push_plus_enabled"`
	PushPlusToken         string `json:"push_plus_token"`
	ClearPushPlusToken    bool   `json:"clear_push_plus_token"`
}

func buildPaymentNotifySettingFromRequest(req PaymentNotifySaveRequest, current *payment_notify_setting.PaymentNotifySetting) payment_notify_setting.PaymentNotifySetting {
	if current == nil {
		current = &payment_notify_setting.PaymentNotifySetting{}
	}
	cfg := *current
	cfg.TopUpEnabled = req.TopUpEnabled
	cfg.SubscriptionEnabled = req.SubscriptionEnabled
	cfg.ServerChanEnabled = req.ServerChanEnabled
	cfg.PushPlusEnabled = req.PushPlusEnabled
	cfg.ServerChanUID = strings.TrimSpace(req.ServerChanUID)
	if req.ClearServerChanSendKey {
		cfg.ServerChanSendKey = ""
	} else if sendKey := strings.TrimSpace(req.ServerChanSendKey); sendKey != "" {
		cfg.ServerChanSendKey = sendKey
	}
	if req.ClearPushPlusToken {
		cfg.PushPlusToken = ""
	} else if token := strings.TrimSpace(req.PushPlusToken); token != "" {
		cfg.PushPlusToken = token
	}
	return cfg
}

func validatePaymentNotifySetting(cfg *payment_notify_setting.PaymentNotifySetting) error {
	if cfg == nil {
		return nil
	}
	if !cfg.TopUpEnabled && !cfg.SubscriptionEnabled {
		return fmt.Errorf("请至少启用一种支付成功通知")
	}
	if !cfg.ServerChanEnabled && !cfg.PushPlusEnabled {
		return fmt.Errorf("请至少启用一个推送通道")
	}
	return nil
}

func buildPaymentNotifyOptionValues(cfg payment_notify_setting.PaymentNotifySetting) map[string]string {
	return map[string]string{
		"payment_notify_setting.TopUpEnabled":        common.Interface2String(cfg.TopUpEnabled),
		"payment_notify_setting.SubscriptionEnabled": common.Interface2String(cfg.SubscriptionEnabled),
		"payment_notify_setting.ServerChanEnabled":   common.Interface2String(cfg.ServerChanEnabled),
		"payment_notify_setting.ServerChanUID":       cfg.ServerChanUID,
		"payment_notify_setting.ServerChanSendKey":   cfg.ServerChanSendKey,
		"payment_notify_setting.PushPlusEnabled":     common.Interface2String(cfg.PushPlusEnabled),
		"payment_notify_setting.PushPlusToken":       cfg.PushPlusToken,
	}
}

func buildMaskedPaymentNotifyOptionValues(cfg payment_notify_setting.PaymentNotifySetting) map[string]string {
	values := buildPaymentNotifyOptionValues(cfg)
	for key, value := range values {
		switch key {
		case "payment_notify_setting.ServerChanSendKey", "payment_notify_setting.PushPlusToken":
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				values[key] = ""
			} else {
				values[key] = controllerMaskSensitiveOptionValue(trimmed)
			}
		}
	}
	return values
}

func controllerMaskSensitiveOptionValue(value string) string {
	runes := []rune(value)
	if len(runes) <= 8 {
		return "********"
	}
	return string(runes[:4]) + "****" + string(runes[len(runes)-4:])
}

func UpdatePaymentSuccessNotifySetting(c *gin.Context) {
	var req PaymentNotifySaveRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}

	current := payment_notify_setting.GetPaymentNotifySetting()
	cfg := buildPaymentNotifySettingFromRequest(req, current)
	if err := validatePaymentNotifySetting(&cfg); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	if err := model.BatchUpdateOptions(buildPaymentNotifyOptionValues(cfg)); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"message": "支付成功推送设置已更新",
		"data":    buildMaskedPaymentNotifyOptionValues(cfg),
	})
}

func TestPaymentSuccessNotify(c *gin.Context) {
	var req PaymentNotifyTestRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}

	current := payment_notify_setting.GetPaymentNotifySetting()
	if current == nil {
		common.ApiErrorMsg(c, "充值成功推送配置不可用")
		return
	}

	cfg := buildPaymentNotifySettingFromRequest(PaymentNotifySaveRequest(req), current)
	if err := validatePaymentNotifySetting(&cfg); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	notification := service.PaymentSuccessNotification{
		Category:      "充值测试",
		TradeNo:       "TEST-" + time.Now().Format("20060102150405"),
		UserID:        c.GetInt("id"),
		PaymentMethod: "test",
		Money:         0.01,
		Quota:         "测试额度",
	}
	if err := service.NotifyPaymentSuccessWithSetting(&cfg, notification); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	common.ApiSuccess(c, gin.H{
		"message": "测试发送成功",
	})
}
