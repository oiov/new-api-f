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

func mergeUsableGroups(groupNames ...string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	for _, groupName := range groupNames {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			continue
		}
		specialSettings, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(groupName)
		if ok {
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					delete(groupsCopy, strings.TrimPrefix(specialGroup, "-:"))
				} else if strings.HasPrefix(specialGroup, "+:") {
					groupsCopy[strings.TrimPrefix(specialGroup, "+:")] = desc
				} else {
					groupsCopy[specialGroup] = desc
				}
			}
		}
		if _, ok := groupsCopy[groupName]; !ok {
			groupsCopy[groupName] = "用户分组"
		}
	}
	return groupsCopy
}

func getUserSubscriptionGroups(userId int) []string {
	if userId <= 0 {
		return nil
	}
	groups, err := model.GetActiveUserSubscriptionGroups(userId)
	if err != nil {
		return nil
	}
	return groups
}

func getSubscriptionCoveredGroups(subscriptionGroups []string) map[string]struct{} {
	covered := make(map[string]struct{})
	for _, groupName := range subscriptionGroups {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			continue
		}
		covered[groupName] = struct{}{}
		specialSettings, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(groupName)
		if !ok {
			continue
		}
		for specialGroup := range specialSettings {
			if strings.HasPrefix(specialGroup, "-:") {
				delete(covered, strings.TrimPrefix(specialGroup, "-:"))
				continue
			}
			if strings.HasPrefix(specialGroup, "+:") {
				covered[strings.TrimPrefix(specialGroup, "+:")] = struct{}{}
				continue
			}
			covered[specialGroup] = struct{}{}
		}
	}
	return covered
}

// GetUserUsableGroupsWithBillingFilter 在 GetUserUsableGroups 基础上，
// 当 EnableGroupBillingFilter 开启时，按用户计费能力过滤可选分组：
//   - 有活跃订阅分组       → 可见该订阅实际覆盖的订阅分组
//   - hasQuotaBalance=true → 可见 QuotaGroups
//   - 两者都满足         → 两类分组均可见
//   - 不在任何一个列表中的分组对所有用户均可见
func GetUserUsableGroupsWithBillingFilter(userGroup string, subscriptionGroups []string, hasQuotaBalance ...bool) map[string]string {
	groupContexts := append([]string{userGroup}, subscriptionGroups...)
	groups := mergeUsableGroups(groupContexts...)
	if !setting.EnableGroupBillingFilter {
		return groups
	}

	subGroups := setting.GetSubscriptionGroups()
	quotaGroups := setting.GetQuotaGroups()

	// 两个列表都为空时不做过滤，避免误操作锁死用户
	if len(subGroups) == 0 && len(quotaGroups) == 0 {
		return groups
	}

	isSubscriptionUser := len(subscriptionGroups) > 0
	canUseQuota := !isSubscriptionUser
	if len(hasQuotaBalance) > 0 {
		canUseQuota = hasQuotaBalance[0]
	}

	subSet := make(map[string]bool, len(subGroups))
	for _, g := range subGroups {
		subSet[g] = true
	}
	coveredSubscriptionGroups := getSubscriptionCoveredGroups(subscriptionGroups)
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
		// 有活跃订阅 → 只可使用活跃订阅真实覆盖的订阅专属分组
		if isSubscriptionUser && inSub {
			if _, ok := coveredSubscriptionGroups[name]; ok {
				filtered[name] = desc
			}
			continue
		}
		// 有余额 → 可使用按量专属分组
		if canUseQuota && inQuota {
			filtered[name] = desc
		}
	}
	// 订阅用户可访问其活跃订阅自身分组，即使该分组不在基础可用分组集合中。
	if isSubscriptionUser {
		for _, g := range subscriptionGroups {
			if _, ok := subSet[g]; !ok {
				continue
			}
			if _, ok := filtered[g]; !ok {
				filtered[g] = setting.GetUsableGroupDescription(g)
			}
		}
	}
	return filtered
}

func resolveUserBillingCapabilities(userId int, hasQuotaBalance bool) (bool, bool) {
	if !setting.EnableGroupBillingFilter {
		return false, hasQuotaBalance
	}
	isSubscriptionUser := false
	if has, err := model.HasUsableUserSubscription(userId); err == nil {
		isSubscriptionUser = has
	}
	return isSubscriptionUser, hasQuotaBalance
}

func GetUserUsableGroupsForUser(userId int, userGroup string, hasQuotaBalance bool) map[string]string {
	_, canUseQuota := resolveUserBillingCapabilities(userId, hasQuotaBalance)
	return GetUserUsableGroupsWithBillingFilter(userGroup, getUserSubscriptionGroups(userId), canUseQuota)
}

func ResolveEffectiveUserGroupForUser(userId int, userGroup string, hasQuotaBalance bool) string {
	userGroup = strings.TrimSpace(userGroup)
	subscriptionGroups := getUserSubscriptionGroups(userId)
	usableGroups := GetUserUsableGroupsWithBillingFilter(userGroup, subscriptionGroups, hasQuotaBalance)
	coveredSubscriptionGroups := getSubscriptionCoveredGroups(subscriptionGroups)
	if userGroup != "" {
		if _, ok := usableGroups[userGroup]; ok {
			if len(subscriptionGroups) == 0 {
				return userGroup
			}
			if _, ok := coveredSubscriptionGroups[userGroup]; ok {
				return userGroup
			}
			if hasQuotaBalance && ratio_setting.ContainsGroupRatio(userGroup) {
				return userGroup
			}
		}
	}
	for _, groupName := range subscriptionGroups {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			continue
		}
		if _, ok := usableGroups[groupName]; ok {
			return groupName
		}
	}
	return userGroup
}

func GetUserUsableGroups(userGroup string) map[string]string {
	return mergeUsableGroups(userGroup)
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
