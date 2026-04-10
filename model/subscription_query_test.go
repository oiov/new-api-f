package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withSubscriptionQueryTestDB(t *testing.T, run func()) {
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

	require.NoError(t, db.AutoMigrate(&User{}, &SubscriptionPlan{}, &SubscriptionOrder{}, &TopUp{}, &UserSubscription{}, &SubscriptionPreConsumeRecord{}, &Log{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestGetUserSubscriptionsByAdmin(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 10, Username: "admin_target", AffCode: "aff_sub_target", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&User{Id: 11, Username: "other_user", AffCode: "aff_sub_other", Status: common.UserStatusEnabled}).Error)

		require.NoError(t, DB.Create(&UserSubscription{Id: 1, UserId: 10, PlanId: 101, Source: "admin", Status: "active", StartTime: now - 3600, EndTime: now + 3600, CreatedAt: now - 1800, UpdatedAt: now - 1800}).Error)
		require.NoError(t, DB.Create(&UserSubscription{Id: 2, UserId: 10, PlanId: 102, Source: "order", Status: "cancelled", StartTime: now - 7200, EndTime: now + 7200, CreatedAt: now - 7000, UpdatedAt: now - 7000}).Error)
		require.NoError(t, DB.Create(&UserSubscription{Id: 3, UserId: 11, PlanId: 103, Source: "order", Status: "active", StartTime: now - 3600, EndTime: now + 3600, CreatedAt: now - 1700, UpdatedAt: now - 1700}).Error)

		pageInfo := &common.PageInfo{Page: 1, PageSize: 20}
		items, total, err := GetUserSubscriptionsByAdmin(10, pageInfo, "101", "active", now-4000, now)
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, 101, items[0].Subscription.PlanId)
		require.Equal(t, 10, items[0].Subscription.UserId)
	})
}

func TestCalcPlanEndTime_UsesRollingDurations(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	start := time.Date(2026, 4, 7, 11, 16, 46, 0, loc)

	dayEnd, err := calcPlanEndTime(start, &SubscriptionPlan{DurationUnit: SubscriptionDurationDay, DurationValue: 1})
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 4, 8, 11, 16, 46, 0, loc).Unix(), dayEnd)

	weekEnd, err := calcPlanEndTime(start, &SubscriptionPlan{DurationUnit: SubscriptionDurationWeek, DurationValue: 1})
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 4, 14, 11, 16, 46, 0, loc).Unix(), weekEnd)

	monthEnd, err := calcPlanEndTime(start, &SubscriptionPlan{DurationUnit: SubscriptionDurationMonth, DurationValue: 1})
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 5, 7, 11, 16, 46, 0, loc).Unix(), monthEnd)

	yearEnd, err := calcPlanEndTime(start, &SubscriptionPlan{DurationUnit: SubscriptionDurationYear, DurationValue: 1})
	require.NoError(t, err)
	require.Equal(t, time.Date(2027, 4, 7, 11, 16, 46, 0, loc).Unix(), yearEnd)
}

func TestCalcNextResetTime_UsesRollingResetPeriods(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	base := time.Date(2026, 4, 7, 11, 16, 46, 0, loc)

	daily := calcNextResetTime(base, &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetDaily}, 0)
	require.Equal(t, time.Date(2026, 4, 8, 11, 16, 46, 0, loc).Unix(), daily)

	weekly := calcNextResetTime(base, &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetWeekly}, 0)
	require.Equal(t, time.Date(2026, 4, 14, 11, 16, 46, 0, loc).Unix(), weekly)

	monthly := calcNextResetTime(base, &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetMonthly}, 0)
	require.Equal(t, time.Date(2026, 5, 7, 11, 16, 46, 0, loc).Unix(), monthly)

	yearly := calcNextResetTime(base, &SubscriptionPlan{QuotaResetPeriod: SubscriptionResetYearly}, 0)
	require.Equal(t, time.Date(2027, 4, 7, 11, 16, 46, 0, loc).Unix(), yearly)
}

func TestCalcNextResetTime_UsesFixedClockWhenConfigured(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	base := time.Date(2026, 4, 7, 11, 16, 46, 0, loc)

	daily := calcNextResetTime(base, &SubscriptionPlan{
		QuotaResetPeriod:        SubscriptionResetDaily,
		QuotaResetUseFixedClock: true,
		QuotaResetFixedSeconds:  8 * 3600,
	}, 0)
	require.Equal(t, time.Date(2026, 4, 8, 8, 0, 0, 0, loc).Unix(), daily)

	monthly := calcNextResetTime(base, &SubscriptionPlan{
		QuotaResetPeriod:        SubscriptionResetMonthly,
		QuotaResetUseFixedClock: true,
		QuotaResetFixedSeconds:  20*3600 + 30*60,
	}, 0)
	require.Equal(t, time.Date(2026, 5, 7, 20, 30, 0, 0, loc).Unix(), monthly)
}

