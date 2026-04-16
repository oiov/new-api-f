package model

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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

	require.NoError(t, db.AutoMigrate(&User{}, &Channel{}, &SubscriptionPlan{}, &SubscriptionOrder{}, &TopUp{}, &UserSubscription{}, &SubscriptionDayPassPlan{}, &SubscriptionPreConsumeRecord{}, &Token{}, &Log{}, &EcomAgentAccount{}))

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

func TestBuildSubscriptionQuotaInsufficientMessage_RequestCount(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	resetAt := time.Date(2026, 4, 12, 8, 0, 0, 0, loc).Unix()

	sub := &UserSubscription{
		ResourceType:            SubscriptionResourceRequestCount,
		RequestCountTotal:       15000,
		RequestCountUsed:        15000,
		RequestCountPeriodTotal: 500,
		RequestCountPeriodUsed:  500,
		ResetPeriod:             SubscriptionResetDaily,
		NextResetTime:           resetAt,
	}

	msg := buildSubscriptionQuotaInsufficientMessage(sub, 445000)
	require.Contains(t, msg, "套餐总次数 15000/15000（100.00%）")
	require.Contains(t, msg, "今日次数 500/500（100.00%）")
	require.Contains(t, msg, "下次重置时间 2026-04-12 08:00:00")
}

func TestBuildSubscriptionQuotaInsufficientMessage_Quota(t *testing.T) {
	sub := &UserSubscription{
		ResourceType: SubscriptionResourceQuota,
		AmountTotal:  1000,
		AmountUsed:   1000,
	}

	msg := buildSubscriptionQuotaInsufficientMessage(sub, 1200)
	require.Contains(t, msg, "套餐额度 1000/1000（100.00%）")
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

func TestAdminRejectManualDeliveryOrder_RefundsQuotaOnlyOnce(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		oldQuotaPerUnit := common.QuotaPerUnit
		oldQuotaDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
		oldUSDExchangeRate := operation_setting.USDExchangeRate
		common.QuotaPerUnit = 100
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
		operation_setting.USDExchangeRate = 5
		defer func() {
			common.QuotaPerUnit = oldQuotaPerUnit
			operation_setting.GetGeneralSetting().QuotaDisplayType = oldQuotaDisplayType
			operation_setting.USDExchangeRate = oldUSDExchangeRate
		}()

		require.NoError(t, DB.Create(&User{
			Id:       99,
			Username: "manual_refund_user",
			AffCode:  "manual_refund_aff",
			Status:   common.UserStatusEnabled,
			Quota:    50,
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                88,
			UserId:            99,
			PlanId:            7,
			Money:             12.5,
			TradeNo:           "manual-refund-order",
			PaymentMethod:     "alipay",
			Status:            common.TopUpStatusSuccess,
			PlanTitle:         "manual-plan",
			PlanDeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			FulfillmentStatus: SubscriptionFulfillmentPending,
		}).Error)

		order, err := AdminRejectManualDeliveryOrder(88, 3, "库存不足", true)
		require.NoError(t, err)
		require.NotNil(t, order)
		require.True(t, order.RefundToQuota)
		require.EqualValues(t, 250, order.RefundQuotaAmount)

		var user User
		require.NoError(t, DB.Where("id = ?", 99).First(&user).Error)
		require.EqualValues(t, 300, user.Quota)

		order, err = AdminRejectManualDeliveryOrder(88, 3, "补充说明", true)
		require.NoError(t, err)
		require.NotNil(t, order)
		require.EqualValues(t, 250, order.RefundQuotaAmount)

		require.NoError(t, DB.Where("id = ?", 99).First(&user).Error)
		require.EqualValues(t, 300, user.Quota)

		var logs []Log
		require.NoError(t, DB.Where("user_id = ?", 99).Order("id asc").Find(&logs).Error)
		require.Len(t, logs, 2)
		require.Equal(t, LogTypeRefund, logs[0].Type)
		require.Contains(t, logs[0].Content, "已返还余额额度: 250")
		require.Equal(t, LogTypeManage, logs[1].Type)
		require.Contains(t, logs[1].Content, "该订单已返还余额额度: 250")
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

		var logs []Log
		require.NoError(t, DB.Where("user_id = ?", 30).Order("id asc").Find(&logs).Error)
		require.Len(t, logs, 1)
		require.Equal(t, LogTypeSubscription, logs[0].Type)
		require.Contains(t, logs[0].Content, "订阅购买成功")
		require.Contains(t, logs[0].Content, "snapshot-plan-v1")
	})
}

