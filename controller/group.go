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
	groupNames := ratio_setting.GetGroupRatioCopy()
	groups := make(map[string]map[string]interface{}, len(groupNames))
	for groupName, ratio := range groupNames {
		groups[groupName] = map[string]interface{}{
			"desc":          setting.GetUsableGroupDescription(groupName),
			"ratio":         ratio,
			"billing_type":  service.GetGroupBillingType(groupName),
			"billing_label": service.GetGroupBillingLabel(groupName),
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groups,
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
	effectiveGroup := service.ResolveEffectiveUserGroupForUser(userId, userCache.Group, hasQuotaBalance)
	userUsableGroups := service.GetUserUsableGroupsForUser(userId, userCache.Group, hasQuotaBalance)
	for groupName, desc := range userUsableGroups {
		if groupName == "auto" {
			continue
		}
		usableGroups[groupName] = map[string]interface{}{
			"ratio":         service.GetUserGroupRatio(effectiveGroup, groupName),
			"desc":          desc,
			"billing_type":  service.GetGroupBillingType(groupName),
			"billing_label": service.GetGroupBillingLabel(groupName),
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
