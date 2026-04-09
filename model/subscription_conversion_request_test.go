package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withSubscriptionConversionRequestTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldQuotaPerUnit := common.QuotaPerUnit

	common.OptionMapRWMutex.Lock()
	oldCampaignRaw := common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey]
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	common.QuotaPerUnit = 100

	require.NoError(t, db.AutoMigrate(
		&User{},
		&SubscriptionPlan{},
		&SubscriptionOrder{},
		&TopUp{},
		&UserSubscription{},
		&SubscriptionConversionRequest{},
		&Log{},
	))

	now := common.GetTimestamp()
	campaignRaw := fmt.Sprintf(`{
		"enabled": true,
		"key": "test-subscription-conversion",
		"title": "测试套餐转余额活动",
		"deadline": %d,
		"timezone": "Asia/Shanghai"
	}`, now+86400)
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey] = campaignRaw
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.QuotaPerUnit = oldQuotaPerUnit
		common.OptionMapRWMutex.Lock()
		if oldCampaignRaw == "" {
			delete(common.OptionMap, selfServiceSubscriptionConversionCampaignOptionKey)
		} else {
			common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey] = oldCampaignRaw
		}
		common.OptionMapRWMutex.Unlock()
	})

	run()
}

func seedSubscriptionConversionRequestFixtures(t *testing.T) (int64, int64) {
	t.Helper()

	now := common.GetTimestamp()
	endTime := now + 7200
	nextResetTime := now + 1800
	planID := 9101
	orderID := 9301
	subscriptionID := 9201

	require.NoError(t, DB.Create(&User{
		Id:       1,
		Username: "conversion_user",
		Group:    "claude_sub",
		Quota:    500,
		Status:   common.UserStatusEnabled,
		AffCode:  "conversion_aff",
	}).Error)
	require.NoError(t, DB.Create(&SubscriptionPlan{
		Id:            planID,
		Title:         "Claude Legacy Plan",
		PriceAmount:   10,
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		ResourceType:  SubscriptionResourceQuota,
		TotalAmount:   1000,
		UpgradeGroup:  "claude_sub",
	}).Error)
	require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", planID).Update("enabled", false).Error)
	InvalidateSubscriptionPlanCache(planID)
	require.NoError(t, DB.Create(&SubscriptionOrder{
		Id:           orderID,
		UserId:       1,
		PlanId:       planID,
		TradeNo:      "conversion-order-1",
		Money:        10,
		Status:       common.TopUpStatusSuccess,
		CompleteTime: now - 60,
		CreateTime:   now - 120,
	}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		Id:            subscriptionID,
		UserId:        1,
		PlanId:        planID,
		Status:        "active",
		StartTime:     now - 3600,
		EndTime:       endTime,
		NextResetTime: nextResetTime,
		ResourceType:  SubscriptionResourceQuota,
		AmountTotal:   1000,
		AmountUsed:    0,
		UpgradeGroup:  "claude_sub",
		PrevUserGroup: "default",
		Source:        "order",
		CreatedAt:     now - 30,
		UpdatedAt:     now - 30,
	}).Error)

	return endTime, nextResetTime
}

func TestCreateSubscriptionConversionRequest_DisablesSubscriptionImmediately(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		seedSubscriptionConversionRequestFixtures(t)
		request, err := CreateSubscriptionConversionRequest(1, "")
		require.NoError(t, err)
		require.Equal(t, SubscriptionConversionRequestStatusPending, request.Status)
		require.NotZero(t, request.DisabledAt)
		require.Greater(t, request.RequestedQuota, 0)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 9201).First(&sub).Error)
		require.Equal(t, "cancelled", sub.Status)
		require.Equal(t, request.DisabledAt, sub.EndTime)

		var user User
		require.NoError(t, DB.Where("id = ?", 1).First(&user).Error)
		require.Equal(t, "default", user.Group)
	})
}