func TestCountUserPlanPurchases_IgnoresRejectedManualDeliveryOrders(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       31,
			Username: "purchase_count_user",
			AffCode:  "purchase_count_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            502,
			Title:         "manual-delivery-plan",
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			Enabled:       true,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			DeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			CreatedAt:     now,
			UpdatedAt:     now,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:        901,
			UserId:    31,
			PlanId:    502,
			Status:    "active",
			StartTime: now - 3600,
			EndTime:   now + 86400,
			CreatedAt: now,
			UpdatedAt: now,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                902,
			UserId:            31,
			PlanId:            502,
			TradeNo:           "manual-delivery-approved",
			Status:            common.TopUpStatusSuccess,
			PlanDeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			FulfillmentStatus: SubscriptionFulfillmentPending,
			CreateTime:        now,
			CompleteTime:      now,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                903,
			UserId:            31,
			PlanId:            502,
			TradeNo:           "manual-delivery-rejected",
			Status:            common.TopUpStatusSuccess,
			PlanDeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			FulfillmentStatus: SubscriptionFulfillmentRejected,
			CreateTime:        now,
			CompleteTime:      now,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                904,
			UserId:            31,
			PlanId:            502,
			TradeNo:           "manual-delivery-auto",
			Status:            common.TopUpStatusSuccess,
			PlanDeliveryMode:  SubscriptionDeliveryModeAutoActivate,
			FulfillmentStatus: SubscriptionFulfillmentNotRequired,
			CreateTime:        now,
			CompleteTime:      now,
		}).Error)

		count, err := CountUserPlanPurchases(31, 502)
		require.NoError(t, err)
		require.EqualValues(t, 2, count)
	})
}

func TestCompleteSubscriptionOrder_ManualDeliveryDoesNotCreateSubscription(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schema := []SubscriptionDeliveryField{
			{Key: "endpoint", Label: "接口地址", Type: "text", Required: true},
		}
		schemaJSON, err := encodeSubscriptionDeliveryFields(schema)
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       31,
			Username: "manual_delivery_user",
			AffCode:  "manual_delivery_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      502,
			Title:                   "manual-delivery-plan",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       50,
			QuotaResetPeriod:        SubscriptionResetNever,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
		}
		require.NoError(t, DB.Create(plan).Error)

		order := &SubscriptionOrder{
			UserId:        31,
			PlanId:        502,
			Money:         19.9,
			TradeNo:       "manual-delivery-order-1",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		require.NoError(t, CompleteSubscriptionOrder("manual-delivery-order-1", `{"ok":true}`))

		storedOrder := GetSubscriptionOrderByTradeNo("manual-delivery-order-1")
		require.NotNil(t, storedOrder)
		require.Equal(t, common.TopUpStatusSuccess, storedOrder.Status)
		require.Equal(t, SubscriptionDeliveryModeManualDelivery, storedOrder.PlanDeliveryMode)
		require.Equal(t, SubscriptionFulfillmentPending, storedOrder.FulfillmentStatus)

		var subCount int64
		require.NoError(t, DB.Model(&UserSubscription{}).
			Where("user_id = ? AND plan_id = ?", 31, 502).
			Count(&subCount).Error)
		require.Zero(t, subCount)

		var topUpCount int64
		require.NoError(t, DB.Model(&TopUp{}).
			Where("trade_no = ?", "manual-delivery-order-1").
			Count(&topUpCount).Error)
		require.Zero(t, topUpCount)
	})
}

func TestCountUserPlanPurchases_ExcludesRejectedManualOrders(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		require.NoError(t, DB.Create(&User{
			Id:       32,
			Username: "purchase_count_user",
			AffCode:  "purchase_count_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:           801,
			UserId:       32,
			PlanId:       503,
			Status:       "active",
			StartTime:    common.GetTimestamp() - 3600,
			EndTime:      common.GetTimestamp() + 3600,
			CreatedAt:    common.GetTimestamp(),
			UpdatedAt:    common.GetTimestamp(),
			Source:       "order",
			ResourceType: SubscriptionResourceQuota,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                901,
			UserId:            32,
			PlanId:            503,
			TradeNo:           "purchase-count-delivered",
			Status:            common.TopUpStatusSuccess,
			PlanDeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			FulfillmentStatus: SubscriptionFulfillmentDelivered,
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:                902,
			UserId:            32,
			PlanId:            503,
			TradeNo:           "purchase-count-rejected",
			Status:            common.TopUpStatusSuccess,
			PlanDeliveryMode:  SubscriptionDeliveryModeManualDelivery,
			FulfillmentStatus: SubscriptionFulfillmentRejected,
		}).Error)

		count, err := CountUserPlanPurchases(32, 503)
		require.NoError(t, err)
		require.EqualValues(t, 2, count)
	})
}

func TestCountUserPlanPurchases_ExcludesDerivedDayPass(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       34,
			Username: "derived_day_pass_count_user",
			AffCode:  "derived_day_pass_count_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                       811,
			UserId:                   34,
			PlanId:                   504,
			Status:                   "active",
			StartTime:                now - 3600,
			EndTime:                  now + 86400,
			CreatedAt:                now,
			UpdatedAt:                now,
			Source:                   SubscriptionSourceOrder,
			ResourceType:             SubscriptionResourceRequestCount,
			RequestCountTotal:        100,
			ParentUserSubscriptionId: 0,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                       812,
			UserId:                   34,
			PlanId:                   504,
			Status:                   "active",
			StartTime:                now - 1800,
			EndTime:                  now + 3600,
			CreatedAt:                now,
			UpdatedAt:                now,
			Source:                   SubscriptionSourceDerivedDayPass,
			ResourceType:             SubscriptionResourceRequestCount,
			RequestCountTotal:        10,
			ParentUserSubscriptionId: 811,
		}).Error)

		count, err := CountUserPlanPurchases(34, 504)
		require.NoError(t, err)
		require.EqualValues(t, 1, count)
	})
}

