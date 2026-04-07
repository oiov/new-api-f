package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userId := c.GetInt("id")
	userGroup, _ := model.GetUserGroup(userId, false)

	// 按计费能力过滤分组：订阅状态 + 余额状态独立判断，两者不互斥
	isSubscriptionUser := false
	hasQuotaBalance := true // 默认允许按量（无 filter 时兜底）
	if setting.EnableGroupBillingFilter {
		has, _ := model.HasActiveUserSubscription(userId)
		isSubscriptionUser = has
		// 读取用户余额，大于 0 才算有按量能力
		if u, err := model.GetUserById(userId, false); err == nil {
			hasQuotaBalance = u.Quota > 0
		}
	}

	userUsableGroups := service.GetUserUsableGroupsWithBillingFilter(userGroup, isSubscriptionUser, hasQuotaBalance)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		usableGroups["auto"] = map[string]interface{}{
			"ratio": "自动",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}

