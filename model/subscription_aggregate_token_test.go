package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withSubscriptionAggregateTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true

	require.NoError(t, db.AutoMigrate(
		&User{},
		&Channel{},
		&Vendor{},
		&Model{},
		&SubscriptionPlan{},
		&SubscriptionOrder{},
		&UserSubscription{},
		&SubscriptionPreConsumeRecord{},
		&Token{},
		&Log{},
	))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestAdminBindSubscriptionWithResult_ProvisionAggregateAccess(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1001,
			Username: "agg_user",
			AffCode:  "agg_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                2001,
			Title:             "Claude Lite",
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 15000,
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			UpgradeGroup:      "sub_plan_claude_lite",
			AllowedModelsJSON: `["claude-sonnet-4-6"]`,
		}).Error)

		tag := subscriptionPlanChannelPoolTag(2001)
		require.NoError(t, DB.Create(&Channel{
			Id:          3001,
			Name:        "Claude Lite Pool",
			Status:      common.ChannelStatusEnabled,
			Key:         "upstream-key-1",
			Group:       "sub_plan_claude_lite",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
		}).Error)

		_, sub, err := AdminBindSubscriptionWithResult(1001, 2001, "")
		require.NoError(t, err)
		require.NotNil(t, sub)
		require.Equal(t, 3001, sub.SpecificChannelId)
		require.Equal(t, 0, sub.SpecificChannelKeyIndex)

		var aggregateToken Token
		require.NoError(t, DB.Where("user_id = ? AND name = ?", 1001, SubscriptionAggregateAccessTokenName).First(&aggregateToken).Error)
		require.Equal(t, common.TokenStatusEnabled, aggregateToken.Status)
		require.Equal(t, TokenSourceSubscriptionAggregateAccess, aggregateToken.Source)
		require.Equal(t, -1, aggregateToken.SpecificChannelKeyIndex)
		require.Equal(t, 0, aggregateToken.SpecificChannelId)
		require.True(t, aggregateToken.ModelLimitsEnabled)
		require.Equal(t, "claude-sonnet-4-6", aggregateToken.ModelLimits)
	})
}

func TestEnsureSubscriptionAggregateAccessTokenForUser_DisablesStaleToken(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1002,
			Username: "stale_user",
			AffCode:  "stale_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&Token{
			UserId:             1002,
			Name:               SubscriptionAggregateAccessTokenName,
			Key:                "aggregate-old-key",
			Status:             common.TokenStatusEnabled,
			CreatedTime:        now - 100,
			AccessedTime:       now - 100,
			ExpiredTime:        -1,
			UnlimitedQuota:     true,
			Group:              "default",
			ModelLimits:        "claude-sonnet-4-6",
			ModelLimitsEnabled: true,
		}).Error)

		token, err := EnsureSubscriptionAggregateAccessTokenForUser(1002)
		require.NoError(t, err)
		require.NotNil(t, token)
		require.Equal(t, TokenSourceSubscriptionAggregateAccess, token.Source)
		require.Equal(t, common.TokenStatusDisabled, token.Status)
		require.False(t, token.ModelLimitsEnabled)
		require.Empty(t, token.ModelLimits)

		var dbToken Token
		require.NoError(t, DB.Where("user_id = ? AND name = ?", 1002, SubscriptionAggregateAccessTokenName).First(&dbToken).Error)
		require.Equal(t, common.TokenStatusDisabled, dbToken.Status)
		require.Equal(t, TokenSourceSubscriptionAggregateAccess, dbToken.Source)
		require.False(t, dbToken.ModelLimitsEnabled)
		require.Empty(t, dbToken.ModelLimits)
	})
}