func TestCreateDerivedDayPassFromSubscription(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       35,
			Username: "derived_day_pass_user",
			AffCode:  "derived_day_pass_aff",
			Group:    "vip",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                505,
			Title:             "monthly-request-plan",
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 300,
			UpgradeGroup:      "vip",
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      813,
			UserId:                  35,
			PlanId:                  505,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 20*24*3600,
			CreatedAt:               now,
			UpdatedAt:               now,
			Source:                  SubscriptionSourceOrder,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       300,
			RequestCountUsed:        120,
			ResetPeriod:             SubscriptionResetNever,
			AggregateEnabled:        true,
			SpecificChannelId:       9,
			SpecificChannelKeyIndex: 2,
			UpgradeGroup:            "vip",
		}).Error)

		result, err := CreateDerivedDayPassFromSubscription(35, 813, 50)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.NotNil(t, result.ParentSubscription)
		require.NotNil(t, result.DayPass)
		require.EqualValues(t, 50, result.TransferredCount)
		require.Equal(t, SubscriptionSourceDerivedDayPass, result.DayPass.Source)
		require.EqualValues(t, 813, result.DayPass.ParentUserSubscriptionId)
		require.EqualValues(t, 50, result.DayPass.RequestCountTotal)
		require.EqualValues(t, 170, result.ParentSubscription.RequestCountUsed)
		require.EqualValues(t, 130, result.ParentRemainCount)
		require.EqualValues(t, 9, result.DayPass.SpecificChannelId)
		require.EqualValues(t, 2, result.DayPass.SpecificChannelKeyIndex)

		var storedChild UserSubscription
		require.NoError(t, DB.Where("id = ?", result.DayPass.Id).First(&storedChild).Error)
		require.Equal(t, SubscriptionDurationDay, storedChild.DurationUnit)
		require.Equal(t, SubscriptionResetNever, storedChild.ResetPeriod)
	})
}

func TestPreConsumeUserSubscription_PrefersDerivedDayPass(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       36,
			Username: "derived_day_pass_priority_user",
			AffCode:  "derived_day_pass_priority_aff",
			Group:    "vip",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                506,
			Title:             "priority-plan",
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 500,
			UpgradeGroup:      "vip",
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      814,
			UserId:                  36,
			PlanId:                  506,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 30*24*3600,
			CreatedAt:               now,
			UpdatedAt:               now,
			Source:                  SubscriptionSourceOrder,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       500,
			RequestCountUsed:        10,
			ResetPeriod:             SubscriptionResetNever,
			AggregateEnabled:        true,
			SpecificChannelId:       11,
			SpecificChannelKeyIndex: 0,
			UpgradeGroup:            "vip",
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                       815,
			UserId:                   36,
			PlanId:                   506,
			ParentUserSubscriptionId: 814,
			Status:                   "active",
			StartTime:                now - 600,
			EndTime:                  now + 3600,
			CreatedAt:                now,
			UpdatedAt:                now,
			Source:                   SubscriptionSourceDerivedDayPass,
			ResourceType:             SubscriptionResourceRequestCount,
			RequestCountTotal:        20,
			RequestCountUsed:         0,
			ResetPeriod:              SubscriptionResetNever,
			AggregateEnabled:         true,
			SpecificChannelId:        11,
			SpecificChannelKeyIndex:  0,
			UpgradeGroup:             "vip",
		}).Error)

		result, err := PreConsumeUserSubscription("derived-day-pass-priority", 36, "", "", 0, 1)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.EqualValues(t, 815, result.UserSubscriptionId)

		var child UserSubscription
		require.NoError(t, DB.Where("id = ?", 815).First(&child).Error)
		require.EqualValues(t, 1, child.RequestCountUsed)

		var parent UserSubscription
		require.NoError(t, DB.Where("id = ?", 814).First(&parent).Error)
		require.EqualValues(t, 10, parent.RequestCountUsed)
	})
}

func TestCreateDerivedDayPassPlan(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       37,
			Username: "derived_day_pass_plan_user",
			AffCode:  "derived_day_pass_plan_aff",
			Group:    "vip",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                507,
			Title:             "batch-day-pass-parent",
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 600,
			UpgradeGroup:      "vip",
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                816,
			UserId:            37,
			PlanId:            507,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 25*24*3600,
			CreatedAt:         now,
			UpdatedAt:         now,
			Source:            SubscriptionSourceOrder,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 600,
			RequestCountUsed:  100,
			ResetPeriod:       SubscriptionResetNever,
			AggregateEnabled:  true,
			UpgradeGroup:      "vip",
		}).Error)

		result, err := CreateDerivedDayPassPlan(37, 816, 5, 20)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.NotNil(t, result.Plan)
		require.Equal(t, SubscriptionDayPassPlanStatusActive, result.Plan.Status)
		require.EqualValues(t, 5, result.Plan.TotalDays)
		require.EqualValues(t, 20, result.Plan.RequestCountPerDay)
		require.EqualValues(t, 100, result.Plan.TotalRequestCount)
		require.EqualValues(t, 500, result.ParentRemainCount)
		require.NotZero(t, result.Plan.NextGenerateAt)
		require.Equal(t, "Asia/Shanghai", result.Plan.Timezone)

		var stored SubscriptionDayPassPlan
		require.NoError(t, DB.Where("id = ?", result.Plan.Id).First(&stored).Error)
		require.EqualValues(t, 0, stored.GeneratedDays)
		require.EqualValues(t, 0, stored.GeneratedRequestCount)
	})
}

