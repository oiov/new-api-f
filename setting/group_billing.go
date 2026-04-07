package setting

import (
	"encoding/json"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var (
	// EnableGroupBillingFilter 开启后按用户计费类型过滤可选分组：
	// 有活跃订阅的用户只能选 SubscriptionGroups，
	// 纯按量用户只能选 QuotaGroups。
	// 不在任何一个列表里的分组对所有用户可见。
	EnableGroupBillingFilter bool

	subscriptionGroups   []string
	quotaGroups          []string
	groupBillingFilterMu sync.RWMutex
)

func GetSubscriptionGroups() []string {
	groupBillingFilterMu.RLock()
	defer groupBillingFilterMu.RUnlock()
	cp := make([]string, len(subscriptionGroups))
	copy(cp, subscriptionGroups)
	return cp
}

func GetQuotaGroups() []string {
	groupBillingFilterMu.RLock()
	defer groupBillingFilterMu.RUnlock()
	cp := make([]string, len(quotaGroups))
	copy(cp, quotaGroups)
	return cp
}

func SubscriptionGroups2JSONString() string {
	groupBillingFilterMu.RLock()
	defer groupBillingFilterMu.RUnlock()
	if len(subscriptionGroups) == 0 {
		return "[]"
	}
	b, err := json.Marshal(subscriptionGroups)
	if err != nil {
		common.SysLog("error marshalling subscription groups: " + err.Error())
		return "[]"
	}
	return string(b)
}

func QuotaGroups2JSONString() string {
	groupBillingFilterMu.RLock()
	defer groupBillingFilterMu.RUnlock()
	if len(quotaGroups) == 0 {
		return "[]"
	}
	b, err := json.Marshal(quotaGroups)
	if err != nil {
		common.SysLog("error marshalling quota groups: " + err.Error())
		return "[]"
	}
	return string(b)
}

func UpdateSubscriptionGroupsByJSONString(s string) error {
	var groups []string
	if err := json.Unmarshal([]byte(s), &groups); err != nil {
		return err
	}
	groupBillingFilterMu.Lock()
	defer groupBillingFilterMu.Unlock()
	subscriptionGroups = groups
	return nil
}

func UpdateQuotaGroupsByJSONString(s string) error {
	var groups []string
	if err := json.Unmarshal([]byte(s), &groups); err != nil {
		return err
	}
	groupBillingFilterMu.Lock()
	defer groupBillingFilterMu.Unlock()
	quotaGroups = groups
	return nil
}