func TestRefreshSubscriptionAggregateAccessTokenTx_OnlyUsesEligibleRequestCountSubscriptions(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1003,
			Username: "refresh_user",
			AffCode:  "refresh_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&Token{
			Id:             4003,
			UserId:         1003,
			Name:           SubscriptionAggregateAccessTokenName,
			Key:            "aggregate-refresh-key",
			Status:         common.TokenStatusEnabled,
			CreatedTime:    now - 100,
			AccessedTime:   now - 100,
			ExpiredTime:    -1,
			UnlimitedQuota: true,
			Group:          "default",
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                5001,
			UserId:            1003,
			PlanId:            7001,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 100,
			RequestCountUsed:  0,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 7200,
			UpgradeGroup:      "sub_plan_claude_lite",
			AllowedModelsJSON: `["claude-sonnet-4-6"]`,
			SpecificChannelId: 9001,
			CreatedAt:         now - 3600,
			UpdatedAt:         now - 3600,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:           5002,
			UserId:       1003,
			PlanId:       7002,
			ResourceType: SubscriptionResourceQuota,
			AmountTotal:  100000,
			AmountUsed:   0,
			Status:       "active",
			StartTime:    now - 3600,
			EndTime:      now + 86400,
			UpgradeGroup: "vip_quota",
			CreatedAt:    now - 3600,
			UpdatedAt:    now - 3600,
		}).Error)

		require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
			var token Token
			if err := tx.Where("id = ?", 4003).First(&token).Error; err != nil {
				return err
			}
			return refreshSubscriptionAggregateAccessTokenTx(tx, &token)
		}))

		var dbToken Token
		require.NoError(t, DB.Where("id = ?", 4003).First(&dbToken).Error)
		require.Equal(t, common.TokenStatusEnabled, dbToken.Status)
		require.Equal(t, now+7200, dbToken.ExpiredTime)
		require.True(t, dbToken.ModelLimitsEnabled)
		require.Equal(t, "claude-sonnet-4-6", dbToken.ModelLimits)
	})
}

func TestGetPreferredSubscriptionRouteForAggregateToken_SkipsUnavailableBoundKey(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1101,
			Username: "route_user",
			AffCode:  "route_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&Channel{
			Id:          9101,
			Name:        "Claude Lite A",
			Key:         "sk-a-1",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_lite",
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
		}).Error)
		require.NoError(t, DB.Create(&Channel{
			Id:          9102,
			Name:        "Claude Lite B",
			Key:         "sk-b-1",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_lite",
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8101,
			UserId:                  1101,
			PlanId:                  7101,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       100,
			RequestCountUsed:        0,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			SpecificChannelId:       9101,
			SpecificChannelKeyIndex: 9,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8102,
			UserId:                  1101,
			PlanId:                  7102,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       100,
			RequestCountUsed:        0,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 10800,
			UpgradeGroup:            "sub_plan_claude_lite",
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			SpecificChannelId:       9102,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)

		decision, err := GetPreferredSubscriptionRouteForAggregateToken(1101, "claude-sonnet-4-6")
		require.NoError(t, err)
		require.NotNil(t, decision)
		require.Equal(t, 8102, decision.UserSubscriptionId)
		require.Equal(t, 9102, decision.SpecificChannelId)
	})
}

func TestAllocateSubscriptionPlanChannelFromPoolTx_SkipsActiveSubscriptionBindingsWithoutToken(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()
		tag := subscriptionPlanChannelPoolTag(2002)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                2002,
			Title:             "Claude Lite",
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 15000,
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			UpgradeGroup:      "sub_plan_claude_lite",
		}).Error)

		require.NoError(t, DB.Create(&Channel{
			Id:          3201,
			Name:        "Claude Lite Pool",
			Status:      common.ChannelStatusEnabled,
			Key:         "upstream-key-0\nupstream-key-1\nupstream-key-2",
			Group:       "sub_plan_claude_lite",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 3,
			},
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      5201,
			UserId:                  1201,
			PlanId:                  2002,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       100,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			SpecificChannelId:       3201,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)
		require.NoError(t, DB.Model(&UserSubscription{}).
			Where("id = ?", 5201).
			Update("specific_channel_key_index", 0).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      5202,
			UserId:                  1202,
			PlanId:                  2002,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       100,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			SpecificChannelId:       3201,
			SpecificChannelKeyIndex: 1,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 3201).First(&storedChannel).Error)
		require.True(t, storedChannel.ChannelInfo.IsMultiKey)
		require.Len(t, storedChannel.GetKeys(), 3)
		require.True(t, storedChannel.IsSpecificKeyAvailable(2))

		require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
			channel, keyIndex, err := allocateSubscriptionPlanChannelFromPoolTx(tx, tag)
			require.NoError(t, err)
			require.NotNil(t, channel)
			require.Equal(t, 3201, channel.Id)
			require.Equal(t, 2, keyIndex)
			return nil
		}))
	})
}

