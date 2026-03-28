package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

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