func TestProcessDueDerivedDayPassPlans(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       38,
			Username: "derived_day_pass_plan_process_user",
			AffCode:  "derived_day_pass_plan_process_aff",
			Group:    "vip",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:                508,
			Title:             "batch-day-pass-process-parent",
			DurationUnit:      SubscriptionDurationMonth,
			DurationValue:     1,
			Enabled:           true,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 300,
			UpgradeGroup:      "vip",
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      817,
			UserId:                  38,
			PlanId:                  508,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 20*24*3600,
			CreatedAt:               now,
			UpdatedAt:               now,
			Source:                  SubscriptionSourceOrder,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       300,
			RequestCountUsed:        10,
			ResetPeriod:             SubscriptionResetNever,
			AggregateEnabled:        true,
			SpecificChannelId:       13,
			SpecificChannelKeyIndex: 3,
			UpgradeGroup:            "vip",
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionDayPassPlan{
			Id:                       901,
			UserId:                   38,
			ParentUserSubscriptionId: 817,
			Status:                   SubscriptionDayPassPlanStatusActive,
			Mode:                     SubscriptionDayPassPlanModeFixedDaily,
			TotalDays:                1,
			GeneratedDays:            0,
			RequestCountPerDay:       30,
			TotalRequestCount:        30,
			GeneratedRequestCount:    0,
			Timezone:                 "Asia/Shanghai",
			StartDate:                formatSubscriptionPlanDate(now),
			EndDate:                  formatSubscriptionPlanDate(now),
			NextGenerateAt:           now - 10,
			LastGenerateAt:           0,
		}).Error)

		processed, err := ProcessDueDerivedDayPassPlans(10)
		require.NoError(t, err)
		require.EqualValues(t, 1, processed)

		var child UserSubscription
		require.NoError(t, DB.Where("parent_user_subscription_id = ? AND source = ?", 817, SubscriptionSourceDerivedDayPass).First(&child).Error)
		require.EqualValues(t, 30, child.RequestCountTotal)
		require.EqualValues(t, 13, child.SpecificChannelId)
		require.EqualValues(t, 3, child.SpecificChannelKeyIndex)

		var parent UserSubscription
		require.NoError(t, DB.Where("id = ?", 817).First(&parent).Error)
		require.EqualValues(t, 40, parent.RequestCountUsed)

		var plan SubscriptionDayPassPlan
		require.NoError(t, DB.Where("id = ?", 901).First(&plan).Error)
		require.Equal(t, SubscriptionDayPassPlanStatusCompleted, plan.Status)
		require.EqualValues(t, 1, plan.GeneratedDays)
		require.EqualValues(t, 30, plan.GeneratedRequestCount)
		require.EqualValues(t, 0, plan.NextGenerateAt)
	})
}

func TestGetAdminSubscriptionDayPassPlans(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       39,
			Username: "admin_day_pass_plan_user",
			AffCode:  "admin_day_pass_plan_aff",
			Group:    "vip",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                818,
			UserId:            39,
			PlanId:            509,
			Status:            "active",
			StartTime:         now - 3600,
			EndTime:           now + 86400,
			CreatedAt:         now,
			UpdatedAt:         now,
			ResourceType:      SubscriptionResourceRequestCount,
			RequestCountTotal: 500,
			RequestCountUsed:  100,
			Source:            SubscriptionSourceOrder,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionDayPassPlan{
			Id:                       902,
			UserId:                   39,
			ParentUserSubscriptionId: 818,
			Status:                   SubscriptionDayPassPlanStatusActive,
			Mode:                     SubscriptionDayPassPlanModeFixedDaily,
			TotalDays:                5,
			RequestCountPerDay:       20,
			TotalRequestCount:        100,
			Timezone:                 "Asia/Shanghai",
			StartDate:                "2026-04-16",
			EndDate:                  "2026-04-20",
			NextGenerateAt:           now + 3600,
		}).Error)

		items, total, err := GetAdminSubscriptionDayPassPlans(&common.PageInfo{Page: 1, PageSize: 10}, "admin_day_pass_plan_user", "active")
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, "admin_day_pass_plan_user", items[0].Username)
		require.Equal(t, "vip", items[0].UserGroup)
		require.NotNil(t, items[0].ParentSubscription)
		require.EqualValues(t, 818, items[0].ParentSubscription.Id)
	})
}

func TestAdminCancelDerivedDayPassPlan(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&SubscriptionDayPassPlan{
			Id:                       903,
			UserId:                   40,
			ParentUserSubscriptionId: 819,
			Status:                   SubscriptionDayPassPlanStatusActive,
			Mode:                     SubscriptionDayPassPlanModeFixedDaily,
			TotalDays:                3,
			RequestCountPerDay:       15,
			TotalRequestCount:        45,
			Timezone:                 "Asia/Shanghai",
			StartDate:                "2026-04-16",
			EndDate:                  "2026-04-18",
			NextGenerateAt:           now + 1800,
		}).Error)

		result, err := AdminCancelDerivedDayPassPlan(903)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionDayPassPlanStatusCancelled, result.Status)
		require.EqualValues(t, 0, result.NextGenerateAt)

		var stored SubscriptionDayPassPlan
		require.NoError(t, DB.Where("id = ?", 903).First(&stored).Error)
		require.Equal(t, SubscriptionDayPassPlanStatusCancelled, stored.Status)
		require.EqualValues(t, 0, stored.NextGenerateAt)
	})
}

