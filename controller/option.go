package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

var completionRatioMetaOptionKeys = []string{
	"ModelPrice",
	"ModelRatio",
	"CompletionRatio",
	"CacheRatio",
	"CreateCacheRatio",
	"ImageRatio",
	"AudioRatio",
	"AudioCompletionRatio",
}

func collectModelNamesFromOptionValue(raw string, modelNames map[string]struct{}) {
	if strings.TrimSpace(raw) == "" {
		return
	}

	var parsed map[string]any
	if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
		return
	}

	for modelName := range parsed {
		modelNames[modelName] = struct{}{}
	}
}

func buildCompletionRatioMetaValue(optionValues map[string]string) string {
	modelNames := make(map[string]struct{})
	for _, key := range completionRatioMetaOptionKeys {
		collectModelNamesFromOptionValue(optionValues[key], modelNames)
	}

	meta := make(map[string]ratio_setting.CompletionRatioInfo, len(modelNames))
	for modelName := range modelNames {
		meta[modelName] = ratio_setting.GetCompletionRatioInfo(modelName)
	}

	jsonBytes, err := common.Marshal(meta)
	if err != nil {
		return "{}"
	}
	return string(jsonBytes)
}

func GetOptions(c *gin.Context) {
	var options []*model.Option
	optionValues := make(map[string]string)
	common.OptionMapRWMutex.Lock()
	for k, v := range common.OptionMap {
		value := common.Interface2String(v)
		if maskedValue, ok := getMaskedOptionValue(k, value); ok {
			options = append(options, &model.Option{
				Key:   k,
				Value: maskedValue,
			})
			continue
		}
		if strings.HasSuffix(k, "Token") ||
			strings.HasSuffix(k, "Secret") ||
			strings.HasSuffix(k, "Key") ||
			strings.HasSuffix(k, "secret") ||
			strings.HasSuffix(k, "api_key") {
			continue
		}
		options = append(options, &model.Option{
			Key:   k,
			Value: value,
		})
		for _, optionKey := range completionRatioMetaOptionKeys {
			if optionKey == k {
				optionValues[k] = value
				break
			}
		}
	}
	common.OptionMapRWMutex.Unlock()
	options = append(options, &model.Option{
		Key:   "CompletionRatioMeta",
		Value: buildCompletionRatioMetaValue(optionValues),
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    options,
	})
	return
}

func getMaskedOptionValue(key, value string) (string, bool) {
	switch key {
	case "payment_notify_setting.ServerChanSendKey", "payment_notify_setting.PushPlusToken":
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return "", true
		}
		return maskSensitiveOptionValue(trimmed), true
	default:
		return "", false
	}
}

func maskSensitiveOptionValue(value string) string {
	values := splitMaskedSensitiveValues(value)
	if len(values) == 0 {
		return ""
	}
	if len(values) == 1 {
		return maskSingleSensitiveValue(values[0])
	}
	return fmt.Sprintf("共 %d 个已保存", len(values))
}

