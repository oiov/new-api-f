package service

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/payment_notify_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	paymentSuccessPushTitle   = "支付成功通知"
	paymentSuccessPushTimeout = 10 * time.Second
	pushPlusSendURL           = "https://www.pushplus.plus/send"
)

type PaymentSuccessNotification struct {
	Category      string
	TradeNo       string
	UserID        int
	PaymentMethod string
	Money         float64
	Quota         string
}

func NotifyPaymentSuccessAsync(notification PaymentSuccessNotification) {
	gopool.Go(func() {
		if err := NotifyPaymentSuccess(notification); err != nil {
			common.SysError(fmt.Sprintf("payment success push failed (trade_no=%s): %v", notification.TradeNo, err))
		}
	})
}

func NotifyPaymentSuccess(notification PaymentSuccessNotification) error {
	return NotifyPaymentSuccessWithSetting(payment_notify_setting.GetPaymentNotifySetting(), notification)
}

func NotifyPaymentSuccessWithSetting(cfg *payment_notify_setting.PaymentNotifySetting, notification PaymentSuccessNotification) error {
	if cfg == nil || !shouldNotifyByCategory(cfg, notification.Category) {
		return nil
	}
	if strings.TrimSpace(notification.TradeNo) == "" {
		return fmt.Errorf("trade no is empty")
	}

	var errs []string
	if cfg.ServerChanEnabled {
		if err := notifyServerChanPaymentSuccess(cfg, notification); err != nil {
			errs = append(errs, "serverchan: "+err.Error())
		}
	}
	if cfg.PushPlusEnabled {
		if err := notifyPushPlusPaymentSuccess(cfg, notification); err != nil {
			errs = append(errs, "pushplus: "+err.Error())
		}
	}
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

func shouldNotifyByCategory(cfg *payment_notify_setting.PaymentNotifySetting, category string) bool {
	if cfg == nil {
		return false
	}
	switch strings.TrimSpace(category) {
	case "套餐购买":
		return cfg.SubscriptionEnabled
	default:
		return cfg.TopUpEnabled
	}
}

func postJSONWithNotifyTransport(targetURL string, payload []byte) (*http.Response, error) {
	if system_setting.EnableWorker() {
		workerReq := &WorkerRequest{
			URL:    targetURL,
			Key:    system_setting.WorkerValidKey,
			Method: http.MethodPost,
			Headers: map[string]string{
				"Content-Type": "application/json",
				"User-Agent":   "new-api-payment-success-notify/1.0",
			},
			Body: payload,
		}
		return DoWorkerRequest(workerReq)
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(targetURL, fetchSetting.EnableSSRFProtection, fetchSetting.AllowPrivateIp, fetchSetting.DomainFilterMode, fetchSetting.IpFilterMode, fetchSetting.DomainList, fetchSetting.IpList, fetchSetting.AllowedPorts, fetchSetting.ApplyIPFilterForDomain); err != nil {
		return nil, fmt.Errorf("request reject: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, targetURL, bytes.NewBuffer(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "new-api-payment-success-notify/1.0")

	client := GetHttpClient()
	if client == nil {
		client = &http.Client{Timeout: paymentSuccessPushTimeout}
	} else if paymentSuccessPushTimeout > 0 {
		cloned := *client
		cloned.Timeout = paymentSuccessPushTimeout
		client = &cloned
	}
	return client.Do(req)
}

func notifyServerChanPaymentSuccess(cfg *payment_notify_setting.PaymentNotifySetting, notification PaymentSuccessNotification) error {
	sendKey := strings.TrimSpace(cfg.ServerChanSendKey)
	uid := strings.TrimSpace(cfg.ServerChanUID)
	if sendKey == "" || uid == "" {
		return fmt.Errorf("missing serverchan uid or send key")
	}

	body := map[string]string{
		"title": paymentSuccessPushTitle,
		"desp":  buildPaymentSuccessMarkdown(notification, uid),
	}
	payload, err := common.Marshal(body)
	if err != nil {
		return err
	}

	sendURL := fmt.Sprintf("https://%s.push.ft07.com/send/%s.send", uid, sendKey)
	resp, err := postJSONWithNotifyTransport(sendURL, payload)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	return nil
}

type pushPlusSendResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func notifyPushPlusPaymentSuccess(cfg *payment_notify_setting.PaymentNotifySetting, notification PaymentSuccessNotification) error {
	token := strings.TrimSpace(cfg.PushPlusToken)
	if token == "" {
		return fmt.Errorf("missing pushplus token")
	}

	body := map[string]string{
		"token":    token,
		"title":    paymentSuccessPushTitle,
		"content":  buildPaymentSuccessMarkdown(notification, strings.TrimSpace(cfg.ServerChanUID)),
		"template": "markdown",
	}
	payload, err := common.Marshal(body)
	if err != nil {
		return err
	}

	resp, err := postJSONWithNotifyTransport(pushPlusSendURL, payload)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var pushResp pushPlusSendResponse
	if err := common.Unmarshal(respBody, &pushResp); err != nil {
		return err
	}
	if pushResp.Code != 200 {
		return fmt.Errorf("code=%d msg=%s", pushResp.Code, strings.TrimSpace(pushResp.Msg))
	}

	return nil
}

func buildPaymentSuccessMarkdown(notification PaymentSuccessNotification, uid string) string {
	category := strings.TrimSpace(notification.Category)
	if category == "" {
		category = "支付"
	}

	lines := []string{
		"# 支付成功",
		"",
		fmt.Sprintf("- 类型：%s", category),
		fmt.Sprintf("- 用户 ID：%d", notification.UserID),
		fmt.Sprintf("- 订单号：`%s`", notification.TradeNo),
		fmt.Sprintf("- 支付方式：%s", fallbackText(notification.PaymentMethod)),
		fmt.Sprintf("- 支付金额：%.2f", notification.Money),
	}
	if quota := strings.TrimSpace(notification.Quota); quota != "" {
		lines = append(lines, fmt.Sprintf("- 充值额度：%s", quota))
	}
	if uid = strings.TrimSpace(uid); uid != "" {
		lines = append(lines, "", fmt.Sprintf("> 推送 UID: %s", uid))
	}
	return strings.Join(lines, "\n")
}

func fallbackText(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "未知"
	}
	return trimmed
}