func TestAdminDeliverManualDeliveryOrder_UsesOrderSnapshotSchema(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		oldSchema := []SubscriptionDeliveryField{
			{Key: "endpoint", Label: "接口地址", Type: "text", Required: true, Copyable: true},
		}
		oldSchemaJSON, err := encodeSubscriptionDeliveryFields(oldSchema)
		require.NoError(t, err)
		newSchema := []SubscriptionDeliveryField{
			{Key: "license", Label: "许可证", Type: "text", Required: true},
		}
		newSchemaJSON, err := encodeSubscriptionDeliveryFields(newSchema)
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       33,
			Username: "manual_schema_user",
			AffCode:  "manual_schema_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      504,
			Title:                   "manual-schema-plan",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceQuota,
			TotalAmount:             1000,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: oldSchemaJSON,
		}
		require.NoError(t, DB.Create(plan).Error)

		order := &SubscriptionOrder{
			Id:            903,
			UserId:        33,
			PlanId:        504,
			Money:         29.9,
			TradeNo:       "manual-schema-order-1",
			PaymentMethod: "epay",
			CreateTime:    now,
			CompleteTime:  now,
			Status:        common.TopUpStatusSuccess,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		require.NoError(t, DB.Model(&SubscriptionPlan{}).
			Where("id = ?", 504).
			Update("delivery_field_schema_json", newSchemaJSON).Error)

		result, err := AdminDeliverManualDeliveryOrder(903, 7, []SubscriptionDeliveryPayloadItem{
			{Key: "endpoint", Label: "接口地址", Type: "text", Value: "https://example.com"},
		}, "已发放")
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionFulfillmentDelivered, result.FulfillmentStatus)
		require.Len(t, result.DeliveryPayload, 1)
		require.Equal(t, "endpoint", result.DeliveryPayload[0].Key)
		require.Equal(t, "https://example.com", result.DeliveryPayload[0].Value)
	})
}

func TestAdminDeliverManualDeliveryOrder_BuildsSchemaFromPayloadWhenSnapshotMissing(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       34,
			Username: "manual_payload_schema_user",
			AffCode:  "manual_payload_schema_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:            505,
			Title:         "manual-payload-schema-plan",
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			Enabled:       true,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			DeliveryMode:  SubscriptionDeliveryModeManualDelivery,
		}
		require.NoError(t, DB.Create(plan).Error)

		order := &SubscriptionOrder{
			Id:            904,
			UserId:        34,
			PlanId:        505,
			Money:         19.9,
			TradeNo:       "manual-schema-order-2",
			PaymentMethod: "epay",
			CreateTime:    now,
			CompleteTime:  now,
			Status:        common.TopUpStatusSuccess,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		payload := []SubscriptionDeliveryPayloadItem{
			{Key: "api_key", Label: "API Key", Type: "text", Value: "sk-test-123", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Value: "https://example.com"},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Value: "https://usage.example.com"},
		}
		result, err := AdminDeliverManualDeliveryOrder(order.Id, 7, payload, "")
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionFulfillmentDelivered, result.FulfillmentStatus)
		require.Len(t, result.DeliveryPayload, 3)
		require.Equal(t, "api_key", result.DeliveryPayload[0].Key)
		require.Equal(t, "sk-test-123", result.DeliveryPayload[0].Value)
	})
}

func TestCompleteSubscriptionOrder_ReservesPlaceholderSlotForClaudeManualDelivery(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       66,
			Username: "claude_manual_user",
			AffCode:  "claude_manual_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1504,
			Title:                   "Claude Manual Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       2000,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_manual",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8001,
			Name:        "Claude Fixed Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_manual",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order := &SubscriptionOrder{
			Id:            9901,
			UserId:        66,
			PlanId:        plan.Id,
			Money:         29.9,
			TradeNo:       "claude-manual-order-1",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, `{"ok":true}`))

		var storedOrder SubscriptionOrder
		require.NoError(t, DB.Where("id = ?", order.Id).First(&storedOrder).Error)
		require.Equal(t, common.TopUpStatusSuccess, storedOrder.Status)
		require.Equal(t, SubscriptionFulfillmentPending, storedOrder.FulfillmentStatus)
		require.Equal(t, 8001, storedOrder.ReservedChannelId)
		require.Equal(t, 1, storedOrder.ReservedChannelKeyIndex)

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 8001).First(&storedChannel).Error)
		keys := storedChannel.GetKeys()
		require.Len(t, keys, 2)
		require.Equal(t, "seed-key-1", keys[0])
		require.Contains(t, keys[1], "reserved:sub_order:9901:user:66:")
	})
}

