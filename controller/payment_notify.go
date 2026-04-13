package controller

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/payment_notify_setting"
	"github.com/gin-gonic/gin"
)

type PaymentNotifyTestRequest struct {
	Enabled           *bool  `json:"enabled"`
	ServerChanEnabled *bool  `json:"server_chan_enabled"`
	ServerChanUID     string `json:"server_chan_uid"`
	ServerChanSendKey string `json:"server_chan_send_key"`
	PushPlusEnabled   *bool  `json:"push_plus_enabled"`
	PushPlusToken     string `json:"push_plus_token"`
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

	cfg := *current
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}
	if req.ServerChanEnabled != nil {
		cfg.ServerChanEnabled = *req.ServerChanEnabled
	}
	if req.PushPlusEnabled != nil {
		cfg.PushPlusEnabled = *req.PushPlusEnabled
	}
	if uid := strings.TrimSpace(req.ServerChanUID); uid != "" {
		cfg.ServerChanUID = uid
	}
	if sendKey := strings.TrimSpace(req.ServerChanSendKey); sendKey != "" {
		cfg.ServerChanSendKey = sendKey
	}
	if token := strings.TrimSpace(req.PushPlusToken); token != "" {
		cfg.PushPlusToken = token
	}

	if !cfg.Enabled {
		common.ApiErrorMsg(c, "请先启用充值成功推送")
		return
	}
	if !cfg.ServerChanEnabled && !cfg.PushPlusEnabled {
		common.ApiErrorMsg(c, "请至少启用一个推送通道")
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
