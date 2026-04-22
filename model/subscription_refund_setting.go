package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const subscriptionRefundSettingsOptionKey = "SubscriptionRefundSettings"

const (
	SubscriptionRefundSettlementModeDurationRatio = "duration_ratio"
	SubscriptionRefundSettlementModeTokenUsage    = "token_usage"

	SubscriptionRefundTargetBalance         = "balance"
	SubscriptionRefundTargetOriginalPayment = "original_payment"
)

type SubscriptionRefundSettings struct {
	PageEnabled                    bool    `json:"page_enabled"`
	Enabled                        bool    `json:"enabled"`
	AllowBalanceRefund             bool    `json:"allow_balance_refund"`
	AllowOriginalPaymentRefund     bool    `json:"allow_original_payment_refund"`
	SettlementMode                 string  `json:"settlement_mode"`
	Currency                       string  `json:"currency"`
	CodexInputPricePerMillion      float64 `json:"codex_input_price_per_million"`
	CodexOutputPricePerMillion     float64 `json:"codex_output_price_per_million"`
	CodexCacheReadPricePerMillion  float64 `json:"codex_cache_read_price_per_million"`
	CodexCacheWritePricePerMillion float64 `json:"codex_cache_write_price_per_million"`
	Notes                          string  `json:"notes"`
}

func DefaultSubscriptionRefundSettings() SubscriptionRefundSettings {
	return SubscriptionRefundSettings{
		PageEnabled:                    false,
		Enabled:                        true,
		AllowBalanceRefund:             true,
		AllowOriginalPaymentRefund:     true,
		SettlementMode:                 SubscriptionRefundSettlementModeDurationRatio,
		Currency:                       "USD",
		CodexInputPricePerMillion:      0,
		CodexOutputPricePerMillion:     0,
		CodexCacheReadPricePerMillion:  0,
		CodexCacheWritePricePerMillion: 0,
		Notes:                          "Codex 套餐如需按 token 用量折算退款，请在这里维护每 100 万 token 的标准单价；当前未切换逻辑前，该配置可先作为审核参考。",
	}
}

func GetSubscriptionRefundSettings() SubscriptionRefundSettings {
	settings := DefaultSubscriptionRefundSettings()
	common.OptionMapRWMutex.RLock()
	raw := strings.TrimSpace(common.OptionMap[subscriptionRefundSettingsOptionKey])
	common.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return settings
	}
	var override SubscriptionRefundSettings
	if err := common.UnmarshalJsonStr(raw, &override); err != nil {
		return settings
	}
	var rawMap map[string]any
	if err := common.UnmarshalJsonStr(raw, &rawMap); err != nil {
		rawMap = map[string]any{}
	}
	if _, ok := rawMap["enabled"]; ok {
		settings.Enabled = override.Enabled
	}
	if _, ok := rawMap["page_enabled"]; ok {
		settings.PageEnabled = override.PageEnabled
	}
	if _, ok := rawMap["allow_balance_refund"]; ok {
		settings.AllowBalanceRefund = override.AllowBalanceRefund
	}
	if _, ok := rawMap["allow_original_payment_refund"]; ok {
		settings.AllowOriginalPaymentRefund = override.AllowOriginalPaymentRefund
	}
	if strings.TrimSpace(override.SettlementMode) != "" {
		settings.SettlementMode = strings.TrimSpace(override.SettlementMode)
	}
	if strings.TrimSpace(override.Currency) != "" {
		settings.Currency = strings.ToUpper(strings.TrimSpace(override.Currency))
	}
	settings.CodexInputPricePerMillion = override.CodexInputPricePerMillion
	settings.CodexOutputPricePerMillion = override.CodexOutputPricePerMillion
	settings.CodexCacheReadPricePerMillion = override.CodexCacheReadPricePerMillion
	settings.CodexCacheWritePricePerMillion = override.CodexCacheWritePricePerMillion
	if strings.TrimSpace(override.Notes) != "" {
		settings.Notes = strings.TrimSpace(override.Notes)
	}
	return settings
}

func ValidateSubscriptionRefundSettings(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var settings SubscriptionRefundSettings
	if err := common.UnmarshalJsonStr(raw, &settings); err != nil {
		return fmt.Errorf("退款设置配置格式错误: %w", err)
	}
	mode := strings.TrimSpace(settings.SettlementMode)
	switch mode {
	case SubscriptionRefundSettlementModeDurationRatio, SubscriptionRefundSettlementModeTokenUsage:
	default:
		return fmt.Errorf("退款结算模式无效，仅支持 %s / %s", SubscriptionRefundSettlementModeDurationRatio, SubscriptionRefundSettlementModeTokenUsage)
	}
	if strings.TrimSpace(settings.Currency) == "" {
		return fmt.Errorf("退款计价货币不能为空")
	}
	if settings.CodexInputPricePerMillion < 0 ||
		settings.CodexOutputPricePerMillion < 0 ||
		settings.CodexCacheReadPricePerMillion < 0 ||
		settings.CodexCacheWritePricePerMillion < 0 {
		return fmt.Errorf("Codex 每 100 万 token 单价不能小于 0")
	}
	if !settings.AllowBalanceRefund && !settings.AllowOriginalPaymentRefund {
		return fmt.Errorf("至少需要开启一种退款去向")
	}
	return nil
}

func NormalizeSubscriptionRefundTarget(target string) string {
	switch strings.TrimSpace(target) {
	case SubscriptionRefundTargetBalance:
		return SubscriptionRefundTargetBalance
	case SubscriptionRefundTargetOriginalPayment:
		return SubscriptionRefundTargetOriginalPayment
	default:
		return ""
	}
}

func (s SubscriptionRefundSettings) IsRefundPageEnabled() bool {
	return s.PageEnabled && s.Enabled
}

func (s SubscriptionRefundSettings) IsRefundTargetAllowed(target string) bool {
	switch NormalizeSubscriptionRefundTarget(target) {
	case SubscriptionRefundTargetBalance:
		return s.AllowBalanceRefund
	case SubscriptionRefundTargetOriginalPayment:
		return s.AllowOriginalPaymentRefund
	default:
		return false
	}
}

func (s SubscriptionRefundSettings) DefaultRefundTarget() string {
	if s.AllowBalanceRefund {
		return SubscriptionRefundTargetBalance
	}
	if s.AllowOriginalPaymentRefund {
		return SubscriptionRefundTargetOriginalPayment
	}
	return ""
}
