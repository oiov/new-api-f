package model

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withRedemptionTestDB(t *testing.T, run func()) {
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
		&Redemption{},
		&SubscriptionPlan{},
		&SubscriptionOrder{},
		&UserSubscription{},
		&Channel{},
		&Log{},
	))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestRedeemQuotaRedemption(t *testing.T) {
	withRedemptionTestDB(t, func() {
		require.NoError(t, DB.Create(&User{
			Id:       1,
			Username: "quota_user",
			Quota:    0,
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&Redemption{
			UserId:         1,
			Key:            "quota-code",
			Status:         common.RedemptionCodeStatusEnabled,
			Name:           "额度码",
			Quota:          1000,
			RedemptionType: RedemptionTypeQuota,
			CreatedTime:    common.GetTimestamp(),
		}).Error)

		result, err := Redeem("quota-code", 1)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, RedemptionTypeQuota, result.RedemptionType)
		require.Equal(t, 1000, result.Quota)

		var user User
		require.NoError(t, DB.First(&user, "id = ?", 1).Error)
		require.Equal(t, 1000, user.Quota)

		var redemption Redemption
		require.NoError(t, DB.First(&redemption, "key = ?", "quota-code").Error)
		require.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
		require.Equal(t, 1, redemption.UsedUserId)
	})
}

func TestRedeemSubscriptionRedemption(t *testing.T) {
	withRedemptionTestDB(t, func() {
		require.NoError(t, DB.Create(&User{
			Id:       2,
			Username: "subscription_user",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            11,
			Title:         "基础套餐",
			PriceAmount:   9.9,
			Currency:      "USD",
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			Enabled:       true,
			UpgradeGroup:  "vip",
			TotalAmount:   5000,
			ResourceType:  SubscriptionResourceQuota,
			CreatedAt:     common.GetTimestamp(),
			UpdatedAt:     common.GetTimestamp(),
		}).Error)

		require.NoError(t, DB.Create(&Redemption{
			UserId:             1,
			Key:                "subscription-code",
			Status:             common.RedemptionCodeStatusEnabled,
			Name:               "套餐码",
			RedemptionType:     RedemptionTypeSubscription,
			SubscriptionPlanId: 11,
			CreatedTime:        common.GetTimestamp(),
			ExpiredTime:        time.Now().Add(24 * time.Hour).Unix(),
		}).Error)

		result, err := Redeem("subscription-code", 2)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, RedemptionTypeSubscription, result.RedemptionType)
		require.Equal(t, 11, result.SubscriptionPlanId)
		require.Equal(t, "基础套餐", result.SubscriptionPlanTitle)
		require.NotZero(t, result.SubscriptionId)

		var sub UserSubscription
		require.NoError(t, DB.First(&sub, "id = ?", result.SubscriptionId).Error)
		require.Equal(t, 2, sub.UserId)
		require.Equal(t, 11, sub.PlanId)
		require.Equal(t, "redemption", sub.Source)

		var plan SubscriptionPlan
		require.NoError(t, DB.First(&plan, "id = ?", 11).Error)
		require.EqualValues(t, 1, plan.SoldCount)

		var user User
		require.NoError(t, DB.First(&user, "id = ?", 2).Error)
		require.Equal(t, "vip", user.Group)
	})
}

func TestRedeemSubscriptionRedemptionIgnoresSoldOutLimit(t *testing.T) {
	withRedemptionTestDB(t, func() {
		require.NoError(t, DB.Create(&User{
			Id:       3,
			Username: "soldout_redemption_user",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:             12,
			Title:          "售罄套餐",
			PriceAmount:    19.9,
			Currency:       "USD",
			DurationUnit:   SubscriptionDurationMonth,
			DurationValue:  1,
			Enabled:        true,
			SaleLimitCount: 1,
			SoldCount:      1,
			TotalAmount:    8000,
			ResourceType:   SubscriptionResourceQuota,
			CreatedAt:      common.GetTimestamp(),
			UpdatedAt:      common.GetTimestamp(),
		}).Error)

		require.NoError(t, DB.Create(&Redemption{
			UserId:             1,
			Key:                "soldout-subscription-code",
			Status:             common.RedemptionCodeStatusEnabled,
			Name:               "售罄套餐码",
			RedemptionType:     RedemptionTypeSubscription,
			SubscriptionPlanId: 12,
			CreatedTime:        common.GetTimestamp(),
			ExpiredTime:        time.Now().Add(24 * time.Hour).Unix(),
		}).Error)

		result, err := Redeem("soldout-subscription-code", 3)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, RedemptionTypeSubscription, result.RedemptionType)
		require.Equal(t, 12, result.SubscriptionPlanId)
		require.NotZero(t, result.SubscriptionId)

		var sub UserSubscription
		require.NoError(t, DB.First(&sub, "id = ?", result.SubscriptionId).Error)
		require.Equal(t, 3, sub.UserId)
		require.Equal(t, 12, sub.PlanId)
		require.Equal(t, "redemption", sub.Source)

		var plan SubscriptionPlan
		require.NoError(t, DB.First(&plan, "id = ?", 12).Error)
		require.EqualValues(t, 2, plan.SoldCount)
	})
}