func splitMaskedSensitiveValues(value string) []string {
	parts := strings.FieldsFunc(strings.ReplaceAll(value, "\r", "\n"), func(r rune) bool {
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

func maskSingleSensitiveValue(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= 8 {
		return "********"
	}
	return string(runes[:4]) + "****" + string(runes[len(runes)-4:])
}

type OptionUpdateRequest struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

func normalizeOptionValue(value any) string {
	switch value.(type) {
	case bool:
		return common.Interface2String(value.(bool))
	case float64:
		return common.Interface2String(value.(float64))
	case int:
		return common.Interface2String(value.(int))
	default:
		return fmt.Sprintf("%v", value)
	}
}

func validateOptionUpdate(key string, value string) error {
	var err error
	switch key {
	case "GoogleOAuthEnabled", "GoogleOAuthRegisterEnabled":
		if value == "true" && (common.GoogleClientId == "" || common.GoogleClientSecret == "") {
			return fmt.Errorf("无法启用 Google OAuth，请先填入 Google Client Id 以及 Google Client Secret！")
		}
	case "GitHubOAuthEnabled", "GitHubOAuthRegisterEnabled":
		if value == "true" && common.GitHubClientId == "" {
			return fmt.Errorf("无法启用 GitHub OAuth，请先填入 GitHub Client Id 以及 GitHub Client Secret！")
		}
	case "discord.enabled", "discord.register_enabled":
		if value == "true" && system_setting.GetDiscordSettings().ClientId == "" {
			return fmt.Errorf("无法启用 Discord OAuth，请先填入 Discord Client Id 以及 Discord Client Secret！")
		}
	case "oidc.enabled", "oidc.register_enabled":
		if value == "true" && system_setting.GetOIDCSettings().ClientId == "" {
			return fmt.Errorf("无法启用 OIDC 登录，请先填入 OIDC Client Id 以及 OIDC Client Secret！")
		}
	case "LinuxDOOAuthEnabled", "LinuxDOOAuthRegisterEnabled":
		if value == "true" && common.LinuxDOClientId == "" {
			return fmt.Errorf("无法启用 LinuxDO OAuth，请先填入 LinuxDO Client Id 以及 LinuxDO Client Secret！")
		}
	case "EmailDomainRestrictionEnabled":
		if value == "true" && len(common.EmailDomainWhitelist) == 0 {
			return fmt.Errorf("无法启用邮箱域名限制，请先填入限制的邮箱域名！")
		}
	case "WeChatAuthEnabled", "WeChatRegisterEnabled":
		if value == "true" && common.WeChatServerAddress == "" {
			return fmt.Errorf("无法启用微信登录，请先填入微信登录相关配置信息！")
		}
	case "TurnstileCheckEnabled":
		if value == "true" && common.TurnstileSiteKey == "" {
			return fmt.Errorf("无法启用 Turnstile 校验，请先填入 Turnstile 校验相关配置信息！")
		}
	case "TelegramOAuthEnabled", "TelegramOAuthRegisterEnabled":
		if value == "true" && common.TelegramBotToken == "" {
			return fmt.Errorf("无法启用 Telegram OAuth，请先填入 Telegram Bot Token！")
		}
	case "GroupRatio":
		err = ratio_setting.CheckGroupRatio(value)
	case "ImageRatio":
		err = ratio_setting.UpdateImageRatioByJSONString(value)
		if err != nil {
			return fmt.Errorf("图片倍率设置失败: %s", err.Error())
		}
	case "AudioRatio":
		err = ratio_setting.UpdateAudioRatioByJSONString(value)
		if err != nil {
			return fmt.Errorf("音频倍率设置失败: %s", err.Error())
		}
	case "AudioCompletionRatio":
		err = ratio_setting.UpdateAudioCompletionRatioByJSONString(value)
		if err != nil {
			return fmt.Errorf("音频补全倍率设置失败: %s", err.Error())
		}
	case "CreateCacheRatio":
		err = ratio_setting.UpdateCreateCacheRatioByJSONString(value)
		if err != nil {
			return fmt.Errorf("缓存创建倍率设置失败: %s", err.Error())
		}
	case "ModelRequestRateLimitGroup":
		err = setting.CheckModelRequestRateLimitGroup(value)
	case "AutomaticDisableStatusCodes":
		_, err = operation_setting.ParseHTTPStatusCodeRanges(value)
	case "AutomaticRetryStatusCodes":
		_, err = operation_setting.ParseHTTPStatusCodeRanges(value)
	case "console_setting.api_info":
		err = console_setting.ValidateConsoleSettings(value, "ApiInfo")
	case "console_setting.announcements":
		err = console_setting.ValidateConsoleSettings(value, "Announcements")
	case "console_setting.faq":
		err = console_setting.ValidateConsoleSettings(value, "FAQ")
	case "console_setting.uptime_kuma_groups":
		err = console_setting.ValidateConsoleSettings(value, "UptimeKumaGroups")
	case "console_setting.contact_channels":
		err = console_setting.ValidateConsoleSettings(value, "ContactChannels")
	case "console_setting.ccswitch_defaults":
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			var payload any
			if err = common.UnmarshalJsonStr(trimmed, &payload); err != nil {
				return fmt.Errorf("CCSwitch 默认参数必须是合法 JSON")
			}
			if _, ok := payload.(map[string]any); !ok {
				return fmt.Errorf("CCSwitch 默认参数 JSON 顶层必须是对象")
			}
		}
	case "console_setting.subscription_promo_badge_left":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_badge_left", value)
	case "console_setting.subscription_promo_badge_right":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_badge_right", value)
	case "console_setting.subscription_promo_title":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_title", value)
	case "console_setting.subscription_promo_subtitle":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_subtitle", value)
	case "console_setting.subscription_promo_button_text":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_button_text", value)
	case "console_setting.subscription_promo_button_link":
		err = console_setting.ValidateSubscriptionPromoField("subscription_promo_button_link", value)
	case "SelfServiceSubscriptionConversionCampaign":
		err = model.ValidateSelfServiceSubscriptionConversionCampaign(value)
	case "SubscriptionPlanForNewUser", "SubscriptionPlanForInviter", "SubscriptionPlanForInvitee":
		planId, parseErr := strconv.Atoi(strings.TrimSpace(value))
		if parseErr != nil || planId < 0 {
			return fmt.Errorf("注册送订阅套餐必须是大于等于 0 的整数")
		}
		if planId > 0 {
			_, err = model.GetSubscriptionPlanById(planId)
			if err != nil {
				return fmt.Errorf("订阅套餐不存在")
			}
		}
	case "InviteRewardLimitWindowMinutes", "InviteRewardMaxCountPerInviter", "InviteRewardMaxCountPerIP", "InviteRewardMaxCountPerInviterIP":
		count, parseErr := strconv.Atoi(strings.TrimSpace(value))
		if parseErr != nil || count < 0 {
			return fmt.Errorf("邀请奖励防刷配置必须是大于等于 0 的整数")
		}
	case "checkin_setting.leaderboard_limit":
		count, parseErr := strconv.Atoi(strings.TrimSpace(value))
		if parseErr != nil || count < 1 || count > 1000 {
			return fmt.Errorf("签到榜展示条数必须是 1 到 1000 的整数")
		}
	case "error_setting.restrict_proxy_distribution_allowed_hosts", "error_setting.restrict_proxy_distribution_allowed_sources":
		var hosts []string
		if err = common.UnmarshalJsonStr(value, &hosts); err != nil {
			return fmt.Errorf("防分发白名单必须是字符串数组 JSON")
		}
	}
	if err != nil {
		return err
	}
	return nil
}

func UpdateOption(c *gin.Context) {
	var option OptionUpdateRequest
	err := common.DecodeJson(c.Request.Body, &option)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	value := normalizeOptionValue(option.Value)
	if err = validateOptionUpdate(option.Key, value); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = model.UpdateOption(option.Key, value)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func BatchUpdateOption(c *gin.Context) {
	var options []OptionUpdateRequest
	err := common.DecodeJson(c.Request.Body, &options)
	if err != nil || len(options) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	optionValues := make(map[string]string, len(options))
	for _, option := range options {
		value := normalizeOptionValue(option.Value)
		if err = validateOptionUpdate(option.Key, value); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		optionValues[option.Key] = value
	}
	err = model.BatchUpdateOptions(optionValues)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}