func TestAdminDeliverManualDeliveryOrder_ReplacesReservedPlaceholderWithRealKey(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       67,
			Username: "claude_deliver_user",
			AffCode:  "claude_deliver_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1505,
			Title:                   "Claude Deliver Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       3000,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_deliver",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8002,
			Name:        "Claude Fixed Deliver Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_deliver",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order := &SubscriptionOrder{
			Id:            9902,
			UserId:        67,
			PlanId:        plan.Id,
			Money:         39.9,
			TradeNo:       "claude-manual-order-2",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, `{"ok":true}`))

		result, err := AdminDeliverManualDeliveryOrder(order.Id, 7, []SubscriptionDeliveryPayloadItem{
			{Key: "api_key", Label: "API Key", Type: "text", Value: "real-upstream-key-123"},
			{Key: "base_url", Label: "Base URL", Type: "text", Value: "https://console.example.com"},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Value: "https://usage.example.com"},
		}, "完成发放")
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionFulfillmentDelivered, result.FulfillmentStatus)
		require.Len(t, result.DeliveryPayload, 3)
		require.True(t, strings.HasPrefix(result.DeliveryPayload[0].Value, "sk-"))

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 8002).First(&storedChannel).Error)
		keys := storedChannel.GetKeys()
		require.Len(t, keys, 2)
		require.Equal(t, "seed-key-1", keys[0])
		require.Equal(t, "real-upstream-key-123", keys[1])

		var sub UserSubscription
		require.NoError(t, DB.Where("source_order_id = ?", order.Id).First(&sub).Error)
		require.Equal(t, 8002, sub.SpecificChannelId)
		require.Equal(t, 1, sub.SpecificChannelKeyIndex)
	})
}

func TestGetAggregateSubscriptionRouteForPreferredSubscription(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       88,
			Username: "preferred_sub_route_user",
			AffCode:  "preferred_sub_route_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&Channel{
			Id:          8801,
			Name:        "Preferred Route Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-preferred-1\nseed-key-preferred-2",
			Group:       "sub_plan_claude_lite",
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 2,
			},
		}).Error)

		sub := &UserSubscription{
			Id:                      8801,
			UserId:                  88,
			PlanId:                  19,
			Source:                  "order",
			Status:                  "active",
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       15000,
			RequestCountUsed:        0,
			RequestCountPeriodTotal: 15000,
			RequestCountPeriodUsed:  0,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_lite",
			SpecificChannelId:       8801,
			SpecificChannelKeyIndex: 1,
			StartTime:               now - 60,
			EndTime:                 now + 86400,
			CreatedAt:               now - 60,
			UpdatedAt:               now - 60,
		}
		require.NoError(t, DB.Create(sub).Error)

		decision, err := GetAggregateSubscriptionRouteForPreferredSubscription(88, 8801, "claude-sonnet-4-6")
		require.NoError(t, err)
		require.NotNil(t, decision)
		require.Equal(t, 8801, decision.UserSubscriptionId)
		require.Equal(t, 8801, decision.SpecificChannelId)
		require.Equal(t, 1, decision.SpecificChannelKeyIndex)
		require.Equal(t, "sub_plan_claude_lite", decision.RouteGroup)
	})
}

func TestAdminRejectManualDeliveryOrder_ReleasesReservedPlaceholderSlot(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       68,
			Username: "claude_reject_user",
			AffCode:  "claude_reject_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1506,
			Title:                   "Claude Reject Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       1500,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_reject",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8003,
			Name:        "Claude Fixed Reject Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_reject",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order := &SubscriptionOrder{
			Id:            9903,
			UserId:        68,
			PlanId:        plan.Id,
			Money:         49.9,
			TradeNo:       "claude-manual-order-3",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, `{"ok":true}`))

		result, err := AdminRejectManualDeliveryOrder(order.Id, 7, "拒绝发放", false)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionFulfillmentRejected, result.FulfillmentStatus)
		require.Equal(t, 0, result.ReservedChannelId)
		require.Equal(t, -1, result.ReservedChannelKeyIndex)

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 8003).First(&storedChannel).Error)
		keys := storedChannel.GetKeys()
		require.Len(t, keys, 1)
		require.Equal(t, "seed-key-1", keys[0])

		var storedOrder SubscriptionOrder
		require.NoError(t, DB.Where("id = ?", order.Id).First(&storedOrder).Error)
		require.Equal(t, 0, storedOrder.ReservedChannelId)
		require.Equal(t, -1, storedOrder.ReservedChannelKeyIndex)
	})
}

func TestCompleteSubscriptionOrder_ReservesPlaceholderWithDisabledHistoricalChannel(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       69,
			Username: "claude_disabled_channel_user",
			AffCode:  "claude_disabled_channel_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1507,
			Title:                   "Claude Disabled Historical Channel Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       2200,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_disabled_history",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8004,
			Name:        "Claude Disabled Historical Channel",
			Status:      common.ChannelStatusManuallyDisabled,
			Key:         "old-disabled-key",
			Group:       "sub_plan_claude_disabled_history",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now - 60,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)
		require.NoError(t, DB.Create(&Channel{
			Id:          8005,
			Name:        "Claude Active Fixed Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_disabled_history",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order := &SubscriptionOrder{
			Id:            9904,
			UserId:        69,
			PlanId:        plan.Id,
			Money:         59.9,
			TradeNo:       "claude-manual-order-4",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, `{"ok":true}`))

		var storedOrder SubscriptionOrder
		require.NoError(t, DB.Where("id = ?", order.Id).First(&storedOrder).Error)
		require.Equal(t, 8005, storedOrder.ReservedChannelId)
		require.Equal(t, 1, storedOrder.ReservedChannelKeyIndex)

		var activeChannel Channel
		require.NoError(t, DB.Where("id = ?", 8005).First(&activeChannel).Error)
		activeKeys := activeChannel.GetKeys()
		require.Len(t, activeKeys, 2)
		require.Equal(t, "seed-key-1", activeKeys[0])
		require.Contains(t, activeKeys[1], "reserved:sub_order:9904:user:69:")

		var disabledChannel Channel
		require.NoError(t, DB.Where("id = ?", 8004).First(&disabledChannel).Error)
		disabledKeys := disabledChannel.GetKeys()
		require.Len(t, disabledKeys, 1)
		require.Equal(t, "old-disabled-key", disabledKeys[0])
	})
}

