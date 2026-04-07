package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	GroupBillingTypePublic       = "public"
	GroupBillingTypeSubscription = "subscription"
	GroupBillingTypeQuota        = "quota"
	GroupBillingTypeHybrid       = "hybrid"
)

// GetUserUsableGroupsWithBillingFilter 在 GetUserUsableGroups 基础上，
// 当 EnableGroupBillingFilter 开启时，按用户计费能力过滤可选分组：
//   - isSubscriptionUser=true  → 可见 SubscriptionGroups
//   - hasQuotaBalance=true     → 可见 QuotaGroups
//   - 两者都满足              → 两类分组均可见
//   - 不在任何一个列表里的分组对所有用户均可见
func GetUserUsableGroupsWithBillingFilter(userGroup string, isSubscriptionUser bool, hasQuotaBalance ...bool) map[string]string {
	groups := GetUserUsableGroups(userGroup)
	if !setting.EnableGroupBillingFilter {
		return groups
	}

	subGroups := setting.GetSubscriptionGroups()
	quotaGroups := setting.GetQuotaGroups()

	// 两个列表都为空时不做过滤，避免误操作锁死用户
	if len(subGroups) == 0 && len(quotaGroups) == 0 {
		return groups
	}

	// 兼容旧调用（只传一个参数）：无订阅时默认按量可用
	canUseQuota := !isSubscriptionUser
	if len(hasQuotaBalance) > 0 {
		canUseQuota = hasQuotaBalance[0]
	}

	subSet := make(map[string]bool, len(subGroups))
	for _, g := range subGroups {
		subSet[g] = true
	}
	quotaSet := make(map[string]bool, len(quotaGroups))
	for _, g := range quotaGroups {
		quotaSet[g] = true
	}

	filtered := make(map[string]string, len(groups))
	for name, desc := range groups {
		inSub := subSet[name]
		inQuota := quotaSet[name]
		// 不在任何列表中的分组对所有人可见
		if !inSub && !inQuota {
			filtered[name] = desc
			continue
		}
		// 有活跃订阅 → 可使用订阅专属分组
		if isSubscriptionUser && inSub {
			filtered[name] = desc
			continue
		}
		// 有余额 → 可使用按量专属分组
		if canUseQuota && inQuota {
			filtered[name] = desc
		}
	}
	return filtered
}

func resolveUserBillingCapabilities(userId int, hasQuotaBalance bool) (bool, bool) {
	if !setting.EnableGroupBillingFilter {
		return false, hasQuotaBalance
	}
	isSubscriptionUser := false
	if has, err := model.HasActiveUserSubscription(userId); err == nil {
		isSubscriptionUser = has
	}
	return isSubscriptionUser, hasQuotaBalance
}

func GetUserUsableGroupsForUser(userId int, userGroup string, hasQuotaBalance bool) map[string]string {
	isSubscriptionUser, canUseQuota := resolveUserBillingCapabilities(userId, hasQuotaBalance)
	return GetUserUsableGroupsWithBillingFilter(userGroup, isSubscriptionUser, canUseQuota)
}

func GetUserUsableGroups(userGroup string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	if userGroup != "" {
		specialSettings, b := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup)
		if b {
			// 处理特殊可用分组
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					// 移除分组
					groupToRemove := strings.TrimPrefix(specialGroup, "-:")
					delete(groupsCopy, groupToRemove)
				} else if strings.HasPrefix(specialGroup, "+:") {
					// 添加分组
					groupToAdd := strings.TrimPrefix(specialGroup, "+:")
					groupsCopy[groupToAdd] = desc
				} else {
					// 直接添加分组
					groupsCopy[specialGroup] = desc
				}
			}
		}
		// 如果userGroup不在UserUsableGroups中，返回UserUsableGroups + userGroup
		if _, ok := groupsCopy[userGroup]; !ok {
			groupsCopy[userGroup] = "用户分组"
		}
	}
	return groupsCopy
}

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetUserUsableGroups(userGroup)[groupName]
	return ok
}

func GroupInUserUsableGroupsForUser(userId int, userGroup string, hasQuotaBalance bool, groupName string) bool {
	_, ok := GetUserUsableGroupsForUser(userId, userGroup, hasQuotaBalance)[groupName]
	return ok
}

func GetAutoGroupsFromUsableGroups(usableGroups map[string]string) []string {
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := usableGroups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// GetUserAutoGroup 根据用户分组获取自动分组设置
func GetUserAutoGroup(userGroup string) []string {
	return GetAutoGroupsFromUsableGroups(GetUserUsableGroups(userGroup))
}

func GetUserAutoGroupForUser(userId int, userGroup string, hasQuotaBalance bool) []string {
	return GetAutoGroupsFromUsableGroups(GetUserUsableGroupsForUser(userId, userGroup, hasQuotaBalance))
}

func GetGroupBillingType(groupName string) string {
	if groupName == "" || groupName == "auto" {
		return GroupBillingTypePublic
	}
	inSubscription := false
	for _, group := range setting.GetSubscriptionGroups() {
		if group == groupName {
			inSubscription = true
			break
		}
	}
	inQuota := false
	for _, group := range setting.GetQuotaGroups() {
		if group == groupName {
			inQuota = true
			break
		}
	}
	switch {
	case inSubscription && inQuota:
		return GroupBillingTypeHybrid
	case inSubscription:
		return GroupBillingTypeSubscription
	case inQuota:
		return GroupBillingTypeQuota
	default:
		return GroupBillingTypePublic
	}
}

func GetGroupBillingLabel(groupName string) string {
	switch GetGroupBillingType(groupName) {
	case GroupBillingTypeSubscription:
		return "订阅"
	case GroupBillingTypeQuota:
		return "按量"
	case GroupBillingTypeHybrid:
		return "订阅/按量"
	default:
		return "通用"
	}
}

func ResolveBillingPreferenceByGroup(groupName, fallback string) string {
	if !setting.EnableGroupBillingFilter {
		return fallback
	}
	switch GetGroupBillingType(groupName) {
	case GroupBillingTypeSubscription:
		return "subscription_only"
	case GroupBillingTypeQuota:
		return "wallet_only"
	default:
		return fallback
	}
}

// GetUserGroupRatio 获取用户使用某个分组的倍率
// userGroup 用户分组
// group 需要获取倍率的分组
func GetUserGroupRatio(userGroup, group string) float64 {
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
