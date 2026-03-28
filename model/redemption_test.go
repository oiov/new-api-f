package model

import (
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
		&UserSubscription{},
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
