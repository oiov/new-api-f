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
	CompletedAt   int64
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
	sendKeys := splitNotifySecretValues(cfg.ServerChanSendKey)
	uid := strings.TrimSpace(cfg.ServerChanUID)
	if len(sendKeys) == 0 || uid == "" {
		return fmt.Errorf("missing serverchan uid or send key")
	}

	body := map[string]string{
		"title": paymentSuccessPushTitle,
		"desp":  buildPaymentSuccessMarkdown(notification, uid, cfg.Remark),
	}
	payload, err := common.Marshal(body)
	if err != nil {
		return err
	}

	var errs []string
	for _, sendKey := range sendKeys {
		sendURL := fmt.Sprintf("https://%s.push.ft07.com/send/%s.send", uid, sendKey)
		resp, err := postJSONWithNotifyTransport(sendURL, payload)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", maskNotifySecretValue(sendKey), err))
			continue
		}

		func() {
			defer resp.Body.Close()
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
				errs = append(errs, fmt.Sprintf("%s: unexpected status %d: %s", maskNotifySecretValue(sendKey), resp.StatusCode, strings.TrimSpace(string(respBody))))
			}
		}()
	}

	if len(errs) > 0 {
		return fmt.Errorf("serverchan partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

type pushPlusSendResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func notifyPushPlusPaymentSuccess(cfg *payment_notify_setting.PaymentNotifySetting, notification PaymentSuccessNotification) error {
	tokens := splitNotifySecretValues(cfg.PushPlusToken)
	if len(tokens) == 0 {
		return fmt.Errorf("missing pushplus token")
	}

	content := buildPaymentSuccessMarkdown(notification, strings.TrimSpace(cfg.ServerChanUID), cfg.Remark)
	var errs []string
	for _, token := range tokens {
		body := map[string]string{
			"token":    token,
			"title":    paymentSuccessPushTitle,
			"content":  content,
			"template": "markdown",
		}
		payload, err := common.Marshal(body)
		if err != nil {
			return err
		}

		resp, err := postJSONWithNotifyTransport(pushPlusSendURL, payload)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", maskNotifySecretValue(token), err))
			continue
		}

		func() {
			defer resp.Body.Close()
			respBody, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
			if err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", maskNotifySecretValue(token), err))
				return
			}
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				errs = append(errs, fmt.Sprintf("%s: unexpected status %d: %s", maskNotifySecretValue(token), resp.StatusCode, strings.TrimSpace(string(respBody))))
				return
			}

			var pushResp pushPlusSendResponse
			if err := common.Unmarshal(respBody, &pushResp); err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", maskNotifySecretValue(token), err))
				return
			}
			if pushResp.Code != 200 {
				errs = append(errs, fmt.Sprintf("%s: code=%d msg=%s", maskNotifySecretValue(token), pushResp.Code, strings.TrimSpace(pushResp.Msg)))
			}
		}()
	}

	if len(errs) > 0 {
		return fmt.Errorf("pushplus partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

func splitNotifySecretValues(raw string) []string {
	parts := strings.FieldsFunc(strings.ReplaceAll(raw, "\r", "\n"), func(r rune) bool {
		switch r {
		case '\n', ',', ';', '，', '；':
			return true
		default:
			return false
		}
	})

	values := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		values = append(values, trimmed)
	}
	return values
}

func maskNotifySecretValue(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= 8 {
		return "********"
	}
	return string(runes[:4]) + "****" + string(runes[len(runes)-4:])
}

func buildPaymentSuccessMarkdown(notification PaymentSuccessNotification, uid string, remark string) string {
	category := strings.TrimSpace(notification.Category)
	if category == "" {
		category = "支付"
	}
	completedAt := notification.CompletedAt
	if completedAt <= 0 {
		completedAt = common.GetTimestamp()
	}

	lines := []string{
		"# 支付成功",
		"",
		"系统已完成本地订单处理。",
		"",
		fmt.Sprintf("- 类型：%s", category),
		fmt.Sprintf("- 处理结果：%s", "success"),
		fmt.Sprintf("- 用户 ID：%d", notification.UserID),
		fmt.Sprintf("- 订单号：`%s`", notification.TradeNo),
		fmt.Sprintf("- 支付方式：%s", fallbackText(notification.PaymentMethod)),
		fmt.Sprintf("- 支付金额：%.2f", notification.Money),
		fmt.Sprintf("- 完成时间：%s", time.Unix(completedAt, 0).In(time.Local).Format("2006-01-02 15:04:05 MST")),
	}
	if quota := strings.TrimSpace(notification.Quota); quota != "" {
		label := "充值额度"
		if category == "套餐购买" {
			label = "套餐"
		}
		lines = append(lines, fmt.Sprintf("- %s：%s", label, quota))
	}
	if remark = strings.TrimSpace(remark); remark != "" {
		lines = append(lines, fmt.Sprintf("- 备注：%s", remark))
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