func TestSyncActiveSubscriptionsForPlanTx(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                      201,
			Title:                   "daily-plan",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       300,
			QuotaResetPeriod:        SubscriptionResetDaily,
			QuotaResetCustomSeconds: 0,
			UpgradeGroup:            "vip",
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                301,
			UserId:            10,
			PlanId:            201,
			ResourceType:      SubscriptionResourceQuota,
			RequestCountTotal: 10,
			ResetPeriod:       SubscriptionResetNever,
			UpgradeGroup:      "",
			Status:            "active",
			StartTime:         now - 7200,
			EndTime:           now + 86400,
			LastResetTime:     0,
			NextResetTime:     0,
		}).Error)

		require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
			return SyncActiveSubscriptionsForPlanTx(tx, 201)
		}))

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 301).First(&sub).Error)
		require.Equal(t, SubscriptionResourceRequestCount, sub.ResourceType)
		require.EqualValues(t, 300, sub.RequestCountTotal)
		require.Equal(t, SubscriptionResetDaily, sub.ResetPeriod)
		require.Empty(t, sub.UpgradeGroup)
		require.NotZero(t, sub.NextResetTime)
	})
}

func TestCompleteSubscriptionOrder_UsesOrderSnapshot(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       30,
			Username: "snapshot_user",
			AffCode:  "snapshot_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      501,
			Title:                   "snapshot-plan-v1",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       5,
			QuotaResetPeriod:        SubscriptionResetDaily,
			QuotaResetCustomSeconds: 0,
			UpgradeGroup:            "vip-a",
			TotalAmount:             0,
		}
		require.NoError(t, DB.Create(plan).Error)

		order := &SubscriptionOrder{
			UserId:        30,
			PlanId:        501,
			Money:         9.9,
			TradeNo:       "snapshot-order-1",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", 501).Updates(map[string]interface{}{
			"title":               "snapshot-plan-v2",
			"duration_unit":       SubscriptionDurationDay,
			"duration_value":      3,
			"resource_type":       SubscriptionResourceQuota,
			"total_amount":        999,
			"request_count_total": 0,
			"upgrade_group":       "vip-b",
			"quota_reset_period":  SubscriptionResetNever,
			"sale_limit_count":    1,
			"sold_count":          1,
			"updated_at":          now + 1,
		}).Error)

		require.NoError(t, CompleteSubscriptionOrder("snapshot-order-1", `{"ok":true}`))

		var sub UserSubscription
		require.NoError(t, DB.Where("user_id = ? AND plan_id = ?", 30, 501).First(&sub).Error)
		require.Equal(t, SubscriptionResourceRequestCount, sub.ResourceType)
		require.EqualValues(t, 5, sub.RequestCountTotal)
		require.EqualValues(t, 0, sub.AmountTotal)
		require.Equal(t, SubscriptionResetDaily, sub.ResetPeriod)
		require.Equal(t, "vip-a", sub.UpgradeGroup)
		require.NotZero(t, sub.NextResetTime)
		require.GreaterOrEqual(t, sub.EndTime-sub.StartTime, int64(28*24*3600))

		var user User
		require.NoError(t, DB.Where("id = ?", 30).First(&user).Error)
		require.Equal(t, "vip-a", user.Group)

		var topup TopUp
		require.NoError(t, DB.Where("trade_no = ?", "snapshot-order-1").First(&topup).Error)
		require.Equal(t, common.TopUpStatusSuccess, topup.Status)
	})
}

