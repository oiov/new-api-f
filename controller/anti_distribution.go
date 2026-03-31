package controller

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

var antiDistributionOptionKeys = map[string]struct{}{
	"error_setting.show_site_domain_in_error":                   {},
	"error_setting.restrict_proxy_distribution":                 {},
	"error_setting.restrict_proxy_distribution_log_only":        {},
	"error_setting.restrict_proxy_distribution_blocked_message": {},
	"error_setting.restrict_proxy_distribution_allowed_hosts":   {},
	"error_setting.restrict_proxy_distribution_allowed_sources": {},
}

var antiDistributionJSONOptionKeys = map[string]struct{}{
	"error_setting.restrict_proxy_distribution_allowed_hosts":   {},
	"error_setting.restrict_proxy_distribution_allowed_sources": {},
}

func validateStringSliceJSON(raw string) error {
	var values []string
	if err := common.UnmarshalJsonStr(raw, &values); err != nil {
		return err
	}
	return nil
}

func stringifyOptionValue(key string, value any) (string, error) {
	if _, ok := antiDistributionJSONOptionKeys[key]; ok {
		if text, ok := value.(string); ok {
			if err := validateStringSliceJSON(text); err != nil {
				return "", err
			}
			return text, nil
		}
		jsonBytes, err := common.Marshal(value)
		if err != nil {
			return "", err
		}
		if err := validateStringSliceJSON(string(jsonBytes)); err != nil {
			return "", err
		}
		return string(jsonBytes), nil
	}

	switch typed := value.(type) {
	case bool:
		return common.Interface2String(typed), nil
	case float64:
		return common.Interface2String(typed), nil
	case int:
		return common.Interface2String(typed), nil
	default:
		return fmt.Sprintf("%v", value), nil
	}
}

func GetAntiDistributionPublicConfig(c *gin.Context) {
	setting := system_setting.GetErrorSetting()
	common.ApiSuccess(c, gin.H{
		"enabled":         setting.RestrictProxyDistribution,
		"log_only":        setting.RestrictProxyDistributionLogOnly,
		"allowed_hosts":   setting.RestrictProxyDistributionAllowedHosts,
		"allowed_sources": setting.RestrictProxyDistributionAllowedSources,
		"blocked_message": strings.TrimSpace(setting.RestrictProxyDistributionBlockedMessage),
	})
}

func GetAntiDistributionLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAntiDistributionLogs(pageInfo, model.AntiDistributionLogQuery{
		Action: c.Query("action"),
		Reason: c.Query("reason"),
		Layer:  c.Query("layer"),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func GetAntiDistributionOptions(c *gin.Context) {
	setting := system_setting.GetErrorSetting()
	common.ApiSuccess(c, gin.H{
		"error_setting.show_site_domain_in_error":                   setting.ShowSiteDomainInError,
		"error_setting.restrict_proxy_distribution":                 setting.RestrictProxyDistribution,
		"error_setting.restrict_proxy_distribution_log_only":        setting.RestrictProxyDistributionLogOnly,
		"error_setting.restrict_proxy_distribution_blocked_message": setting.RestrictProxyDistributionBlockedMessage,
		"error_setting.restrict_proxy_distribution_allowed_hosts":   setting.RestrictProxyDistributionAllowedHosts,
		"error_setting.restrict_proxy_distribution_allowed_sources": setting.RestrictProxyDistributionAllowedSources,
	})
}

func UpdateAntiDistributionOptions(c *gin.Context) {
	var options []OptionUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &options); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	if len(options) == 0 {
		common.ApiErrorMsg(c, "更新项不能为空")
		return
	}

	for _, option := range options {
		if _, ok := antiDistributionOptionKeys[option.Key]; !ok {
			common.ApiErrorMsg(c, "包含未授权的配置项")
			return
		}
	}

	optionValues := make(map[string]string, len(options))
	for _, option := range options {
		value, err := stringifyOptionValue(option.Key, option.Value)
		if err != nil {
			common.ApiErrorMsg(c, "配置值格式错误")
			return
		}
		optionValues[option.Key] = value
	}

	if err := model.BatchUpdateOptions(optionValues); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"message": "更新成功",
	})
}

func ResetAntiDistributionDefaults(c *gin.Context) {
	defaults := system_setting.GetDefaultErrorSetting()
	configMap, err := config.ConfigToMap(&defaults)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	for key, value := range configMap {
		if err = model.UpdateOption("error_setting."+key, value); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, gin.H{
		"message": "已重置防分发配置为默认值",
	})
}