func TestRedeemSubscriptionRedemption_ReservesPlaceholderForClaudeManualDelivery(t *testing.T) {
	withRedemptionTestDB(t, func() {
		now := common.GetTimestamp()
		schemaJSON, err := encodeSubscriptionDeliveryFields([]SubscriptionDeliveryField{
			{Key: "api_key", Label: "API Key", Type: "text", Copyable: true},
			{Key: "base_url", Label: "Base URL", Type: "text", Copyable: true},
			{Key: "usage_query_url", Label: "Usage URL", Type: "text", Copyable: true},
		})
		require.NoError(t, err)

		require.NoError(t, DB.Create(&User{
			Id:       4,
			Username: "manual_redemption_user",
			Group:    "default",
			Status:   common.UserStatusEnabled,
		}).Error)

		plan := &SubscriptionPlan{
			Id:                      13,
			Title:                   "Claude Manual Redemption",
			DurationUnit:            SubscriptionDurationMonth,
			DurationValue:           1,
			Enabled:                 true,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       1800,
			DeliveryMode:            SubscriptionDeliveryModeManualDelivery,
			DeliveryFieldSchemaJSON: schemaJSON,
			AllowedModelsJSON:       `["claude-sonnet-4-6"]`,
			UpgradeGroup:            "vip",
			CreatedAt:               now,
			UpdatedAt:               now,
		}
		require.NoError(t, DB.Create(plan).Error)

		tag := subscriptionPlanChannelPoolTag(plan.Id)
		require.NoError(t, DB.Create(&Channel{
			Id:          9001,
			Name:        "Claude Redemption Fixed Channel",
			Status:      common.ChannelStatusEnabled,
			Key:         "seed-key-1",
			Group:       "vip",
			Tag:         &tag,
			Models:      "claude-sonnet-4-6",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 1,
			},
		}).Error)

		require.NoError(t, DB.Create(&Redemption{
			UserId:             1,
			Key:                "manual-subscription-code",
			Status:             common.RedemptionCodeStatusEnabled,
			Name:               "人工发放套餐码",
			RedemptionType:     RedemptionTypeSubscription,
			SubscriptionPlanId: 13,
			CreatedTime:        now,
			ExpiredTime:        time.Now().Add(24 * time.Hour).Unix(),
		}).Error)

		result, err := Redeem("manual-subscription-code", 4)
		require.NoError(t, err)
		require.NotNil(t, result)
		require.Equal(t, RedemptionTypeSubscription, result.RedemptionType)
		require.Equal(t, 13, result.SubscriptionPlanId)
		require.Equal(t, "Claude Manual Redemption", result.SubscriptionPlanTitle)
		require.Zero(t, result.SubscriptionId)
		require.NotZero(t, result.SubscriptionOrderId)
		require.Equal(t, SubscriptionFulfillmentPending, result.FulfillmentStatus)

		var order SubscriptionOrder
		require.NoError(t, DB.First(&order, "id = ?", result.SubscriptionOrderId).Error)
		require.Equal(t, 4, order.UserId)
		require.Equal(t, 13, order.PlanId)
		require.Equal(t, "redemption", order.PaymentMethod)
		require.Equal(t, SubscriptionDeliveryModeManualDelivery, order.PlanDeliveryMode)
		require.Equal(t, SubscriptionFulfillmentPending, order.FulfillmentStatus)
		require.Equal(t, 9001, order.ReservedChannelId)
		require.Equal(t, 1, order.ReservedChannelKeyIndex)

		var channel Channel
		require.NoError(t, DB.First(&channel, "id = ?", 9001).Error)
		keys := channel.GetKeys()
		require.Len(t, keys, 2)
		require.Equal(t, "seed-key-1", keys[0])
		require.True(t, strings.HasPrefix(keys[1], "reserved:sub_order:"))

	})
}