func TestRefreshActiveSubscriptionResetWindows_RecalculatesLegacyWindow(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		startTime := now - 2*24*3600
		expectedSub := &UserSubscription{
			ResetPeriod:   SubscriptionResetDaily,
			StartTime:     startTime,
			EndTime:       now + 10*24*3600,
			LastResetTime: 0,
			NextResetTime: startTime + 24*3600 + 8*3600,
		}
		recalculateSubscriptionResetWindow(expectedSub, now)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:               601,
			UserId:           99,
			PlanId:           201,
			ResetPeriod:      SubscriptionResetDaily,
			Status:           "active",
			StartTime:        startTime,
			EndTime:          now + 10*24*3600,
			LastResetTime:    0,
			NextResetTime:    startTime + 24*3600 + 8*3600,
			RequestCountUsed: 3,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:            602,
			UserId:        99,
			PlanId:        201,
			ResetPeriod:   SubscriptionResetDaily,
			Status:        "cancelled",
			StartTime:     startTime,
			EndTime:       now + 10*24*3600,
			LastResetTime: 0,
			NextResetTime: startTime + 24*3600 + 8*3600,
		}).Error)

		updated, err := RefreshActiveSubscriptionResetWindows(50)
		require.NoError(t, err)
		require.EqualValues(t, 1, updated)

		var activeSub UserSubscription
		require.NoError(t, DB.Where("id = ?", 601).First(&activeSub).Error)
		require.EqualValues(t, expectedSub.NextResetTime, activeSub.NextResetTime)
		require.EqualValues(t, expectedSub.LastResetTime, activeSub.LastResetTime)
		require.EqualValues(t, 0, activeSub.RequestCountUsed)

		var cancelledSub UserSubscription
		require.NoError(t, DB.Where("id = ?", 602).First(&cancelledSub).Error)
		require.EqualValues(t, startTime+24*3600+8*3600, cancelledSub.NextResetTime)
	})
}

func TestResetDueSubscriptions_ResetsFinalCycleUsage(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		lastResetTime := now - 24*3600

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                701,
			Title:             "final-cycle-daily",
			DurationUnit:      SubscriptionDurationDay,
			DurationValue:     7,
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 400,
			QuotaResetPeriod:  SubscriptionResetDaily,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                702,
			UserId:            88,
			PlanId:            701,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 400,
			RequestCountUsed:  123,
			ResetPeriod:       SubscriptionResetDaily,
			Status:            "active",
			StartTime:         now - 6*24*3600,
			EndTime:           now + 3600,
			LastResetTime:     lastResetTime,
			NextResetTime:     now - 60,
		}).Error)

		resetCount, err := ResetDueSubscriptions(10)
		require.NoError(t, err)
		require.EqualValues(t, 1, resetCount)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 702).First(&sub).Error)
		require.EqualValues(t, 0, sub.RequestCountUsed)
		require.EqualValues(t, 0, sub.AmountUsed)
		require.Greater(t, sub.LastResetTime, lastResetTime)
		require.EqualValues(t, 0, sub.NextResetTime)
	})
}

func TestRefreshActiveSubscriptionResetWindows_ReconcilesNonResetRequestCountAndExpiresExhausted(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 88, Username: "reconcile_non_reset", AffCode: "aff_reconcile_non_reset", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                801,
			UserId:            88,
			PlanId:            701,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 3,
			RequestCountUsed:  0,
			ResetPeriod:       SubscriptionResetNever,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 3600,
		}).Error)

		for i := 0; i < 3; i++ {
			other := `{"billing_source":"subscription","subscription_id":801,"subscription_plan_id":701,"subscription_consumed":1,"subscription_resource_type":"request_count"}`
			require.NoError(t, DB.Create(&Log{
				Id:        900 + i,
				UserId:    88,
				Type:      LogTypeConsume,
				CreatedAt: now - int64(180-i*30),
				Other:     other,
			}).Error)
		}

		updated, err := RefreshActiveSubscriptionResetWindows(50)
		require.NoError(t, err)
		require.EqualValues(t, 1, updated)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 801).First(&sub).Error)
		require.EqualValues(t, 3, sub.RequestCountUsed)
		require.Equal(t, "expired", sub.Status)
	})
}

func TestRefreshActiveSubscriptionResetWindows_ReconcilesCurrentCycleUsageWithoutExpiringResettableSubscription(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		lastReset := now - 1800

		require.NoError(t, DB.Create(&User{Id: 89, Username: "reconcile_resettable", AffCode: "aff_reconcile_resettable", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                802,
			UserId:            89,
			PlanId:            702,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 2,
			RequestCountUsed:  0,
			ResetPeriod:       SubscriptionResetDaily,
			Status:            "active",
			StartTime:         now - 86400,
			EndTime:           now + 86400,
			LastResetTime:     lastReset,
			NextResetTime:     now + 1800,
		}).Error)

		other := `{"billing_source":"subscription","subscription_id":802,"subscription_plan_id":702,"subscription_consumed":1,"subscription_resource_type":"request_count"}`
		require.NoError(t, DB.Create(&Log{
			Id:        950,
			UserId:    89,
			Type:      LogTypeConsume,
			CreatedAt: now - 600,
			Other:     other,
		}).Error)

		updated, err := RefreshActiveSubscriptionResetWindows(50)
		require.NoError(t, err)
		require.EqualValues(t, 1, updated)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 802).First(&sub).Error)
		require.EqualValues(t, 1, sub.RequestCountUsed)
		require.Equal(t, "active", sub.Status)
	})
}

