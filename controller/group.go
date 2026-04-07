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
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	hasQuotaBalance := true
	if setting.EnableGroupBillingFilter {
		hasQuotaBalance = userCache.Quota > 0
	}
	userUsableGroups := service.GetUserUsableGroupsForUser(userId, userCache.Group, hasQuotaBalance)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio":         service.GetUserGroupRatio(userCache.Group, groupName),
				"desc":          desc,
				"billing_type":  service.GetGroupBillingType(groupName),
				"billing_label": service.GetGroupBillingLabel(groupName),
			}
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		usableGroups["auto"] = map[string]interface{}{
			"ratio":         "自动",
			"desc":          setting.GetUsableGroupDescription("auto"),
			"billing_type":  service.GetGroupBillingType("auto"),
			"billing_label": service.GetGroupBillingLabel("auto"),
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}
