package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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
	oldQuotaDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldCustomCurrencyExchangeRate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
	oldUSDExchangeRate := operation_setting.USDExchangeRate

	common.OptionMapRWMutex.Lock()
	oldCampaignRaw := common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey]
	oldRefundSettingsRaw := common.OptionMap[subscriptionRefundSettingsOptionKey]
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
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 1
	operation_setting.USDExchangeRate = 7

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
	common.OptionMap[subscriptionRefundSettingsOptionKey] = `{
		"page_enabled": true,
		"enabled": true,
		"allow_balance_refund": true,
		"allow_original_payment_refund": true,
		"settlement_mode": "duration_ratio",
		"currency": "USD"
	}`
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldQuotaDisplayType
		operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = oldCustomCurrencyExchangeRate
		operation_setting.USDExchangeRate = oldUSDExchangeRate
		common.OptionMapRWMutex.Lock()
		if oldCampaignRaw == "" {
			delete(common.OptionMap, selfServiceSubscriptionConversionCampaignOptionKey)
		} else {
			common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey] = oldCampaignRaw
		}
		if oldRefundSettingsRaw == "" {
			delete(common.OptionMap, subscriptionRefundSettingsOptionKey)
		} else {
			common.OptionMap[subscriptionRefundSettingsOptionKey] = oldRefundSettingsRaw
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
		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetBalance)
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

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetBalance)
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

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetBalance)
		require.NoError(t, err)

		approvedQuota := request.RequestedQuota + 123
		approved, err := ApproveSubscriptionConversionRequest(request.Id, 1.1, approvedQuota, SubscriptionRefundTargetBalance, "手动调整")
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

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetBalance)
		require.NoError(t, err)

		require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", 9201).Updates(map[string]any{
			"status":   "active",
			"end_time": originalEndTime,
		}).Error)

		_, err = ApproveSubscriptionConversionRequest(request.Id, 1, request.RequestedQuota, SubscriptionRefundTargetBalance, "")
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

func TestPreviewSelfServiceSubscriptionConversion_ExcludesSubscriptionsWithoutSuccessfulOrder(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       3,
			Username: "gift_subscription_user",
			Group:    "claude_sub",
			Quota:    0,
			Status:   common.UserStatusEnabled,
			AffCode:  "gift_subscription_aff",
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            9120,
			Title:         "Claude Gift Plan",
			PriceAmount:   30,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			UpgradeGroup:  "claude_sub",
		}).Error)
		require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", 9120).Update("enabled", false).Error)
		InvalidateSubscriptionPlanCache(9120)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:            9220,
			UserId:        3,
			PlanId:        9120,
			Status:        "active",
			StartTime:     now - 86400,
			EndTime:       now + 20*86400,
			ResourceType:  SubscriptionResourceQuota,
			AmountTotal:   1000,
			UpgradeGroup:  "claude_sub",
			PrevUserGroup: "default",
			Source:        "redemption",
			CreatedAt:     now - 86400,
			UpdatedAt:     now - 86400,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
		}).Error)

		preview, err := PreviewSelfServiceSubscriptionConversion(3)
		require.NoError(t, err)
		require.Empty(t, preview.Items)
		require.Contains(t, preview.ClosedReason, "只有关联成功支付订单的购买套餐才支持申请")
	})
}

func TestPreviewSelfServiceSubscriptionConversion_UsesCNYDisplayAmountToQuota(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
		operation_setting.USDExchangeRate = 7

		now := common.GetTimestamp()
		require.NoError(t, DB.Create(&User{
			Id:       4,
			Username: "cny_formula_user",
			Group:    "claude_sub",
			Quota:    0,
			Status:   common.UserStatusEnabled,
			AffCode:  "cny_formula_aff",
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            9130,
			Title:         "Claude CNY Plan",
			PriceAmount:   30,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			UpgradeGroup:  "claude_sub",
		}).Error)
		require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", 9130).Update("enabled", false).Error)
		InvalidateSubscriptionPlanCache(9130)
		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:           9330,
			UserId:       4,
			PlanId:       9130,
			TradeNo:      "conversion-order-cny",
			Money:        30,
			Status:       common.TopUpStatusSuccess,
			CompleteTime: now - 4*86400,
			CreateTime:   now - 4*86400,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:            9230,
			UserId:        4,
			PlanId:        9130,
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

		preview, err := PreviewSelfServiceSubscriptionConversion(4)
		require.NoError(t, err)
		require.Len(t, preview.Items, 1)
		item := preview.Items[0]
		require.InDelta(t, 26.5, item.ConvertibleAmount, 0.001)
		require.Equal(t, 378, item.ConvertibleQuota)
	})
}