func TestAdminRejectManualDeliveryOrder_ShiftsLaterReservedOrderIndexes(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       70,
			Username: "claude_shift_reserved_a",
			AffCode:  "claude_shift_reserved_a",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&User{
			Id:       71,
			Username: "claude_shift_reserved_b",
			AffCode:  "claude_shift_reserved_b",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1508,
			Title:                   "Claude Shift Reserved Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       2600,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_shift_reserved",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8006,
			Name:        "Claude Shift Reserved Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_shift_reserved",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order1 := &SubscriptionOrder{
			Id:            9905,
			UserId:        70,
			PlanId:        plan.Id,
			Money:         29.9,
			TradeNo:       "claude-manual-order-5",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order1.ApplyPlanSnapshot(plan)
		require.NoError(t, order1.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order1.TradeNo, `{"ok":true}`))

		order2 := &SubscriptionOrder{
			Id:            9906,
			UserId:        71,
			PlanId:        plan.Id,
			Money:         39.9,
			TradeNo:       "claude-manual-order-6",
			PaymentMethod: "epay",
			CreateTime:    now + 1,
			Status:        common.TopUpStatusPending,
		}
		order2.ApplyPlanSnapshot(plan)
		require.NoError(t, order2.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order2.TradeNo, `{"ok":true}`))

		_, err = AdminRejectManualDeliveryOrder(order1.Id, 7, "拒绝第一个订单", false)
		require.NoError(t, err)

		var shiftedOrder SubscriptionOrder
		require.NoError(t, DB.Where("id = ?", order2.Id).First(&shiftedOrder).Error)
		require.Equal(t, 8006, shiftedOrder.ReservedChannelId)
		require.Equal(t, 1, shiftedOrder.ReservedChannelKeyIndex)

		result, err := AdminDeliverManualDeliveryOrder(order2.Id, 7, []SubscriptionDeliveryPayloadItem{
			{Key: "api_key", Label: "API Key", Type: "text", Value: "real-upstream-key-shifted"},
			{Key: "base_url", Label: "Base URL", Type: "text", Value: "https://console.example.com"},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Value: "https://usage.example.com"},
		}, "发放第二个订单")
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, SubscriptionFulfillmentDelivered, result.FulfillmentStatus)

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 8006).First(&storedChannel).Error)
		keys := storedChannel.GetKeys()
		require.Len(t, keys, 2)
		require.Equal(t, "seed-key-1", keys[0])
		require.Equal(t, "real-upstream-key-shifted", keys[1])
	})
}