func TestRejectSubscriptionConversionRequest_RestoresSubscriptionAndGroup(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		originalEndTime, originalNextResetTime := seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "")
		require.NoError(t, err)

		rejected, err := RejectSubscriptionConversionRequest(request.Id, "不同意")
		require.NoError(t, err)
		require.Equal(t, SubscriptionConversionRequestStatusRejected, rejected.Status)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 9201).First(&sub).Error)
		require.Equal(t, "active", sub.Status)
		require.GreaterOrEqual(t, sub.EndTime, originalEndTime)
		require.GreaterOrEqual(t, sub.NextResetTime, originalNextResetTime)

		var user User
		require.NoError(t, DB.Where("id = ?", 1).First(&user).Error)
		require.Equal(t, "claude_sub", user.Group)
	})
}

func TestApproveSubscriptionConversionRequest_UsesDisabledRequestSnapshot(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "")
		require.NoError(t, err)

		approvedQuota := request.RequestedQuota + 123
		approved, err := ApproveSubscriptionConversionRequest(request.Id, 1.1, approvedQuota, "手动调整")
		require.NoError(t, err)
		require.Equal(t, SubscriptionConversionRequestStatusApproved, approved.Status)
		require.Equal(t, approvedQuota, approved.ApprovedQuota)
		require.NotZero(t, approved.ExecutedAt)

		var sub UserSubscription
		require.NoError(t, DB.Where("id = ?", 9201).First(&sub).Error)
		require.Equal(t, "cancelled", sub.Status)

		var user User
		require.NoError(t, DB.Where("id = ?", 1).First(&user).Error)
		require.Equal(t, 500+approvedQuota, user.Quota)
		require.Equal(t, "default", user.Group)
	})
}

func TestApproveSubscriptionConversionRequest_FailsWhenSubscriptionStateChanged(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		originalEndTime, _ := seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "")
		require.NoError(t, err)

		require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", 9201).Updates(map[string]any{
			"status":   "active",
			"end_time": originalEndTime,
		}).Error)

		_, err = ApproveSubscriptionConversionRequest(request.Id, 1, request.RequestedQuota, "")
		require.Error(t, err)
		require.Contains(t, err.Error(), "套餐状态已发生变化")

		var user User
		require.NoError(t, DB.Where("id = ?", 1).First(&user).Error)
		require.Equal(t, 500, user.Quota)
	})
}

func TestPreviewSelfServiceSubscriptionConversion_UsesDurationDayFormula(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       2,
			Username: "duration_formula_user",
			Group:    "claude_sub",
			Quota:    0,
			Status:   common.UserStatusEnabled,
			AffCode:  "duration_formula_aff",
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            9110,
			Title:         "Claude Month Plan",
			PriceAmount:   30,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			UpgradeGroup:  "claude_sub",
		}).Error)
		require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", 9110).Update("enabled", false).Error)
		InvalidateSubscriptionPlanCache(9110)
		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:           9310,
			UserId:       2,
			PlanId:       9110,
			TradeNo:      "conversion-order-2",
			Money:        30,
			Status:       common.TopUpStatusSuccess,
			CompleteTime: now - 4*86400,
			CreateTime:   now - 4*86400,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:            9210,
			UserId:        2,
			PlanId:        9110,
			Status:        "active",
			StartTime:     now - 3*86400 - 3600,
			EndTime:       now + 26*86400,
			ResourceType:  SubscriptionResourceQuota,
			AmountTotal:   1000,
			UpgradeGroup:  "claude_sub",
			PrevUserGroup: "default",
			Source:        "order",
			CreatedAt:     now - 4*86400,
			UpdatedAt:     now - 4*86400,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
		}).Error)

		preview, err := PreviewSelfServiceSubscriptionConversion(2)
		require.NoError(t, err)
		require.Len(t, preview.Items, 1)

		item := preview.Items[0]
		require.Equal(t, int64(3), item.UsedDays)
		require.InDelta(t, 3.5, item.BillableUsedDays, 0.001)
		require.InDelta(t, 30, item.DurationDays, 0.001)
		require.InDelta(t, 0.8833, item.RemainingRatio, 0.0001)
		require.InDelta(t, 26.5, item.ConvertibleAmount, 0.001)
		require.Equal(t, 2650, item.ConvertibleQuota)
	})
}