func TestPreviewSelfServiceSubscriptionConversion_UsesTokenUsageRefundSettings(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		now := common.GetTimestamp()
		common.OptionMapRWMutex.Lock()
		common.OptionMap[subscriptionRefundSettingsOptionKey] = `{
			"page_enabled": true,
			"enabled": true,
			"allow_balance_refund": true,
			"allow_original_payment_refund": true,
			"settlement_mode": "token_usage",
			"currency": "USD",
			"codex_input_price_per_million": 2,
			"codex_output_price_per_million": 8,
			"codex_cache_read_price_per_million": 0.5,
			"codex_cache_write_price_per_million": 3
		}`
		common.OptionMapRWMutex.Unlock()

		require.NoError(t, DB.Create(&User{
			Id:       5,
			Username: "token_usage_user",
			Group:    "codex_sub",
			Quota:    0,
			Status:   common.UserStatusEnabled,
			AffCode:  "token_usage_aff",
		}).Error)
		require.NoError(t, DB.Create(&SubscriptionPlan{
			Id:            9140,
			Title:         "Codex Pro Plan",
			PriceAmount:   10,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   1000,
			UpgradeGroup:  "codex_sub",
		}).Error)
		require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", 9140).Update("enabled", false).Error)
		InvalidateSubscriptionPlanCache(9140)
		common.OptionMapRWMutex.Lock()
		common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey] = fmt.Sprintf(`{
			"enabled": true,
			"key": "test-subscription-conversion-token",
			"title": "测试 Codex 折算活动",
			"deadline": %d,
			"timezone": "Asia/Shanghai",
			"eligible_upgrade_groups": ["codex_sub"]
		}`, now+86400)
		common.OptionMapRWMutex.Unlock()
		require.NoError(t, DB.Create(&SubscriptionOrder{
			Id:           9340,
			UserId:       5,
			PlanId:       9140,
			TradeNo:      "conversion-order-token",
			Money:        10,
			Status:       common.TopUpStatusSuccess,
			CompleteTime: now - 86400,
			CreateTime:   now - 86400,
		}).Error)
		require.NoError(t, DB.Create(&UserSubscription{
			Id:            9240,
			UserId:        5,
			PlanId:        9140,
			Status:        "active",
			StartTime:     now - 86400,
			EndTime:       now + 20*86400,
			ResourceType:  SubscriptionResourceQuota,
			AmountTotal:   1000,
			UpgradeGroup:  "codex_sub",
			PrevUserGroup: "default",
			Source:        "order",
			CreatedAt:     now - 86400,
			UpdatedAt:     now - 86400,
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
		}).Error)
		require.NoError(t, DB.Create(&Log{
			Id:               9401,
			UserId:           5,
			CreatedAt:        now - 3600,
			Type:             LogTypeConsume,
			ModelName:        "gpt-5.4",
			PromptTokens:     300000,
			CompletionTokens: 100000,
			RequestId:        "token-refund-1",
			Other:            `{"billing_source":"subscription","subscription_id":9240,"subscription_plan_id":9140,"cache_tokens":50000,"cache_write_tokens":20000,"subscription_consumed":123}`,
		}).Error)

		preview, err := PreviewSelfServiceSubscriptionConversion(5)
		require.NoError(t, err)
		require.Len(t, preview.Items, 1)

		item := preview.Items[0]
		require.Equal(t, SubscriptionRefundSettlementModeTokenUsage, item.SettlementMode)
		require.EqualValues(t, 300000, item.InputTokens)
		require.EqualValues(t, 100000, item.OutputTokens)
		require.EqualValues(t, 50000, item.CacheReadTokens)
		require.EqualValues(t, 20000, item.CacheWriteTokens)
		require.EqualValues(t, 230000, item.BilledInputTokens)
		require.InDelta(t, 1.35, item.ConsumedCostAmount, 0.001)
		require.InDelta(t, 8.65, item.ConvertibleAmount, 0.001)
		require.Equal(t, 865, item.ConvertibleQuota)
	})
}

func TestApproveSubscriptionConversionRequest_OriginalPaymentDoesNotCreditQuota(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetOriginalPayment)
		require.NoError(t, err)
		require.Equal(t, SubscriptionRefundTargetOriginalPayment, request.RequestedRefundTarget)

		approved, err := ApproveSubscriptionConversionRequest(request.Id, 1, 0, SubscriptionRefundTargetOriginalPayment, "原路退款")
		require.NoError(t, err)
		require.Equal(t, SubscriptionRefundTargetOriginalPayment, approved.ApprovedRefundTarget)
		require.Equal(t, 0, approved.ApprovedQuota)
		require.Equal(t, int64(0), approved.ExecutedAt)
		require.InDelta(t, request.RequestedAmount, approved.ApprovedAmount, 0.001)

		var user User
		require.NoError(t, DB.Where("id = ?", 1).First(&user).Error)
		require.Equal(t, 500, user.Quota)
	})
}

func TestMarkSubscriptionConversionRequestPaid(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetOriginalPayment)
		require.NoError(t, err)

		approved, err := ApproveSubscriptionConversionRequest(request.Id, 1, 0, SubscriptionRefundTargetOriginalPayment, "原路退款")
		require.NoError(t, err)
		require.Equal(t, SubscriptionConversionPayoutStatusPending, approved.PayoutStatus)

		paid, err := MarkSubscriptionConversionRequestPaid(request.Id, "财务已退款")
		require.NoError(t, err)
		require.Equal(t, SubscriptionConversionPayoutStatusPaid, paid.PayoutStatus)
		require.NotZero(t, paid.PayoutAt)
		require.Equal(t, "财务已退款", paid.PayoutRemark)
	})
}

func TestMarkSubscriptionConversionRequestPaid_RequiresRemark(t *testing.T) {
	withSubscriptionConversionRequestTestDB(t, func() {
		seedSubscriptionConversionRequestFixtures(t)

		request, err := CreateSubscriptionConversionRequest(1, "", SubscriptionRefundTargetOriginalPayment)
		require.NoError(t, err)

		_, err = ApproveSubscriptionConversionRequest(request.Id, 1, 0, SubscriptionRefundTargetOriginalPayment, "原路退款")
		require.NoError(t, err)

		_, err = MarkSubscriptionConversionRequestPaid(request.Id, "   ")
		require.Error(t, err)
		require.Contains(t, err.Error(), "打款流水或备注不能为空")
	})
}