func TestAdminRejectManualDeliveryOrder_ShiftsDeliveredBindingsAfterRemovedPlaceholder(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       72,
			Username: "claude_shift_delivered_a",
			AffCode:  "claude_shift_delivered_a",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)
		require.NoError(t, DB.Create(&User{
			Id:       73,
			Username: "claude_shift_delivered_b",
			AffCode:  "claude_shift_delivered_b",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      1509,
			Title:                   "Claude Shift Delivered Requests",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       2800,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "sub_plan_claude_shift_delivered",
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          8007,
			Name:        "Claude Shift Delivered Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "sub_plan_claude_shift_delivered",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		order1 := &SubscriptionOrder{
			Id:            9907,
			UserId:        72,
			PlanId:        plan.Id,
			Money:         29.9,
			TradeNo:       "claude-manual-order-7",
			PaymentMethod: "epay",
			CreateTime:    now,
			Status:        common.TopUpStatusPending,
		}
		order1.ApplyPlanSnapshot(plan)
		require.NoError(t, order1.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order1.TradeNo, `{"ok":true}`))

		order2 := &SubscriptionOrder{
			Id:            9908,
			UserId:        73,
			PlanId:        plan.Id,
			Money:         39.9,
			TradeNo:       "claude-manual-order-8",
			PaymentMethod: "epay",
			CreateTime:    now + 1,
			Status:        common.TopUpStatusPending,
		}
		order2.ApplyPlanSnapshot(plan)
		require.NoError(t, order2.Insert())
		require.NoError(t, CompleteSubscriptionOrder(order2.TradeNo, `{"ok":true}`))

		_, err = AdminDeliverManualDeliveryOrder(order2.Id, 7, []SubscriptionDeliveryPayloadItem{
			{Key: "api_key", Label: "API Key", Type: "text", Value: "real-upstream-key-delivered"},
			{Key: "base_url", Label: "Base URL", Type: "text", Value: "https://console.example.com"},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Value: "https://usage.example.com"},
		}, "先发放第二个订单")
		require.NoError(t, err)

		var deliveredSub UserSubscription
		require.NoError(t, DB.Where("source_order_id = ?", order2.Id).First(&deliveredSub).Error)
		require.Equal(t, 2, deliveredSub.SpecificChannelKeyIndex)

		require.NoError(t, DB.Create(&Token{
			Id:                      30001,
			UserId:                  73,
			Key:                     "sk-test-shift-delivered-0000000000000000000001",
			Name:                    "shift-specific-token",
			Status:                  common.TokenStatusEnabled,
			Group:                   "sub_plan_claude_shift_delivered",
			SpecificChannelId:       8007,
			SpecificChannelKeyIndex: 2,
			CreatedTime:             now,
			ExpiredTime:             -1,
		}).Error)
		require.NoError(t, DB.Create(&EcomAgentAccount{
			Id:                      31001,
			Email:                   "shift-binding@example.com",
			Password:                "password",
			BaseURL:                 "https://ecomagent.in",
			SupabaseAuthURL:         "https://example.supabase.co/auth/v1",
			SupabaseAnonKey:         "anon-key",
			AssignedChannelID:       8007,
			AssignedChannelKeyIndex: 2,
			CreatedTime:             now,
			UpdatedTime:             now,
		}).Error)

		_, err = AdminRejectManualDeliveryOrder(order1.Id, 7, "拒绝第一个占位订单", false)
		require.NoError(t, err)

		var shiftedOrder SubscriptionOrder
		require.NoError(t, DB.Where("id = ?", order2.Id).First(&shiftedOrder).Error)
		require.Equal(t, 1, shiftedOrder.ReservedChannelKeyIndex)

		var shiftedSub UserSubscription
		require.NoError(t, DB.Where("id = ?", deliveredSub.Id).First(&shiftedSub).Error)
		require.Equal(t, 1, shiftedSub.SpecificChannelKeyIndex)

		var shiftedToken Token
		require.NoError(t, DB.Where("id = ?", 30001).First(&shiftedToken).Error)
		require.Equal(t, 1, shiftedToken.SpecificChannelKeyIndex)

		var shiftedAccount EcomAgentAccount
		require.NoError(t, DB.Where("id = ?", 31001).First(&shiftedAccount).Error)
		require.Equal(t, 1, shiftedAccount.AssignedChannelKeyIndex)

		var storedChannel Channel
		require.NoError(t, DB.Where("id = ?", 8007).First(&storedChannel).Error)
		keys := storedChannel.GetKeys()
		require.Len(t, keys, 2)
		require.Equal(t, "seed-key-1", keys[0])
		require.Equal(t, "real-upstream-key-delivered", keys[1])
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

func TestGetEcomAgentChannelKeyBindingMap_OnlyReturnsAssignedAccounts(t *testing.T) {
	withSubscriptionQueryTestDB(t, func() {
		now := common.GetTimestamp()
		require.NoError(t, DB.Create(&User{
			Id:       88,
			Username: "ecom_binding_user",
			AffCode:  "ecom_binding_aff",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&UserSubscription{
			Id:                      8801,
			UserId:                  88,
			PlanId:                  1,
			Status:                  "active",
			StartTime:               now - 60,
			EndTime:                 now + 3600,
			SpecificChannelId:       30231,
			SpecificChannelKeyIndex: 1,
			CreatedAt:               now,
			UpdatedAt:               now,
		}).Error)

		require.NoError(t, DB.Create(&EcomAgentAccount{
			Id:                         88011,
			Email:                      "assigned@example.com",
			Password:                   "password",
			BaseURL:                    "https://ecomagent.in",
			SupabaseAuthURL:            "https://example.supabase.co/auth/v1",
			SupabaseAnonKey:            "anon-key",
			AssignmentStatus:           "assigned",
			AssignedChannelID:          30231,
			AssignedChannelKeyIndex:    1,
			AssignedUserSubscriptionID: 8801,
			RequestLimit:               500,
			UsageRequests:              123,
			CreatedTime:                now,
			UpdatedTime:                now,
		}).Error)

		require.NoError(t, DB.Create(&EcomAgentAccount{
			Id:                      88012,
			Email:                   "stale@example.com",
			Password:                "password",
			BaseURL:                 "https://ecomagent.in",
			SupabaseAuthURL:         "https://example.supabase.co/auth/v1",
			SupabaseAnonKey:         "anon-key",
			AssignmentStatus:        "unassigned",
			AssignedChannelID:       30231,
			AssignedChannelKeyIndex: 1,
			RequestLimit:            999,
			UsageRequests:           999,
			CreatedTime:             now,
			UpdatedTime:             now,
		}).Error)

		bindingMap, err := GetEcomAgentChannelKeyBindingMap(30231)
		require.NoError(t, err)
		require.Len(t, bindingMap[1], 1)
		require.Equal(t, 88011, bindingMap[1][0].AccountID)
		require.EqualValues(t, 500, bindingMap[1][0].RequestLimit)
		require.EqualValues(t, 123, bindingMap[1][0].UsageRequests)
		require.Equal(t, 88, bindingMap[1][0].UserID)
		require.Equal(t, 8801, bindingMap[1][0].SubscriptionID)
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