func TestGetPreferredSubscriptionRouteForAggregateToken_ReturnsExhaustedMessageWhenAllSubscriptionsExhausted(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1102,
			Username: "exhausted_user",
			AffCode:  "exhausted_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&Channel{
			Id:          9201,
			Name:        "Claude Lite Exhausted",
			Key:         "sk-c-1",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_lite",
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8201,
			UserId:                  1102,
			PlanId:                  7201,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       15000,
			RequestCountUsed:        15000,
			RequestCountPeriodTotal: 500,
			RequestCountPeriodUsed:  500,
			ResetPeriod:             SubscriptionResetDaily,
			NextResetTime:           now + 3600,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			SpecificChannelId:       9201,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)

		decision, err := GetPreferredSubscriptionRouteForAggregateToken(1102, "claude-sonnet-4-6")
		require.NoError(t, err)
		require.NotNil(t, decision)
		require.Equal(t, 0, decision.UserSubscriptionId)
		require.Contains(t, decision.ExhaustedMessage, "套餐总次数 15000/15000（100.00%）")
		require.Contains(t, decision.ExhaustedMessage, "今日次数 500/500（100.00%）")
	})
}

func TestAdminInvalidateUserSubscription_RefreshesAggregateRouteToAnotherActiveSubscription(t *testing.T) {
	withSubscriptionAggregateTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       1201,
			Username: "invalidate_route_user",
			AffCode:  "invalidate_route_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&Channel{
			Id:          9301,
			Name:        "Claude Lite Pool",
			Key:         "sk-lite-1",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_lite",
			Models:      "claude-opus-4-6",
			CreatedTime: now,
		}).Error)
		require.NoError(t, DB.Create(&Channel{
			Id:          9302,
			Name:        "Claude Premium Pool",
			Key:         "sk-premium-1",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_premium",
			Models:      "claude-opus-4-6",
			CreatedTime: now,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8301,
			UserId:                  1201,
			PlanId:                  7301,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       15000,
			RequestCountPeriodTotal: 500,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			AllowedModelsJSON:       `["claude-opus-4-6"]`,
			SpecificChannelId:       9301,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8302,
			UserId:                  1201,
			PlanId:                  7302,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       90000,
			RequestCountPeriodTotal: 3000,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 10800,
			UpgradeGroup:            "sub_plan_claude_premium",
			AllowedModelsJSON:       `["claude-opus-4-6"]`,
			SpecificChannelId:       9302,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}).Error)

		token, err := EnsureSubscriptionAggregateAccessTokenForUser(1201)
		require.NoError(t, err)
		require.NotNil(t, token)
		require.Equal(t, common.TokenStatusEnabled, token.Status)

		beforeDecision, err := GetPreferredSubscriptionRouteForAggregateToken(1201, "claude-opus-4-6")
		require.NoError(t, err)
		require.NotNil(t, beforeDecision)
		require.Equal(t, 8301, beforeDecision.UserSubscriptionId)
		require.Equal(t, 9301, beforeDecision.SpecificChannelId)

		_, err = AdminInvalidateUserSubscription(8301)
		require.NoError(t, err)

		afterDecision, err := GetPreferredSubscriptionRouteForAggregateToken(1201, "claude-opus-4-6")
		require.NoError(t, err)
		require.NotNil(t, afterDecision)
		require.Equal(t, 8302, afterDecision.UserSubscriptionId)
		require.Equal(t, 9302, afterDecision.SpecificChannelId)
	})
}
