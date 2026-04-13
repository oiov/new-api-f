package setting

import (
	"encoding/json"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var userUsableGroups = map[string]string{
	"default":                      "默认分组",
	"vip":                          "vip分组",
	"sub_plan_claude_lite":         "Claude Lite 订阅专属分组",
	"sub_plan_claude_mini_plus":    "Claude Mini Plus 订阅专属分组",
	"sub_plan_claude_mini_max":     "Claude Mini Max 订阅专属分组",
	"sub_plan_claude_premium":      "Claude Premium 订阅专属分组",
	"sub_plan_claude_premium_plus": "Claude Premium+ 订阅专属分组",
	"sub_plan_claude_nano_day":     "Claude Nano Day 订阅专属分组",
	"sub_plan_claude_lite_day":     "Claude Lite Day 订阅专属分组",
}
var userUsableGroupsMutex sync.RWMutex

func GetUserUsableGroupsCopy() map[string]string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	copyUserUsableGroups := make(map[string]string)
	for k, v := range userUsableGroups {
		copyUserUsableGroups[k] = v
	}
	return copyUserUsableGroups
}

func UserUsableGroups2JSONString() string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	jsonBytes, err := json.Marshal(userUsableGroups)
	if err != nil {
		common.SysLog("error marshalling user groups: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateUserUsableGroupsByJSONString(jsonStr string) error {
	userUsableGroupsMutex.Lock()
	defer userUsableGroupsMutex.Unlock()

	userUsableGroups = make(map[string]string)
	return json.Unmarshal([]byte(jsonStr), &userUsableGroups)
}

func GetUsableGroupDescription(groupName string) string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	if desc, ok := userUsableGroups[groupName]; ok {
		return desc
	}
	return groupName
}
