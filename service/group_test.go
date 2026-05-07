package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetUserUsableGroupsForUser_IncludesActiveSubscriptionGroups(t *testing.T) {
	truncate(t)

	originFilter := setting.EnableGroupBillingFilter
	originSubGroups := setting.SubscriptionGroups2JSONString()
	originQuotaGroups := setting.QuotaGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","codex":"Codex","claude":"Claude"}`))
	require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(`["codex_sub","claude_sub"]`))
	require.NoError(t, setting.UpdateQuotaGroupsByJSONString(`["default","codex","claude"]`))
	setting.EnableGroupBillingFilter = true
	t.Cleanup(func() {
		setting.EnableGroupBillingFilter = originFilter
		require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(originSubGroups))
		require.NoError(t, setting.UpdateQuotaGroupsByJSONString(originQuotaGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 31
	seedUser(t, userID, 0)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 131, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 131).Update("upgrade_group", "codex_sub").Error)
	sub := &model.UserSubscription{
		Id:           131,
		UserId:       userID,
		PlanId:       131,
		AmountTotal:  5000,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	usableGroups := GetUserUsableGroupsForUser(userID, "default", false)
	_, hasCodexSub := usableGroups["codex_sub"]
	_, hasDefault := usableGroups["default"]
	_, hasCodex := usableGroups["codex"]

	assert.True(t, hasCodexSub)
	assert.False(t, hasDefault)
	assert.False(t, hasCodex)
}

func TestNormalizeTokenGroupsDeduplicatesAndRejectsAutoMixedWithGroups(t *testing.T) {
	groups, err := NormalizeTokenGroups(" claude, codex, claude ,, ")
	require.NoError(t, err)
	assert.Equal(t, []string{"claude", "codex"}, groups)
	assert.Equal(t, "claude,codex", JoinTokenGroups(groups))

	groups, err = NormalizeTokenGroups("")
	require.NoError(t, err)
	assert.Empty(t, groups)
	assert.Equal(t, "", JoinTokenGroups(groups))

	_, err = NormalizeTokenGroups("auto,claude")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "auto")
}

func TestGetUserUsableGroupsForUser_UnionsMultipleSubscriptionGroups(t *testing.T) {
	truncate(t)

	originFilter := setting.EnableGroupBillingFilter
	originSubGroups := setting.SubscriptionGroups2JSONString()
	originQuotaGroups := setting.QuotaGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组"}`))
	require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(`["codex_sub","claude_sub"]`))
	require.NoError(t, setting.UpdateQuotaGroupsByJSONString(`["default","codex","claude"]`))
	setting.EnableGroupBillingFilter = true
	t.Cleanup(func() {
		setting.EnableGroupBillingFilter = originFilter
		require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(originSubGroups))
		require.NoError(t, setting.UpdateQuotaGroupsByJSONString(originQuotaGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 32
	seedUser(t, userID, 0)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 132, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 132).Update("upgrade_group", "codex_sub").Error)
	seedSubscriptionPlan(t, 133, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 133).Update("upgrade_group", "claude_sub").Error)

	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:           132,
		UserId:       userID,
		PlanId:       132,
		AmountTotal:  5000,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:           133,
		UserId:       userID,
		PlanId:       133,
		AmountTotal:  5000,
		UpgradeGroup: "claude_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}).Error)

	usableGroups := GetUserUsableGroupsForUser(userID, "default", false)
	_, hasCodexSub := usableGroups["codex_sub"]
	_, hasClaudeSub := usableGroups["claude_sub"]
	_, hasDefault := usableGroups["default"]

	assert.True(t, hasCodexSub)
	assert.True(t, hasClaudeSub)
	assert.False(t, hasDefault)
}

func TestGetUserUsableGroupsForUser_KeepsQuotaGroupsWhenBalanceExists(t *testing.T) {
	truncate(t)

	originFilter := setting.EnableGroupBillingFilter
	originSubGroups := setting.SubscriptionGroups2JSONString()
	originQuotaGroups := setting.QuotaGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","codex":"Codex"}`))
	require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(`["codex_sub"]`))
	require.NoError(t, setting.UpdateQuotaGroupsByJSONString(`["default","codex"]`))
	setting.EnableGroupBillingFilter = true
	t.Cleanup(func() {
		setting.EnableGroupBillingFilter = originFilter
		require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(originSubGroups))
		require.NoError(t, setting.UpdateQuotaGroupsByJSONString(originQuotaGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 33
	seedUser(t, userID, 10000)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 134, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 134).Update("upgrade_group", "codex_sub").Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:           134,
		UserId:       userID,
		PlanId:       134,
		AmountTotal:  5000,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}).Error)

	usableGroups := GetUserUsableGroupsForUser(userID, "default", true)
	_, hasCodexSub := usableGroups["codex_sub"]
	_, hasDefault := usableGroups["default"]
	_, hasCodex := usableGroups["codex"]

	assert.True(t, hasCodexSub)
	assert.True(t, hasDefault)
	assert.True(t, hasCodex)
}

func TestResolveEffectiveUserGroupForUser_FallsBackToSubscriptionGroupWhenConfiguredGroupIsStale(t *testing.T) {
	truncate(t)

	originFilter := setting.EnableGroupBillingFilter
	originSubGroups := setting.SubscriptionGroups2JSONString()
	originQuotaGroups := setting.QuotaGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组"}`))
	require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(`["codex_sub"]`))
	require.NoError(t, setting.UpdateQuotaGroupsByJSONString(`["default","codex"]`))
	setting.EnableGroupBillingFilter = true
	t.Cleanup(func() {
		setting.EnableGroupBillingFilter = originFilter
		require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(originSubGroups))
		require.NoError(t, setting.UpdateQuotaGroupsByJSONString(originQuotaGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 34
	seedUser(t, userID, 0)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "codex包月").Error)

	seedSubscriptionPlan(t, 135, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 135).Update("upgrade_group", "codex_sub").Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:           135,
		UserId:       userID,
		PlanId:       135,
		AmountTotal:  5000,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}).Error)

	effectiveGroup := ResolveEffectiveUserGroupForUser(userID, "codex包月", false)
	assert.Equal(t, "codex_sub", effectiveGroup)
}

func TestResolveEffectiveUserGroupForUser_PreservesConfiguredQuotaGroupWhenBalanceExists(t *testing.T) {
	truncate(t)

	originFilter := setting.EnableGroupBillingFilter
	originSubGroups := setting.SubscriptionGroups2JSONString()
	originQuotaGroups := setting.QuotaGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","codex":"Codex"}`))
	require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(`["codex_sub"]`))
	require.NoError(t, setting.UpdateQuotaGroupsByJSONString(`["default","codex"]`))
	setting.EnableGroupBillingFilter = true
	t.Cleanup(func() {
		setting.EnableGroupBillingFilter = originFilter
		require.NoError(t, setting.UpdateSubscriptionGroupsByJSONString(originSubGroups))
		require.NoError(t, setting.UpdateQuotaGroupsByJSONString(originQuotaGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 35
	seedUser(t, userID, 10000)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 136, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 136).Update("upgrade_group", "codex_sub").Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:           136,
		UserId:       userID,
		PlanId:       136,
		AmountTotal:  5000,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}).Error)

	effectiveGroup := ResolveEffectiveUserGroupForUser(userID, "default", true)
	assert.Equal(t, "default", effectiveGroup)
}