func TestRefreshActiveSubscriptionResetWindows_MergesLegacyLogsAndPreConsumeWithoutDoubleCounting(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 91, Username: "mixed_usage_user", AffCode: "aff_mixed_usage_user", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                804,
			UserId:            91,
			PlanId:            704,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 10,
			RequestCountUsed:  0,
			ResetPeriod:       SubscriptionResetNever,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 3600,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPreConsumeRecord{
			Id:                 1,
			RequestId:          "req-dup",
			UserId:             91,
			UserSubscriptionId: 804,
			PreConsumed:        1,
			PreConsumedCount:   1,
			Status:             "consumed",
			CreatedAt:          now - 120,
			UpdatedAt:          now - 120,
		}).Error)

		legacyOther := `{"billing_source":"subscription","subscription_id":804,"subscription_plan_id":704,"subscription_consumed":1,"subscription_resource_type":"request_count"}`
		require.NoError(t, DB.Create(&Log{
			Id:        960,
			UserId:    91,
			Type:      LogTypeConsume,
			RequestId: "",
			CreatedAt: now - 240,
			Other:     legacyOther,
		}).Error)
		require.NoError(t, DB.Create(&Log{
			Id:        961,
			UserId:    91,
			Type:      LogTypeConsume,
			RequestId: "req-dup",
			CreatedAt: now - 120,
			Other:     legacyOther,
		}).Error)

		updated, err := RefreshActiveSubscriptionResetWindows(50)
		require.NoError(t, err)
		require.EqualValues(t, 1, updated)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 804).First(&sub).Error)
		require.EqualValues(t, 2, sub.RequestCountUsed)
		require.Equal(t, "active", sub.Status)
	})
}

func TestHasUsableUserSubscription_IgnoresExhaustedSubscriptions(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 90, Username: "usable_sub_user", AffCode: "aff_usable_sub_user", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                803,
			UserId:            90,
			PlanId:            703,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 1,
			RequestCountUsed:  1,
			ResetPeriod:       SubscriptionResetNever,
			Status:            "active",
			StartTime:         now - 300,
			EndTime:           now + 3600,
		}).Error)

		hasUsable, err := HasUsableUserSubscription(90)
		require.NoError(t, err)
		require.False(t, hasUsable)
	})
}

func TestHasUsableUserSubscription_RecognizesNoExpirySubscription(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 91, Username: "no_expiry_sub_user", AffCode: "aff_no_expiry_sub_user", Status: common.UserStatusEnabled}).Error)
		// end_time = 0 means "never expires"
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                804,
			UserId:            91,
			PlanId:            704,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 10,
			RequestCountUsed:  3,
			ResetPeriod:       SubscriptionResetNever,
			Status:            "active",
			StartTime:         now - 300,
			EndTime:           0, // never expires
		}).Error)

		hasUsable, err := HasUsableUserSubscription(91)
		require.NoError(t, err)
		require.True(t, hasUsable)
	})
}

func TestSummarizeSubscriptionConsumeLogs_IgnoresZeroConsumedRecords(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{Id: 20, Username: "summary_user", AffCode: "summary_aff", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:                401,
			UserId:            20,
			PlanId:            201,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 100,
			RequestCountUsed:  1,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 3600,
		}).Error)

		zeroOther := `{"billing_source":"subscription","subscription_id":401,"subscription_plan_id":201,"subscription_consumed":0,"subscription_resource_type":"request_count"}`
		usedOther := `{"billing_source":"subscription","subscription_id":401,"subscription_plan_id":201,"subscription_consumed":1,"subscription_resource_type":"request_count"}`
		require.NoError(t, DB.Create(&Log{Id: 1, UserId: 20, Type: LogTypeConsume, CreatedAt: now - 60, Other: zeroOther}).Error)
		require.NoError(t, DB.Create(&Log{Id: 2, UserId: 20, Type: LogTypeConsume, CreatedAt: now - 30, Other: usedOther}).Error)

		_, _, summary, err := GetSubscriptionConsumeLogs(20, 401, 0, 0, 0, 0, 0, 20)
		require.NoError(t, err)
		require.NotNil(t, summary)
		require.EqualValues(t, 1, summary.TotalSuccessCount)
		require.EqualValues(t, 1, summary.TodaySuccessCount)
		require.EqualValues(t, 1, summary.TotalRequestConsumed)
		require.EqualValues(t, 1, summary.TodayRequestConsumed)
	})
}
