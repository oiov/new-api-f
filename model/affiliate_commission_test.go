package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withAffiliateCommissionTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldUsingMySQL := common.UsingMySQL
	oldUsingPostgreSQL := common.UsingPostgreSQL
	oldQuotaPerUnit := common.QuotaPerUnit
	oldEnabled := common.AffiliateCommissionEnabled
	oldDefaultRate := common.AffiliateCommissionDefaultRate
	oldSettlementMode := common.AffiliateCommissionSettlementMode
	oldScope := common.AffiliateCommissionScope
	oldMinOrderMoney := common.AffiliateCommissionMinOrderMoney
	oldMaxQuotaPerOrder := common.AffiliateCommissionMaxQuotaPerOrder
	oldIncludeTopup := common.AffiliateCommissionIncludeTopup
	oldIncludeSubscription := common.AffiliateCommissionIncludeSubscription

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.QuotaPerUnit = 500000
	common.AffiliateCommissionEnabled = true
	common.AffiliateCommissionDefaultRate = 10
	common.AffiliateCommissionSettlementMode = AffiliateCommissionSettlementQuota
	common.AffiliateCommissionScope = AffiliateCommissionScopeAllPaidOrders
	common.AffiliateCommissionMinOrderMoney = 0
	common.AffiliateCommissionMaxQuotaPerOrder = 0
	common.AffiliateCommissionIncludeTopup = true
	common.AffiliateCommissionIncludeSubscription = true

	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &SubscriptionPlan{}, &SubscriptionOrder{}, &UserSubscription{}, &AffiliateCommission{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.UsingMySQL = oldUsingMySQL
		common.UsingPostgreSQL = oldUsingPostgreSQL
		common.QuotaPerUnit = oldQuotaPerUnit
		common.AffiliateCommissionEnabled = oldEnabled
		common.AffiliateCommissionDefaultRate = oldDefaultRate
		common.AffiliateCommissionSettlementMode = oldSettlementMode
		common.AffiliateCommissionScope = oldScope
		common.AffiliateCommissionMinOrderMoney = oldMinOrderMoney
		common.AffiliateCommissionMaxQuotaPerOrder = oldMaxQuotaPerOrder
		common.AffiliateCommissionIncludeTopup = oldIncludeTopup
		common.AffiliateCommissionIncludeSubscription = oldIncludeSubscription
	})

	run()
}

func seedAffiliateUsers(t *testing.T, inviterRate float64) (inviter User, invitee User) {
	t.Helper()
	inviter = User{
		Id:                      1,
		Username:                "inviter",
		Password:                "password",
		DisplayName:             "Inviter",
		Status:                  common.UserStatusEnabled,
		Role:                    common.RoleCommonUser,
		AffCode:                 "aff-inviter",
		AffiliateCommissionRate: inviterRate,
	}
	invitee = User{
		Id:          2,
		Username:    "invitee",
		Password:    "password",
		DisplayName: "Invitee",
		Status:      common.UserStatusEnabled,
		Role:        common.RoleCommonUser,
		AffCode:     "aff-invitee",
		InviterId:   inviter.Id,
	}
	require.NoError(t, DB.Create(&inviter).Error)
	require.NoError(t, DB.Create(&invitee).Error)
	if inviterRate >= 0 {
		require.NoError(t, DB.Model(&User{}).Where("id = ?", inviter.Id).Update("affiliate_commission_rate", inviterRate).Error)
	}
	return inviter, invitee
}

func grantTopUpForAffiliateTest(t *testing.T, topUp *TopUp) {
	t.Helper()
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return GrantAffiliateCommissionForTopUpTx(tx, topUp)
	}))
}

func grantSubscriptionForAffiliateTest(t *testing.T, order *SubscriptionOrder) {
	t.Helper()
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return GrantAffiliateCommissionForSubscriptionOrderTx(tx, order)
	}))
}

func getAffiliateCommissionBySource(t *testing.T, sourceType string, sourceId int) AffiliateCommission {
	t.Helper()
	var commission AffiliateCommission
	require.NoError(t, DB.Where("source_type = ? AND source_id = ?", sourceType, sourceId).First(&commission).Error)
	return commission
}

func getAffiliateUser(t *testing.T, id int) User {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, id).Error)
	return user
}

func TestAffiliateCommissionDefaultRateGrantsTopUpQuota(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, -1)
		topUp := &TopUp{Id: 100, UserId: invitee.Id, Money: 10, TradeNo: "topup-default", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, topUp)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, topUp.Id)
		require.Equal(t, AffiliateCommissionStatusGranted, commission.Status)
		require.Equal(t, inviter.Id, commission.InviterId)
		require.Equal(t, invitee.Id, commission.InviteeId)
		require.Equal(t, 10.0, commission.Rate)
		require.Equal(t, 500000, commission.CommissionQuota)
		require.Equal(t, "topup-default", commission.SourceTradeNo)
		require.Equal(t, PaymentProviderEpay, commission.PaymentProvider)
		require.Equal(t, "alipay", commission.PaymentMethod)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 500000, updatedInviter.AffQuota)
		require.Equal(t, 500000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionCustomRateOverridesGlobalRate(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, 20)
		topUp := &TopUp{Id: 101, UserId: invitee.Id, Money: 10, TradeNo: "topup-custom", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe}

		grantTopUpForAffiliateTest(t, topUp)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, topUp.Id)
		require.Equal(t, AffiliateCommissionStatusGranted, commission.Status)
		require.Equal(t, 20.0, commission.Rate)
		require.Equal(t, 1000000, commission.CommissionQuota)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 1000000, updatedInviter.AffQuota)
		require.Equal(t, 1000000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionInsertedUserDefaultsToGlobalRate(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter := User{
			Username:    "inserted-inviter",
			Password:    "password",
			DisplayName: "Inserted Inviter",
			Status:      common.UserStatusEnabled,
			Role:        common.RoleCommonUser,
		}
		require.NoError(t, inviter.Insert(0, ""))

		insertedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, -1.0, insertedInviter.AffiliateCommissionRate)
		require.Equal(t, common.AffiliateCommissionDefaultRate, ResolveAffiliateCommissionRate(&insertedInviter))
	})
}

func TestAffiliateCommissionZeroCustomRateSkipsGrant(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, 0)
		topUp := &TopUp{Id: 102, UserId: invitee.Id, Money: 10, TradeNo: "topup-zero", PaymentMethod: "wxpay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, topUp)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, topUp.Id)
		require.Equal(t, AffiliateCommissionStatusSkipped, commission.Status)
		require.Equal(t, AffiliateCommissionReasonRateZero, commission.Reason)
		require.Equal(t, 0, commission.CommissionQuota)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 0, updatedInviter.AffQuota)
		require.Equal(t, 0, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionDuplicateSourceDoesNotGrantTwice(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, -1)
		topUp := &TopUp{Id: 103, UserId: invitee.Id, Money: 10, TradeNo: "topup-duplicate", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, topUp)
		grantTopUpForAffiliateTest(t, topUp)

		var count int64
		require.NoError(t, DB.Model(&AffiliateCommission{}).Where("source_type = ? AND source_id = ?", AffiliateCommissionSourceTopUp, topUp.Id).Count(&count).Error)
		require.EqualValues(t, 1, count)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 500000, updatedInviter.AffQuota)
		require.Equal(t, 500000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionFirstPaidOrderScopeGrantsOnlyOnce(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		common.AffiliateCommissionScope = AffiliateCommissionScopeFirstPaidOrder
		inviter, invitee := seedAffiliateUsers(t, -1)
		firstTopUp := &TopUp{Id: 104, UserId: invitee.Id, Money: 10, TradeNo: "topup-first", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}
		secondTopUp := &TopUp{Id: 105, UserId: invitee.Id, Money: 10, TradeNo: "topup-second", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, firstTopUp)
		grantTopUpForAffiliateTest(t, secondTopUp)

		firstCommission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, firstTopUp.Id)
		require.Equal(t, AffiliateCommissionStatusGranted, firstCommission.Status)

		secondCommission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, secondTopUp.Id)
		require.Equal(t, AffiliateCommissionStatusSkipped, secondCommission.Status)
		require.Equal(t, AffiliateCommissionReasonFirstPaidOrderOnly, secondCommission.Reason)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 500000, updatedInviter.AffQuota)
		require.Equal(t, 500000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionMinOrderAndMaxQuotaCap(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		common.AffiliateCommissionMinOrderMoney = 20
		common.AffiliateCommissionMaxQuotaPerOrder = 400000
		inviter, invitee := seedAffiliateUsers(t, -1)
		smallTopUp := &TopUp{Id: 106, UserId: invitee.Id, Money: 10, TradeNo: "topup-small", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}
		largeTopUp := &TopUp{Id: 107, UserId: invitee.Id, Money: 100, TradeNo: "topup-large", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, smallTopUp)
		grantTopUpForAffiliateTest(t, largeTopUp)

		smallCommission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, smallTopUp.Id)
		require.Equal(t, AffiliateCommissionStatusSkipped, smallCommission.Status)
		require.Equal(t, AffiliateCommissionReasonBelowMinOrderMoney, smallCommission.Reason)

		largeCommission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, largeTopUp.Id)
		require.Equal(t, AffiliateCommissionStatusGranted, largeCommission.Status)
		require.Equal(t, 400000, largeCommission.CommissionQuota)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 400000, updatedInviter.AffQuota)
		require.Equal(t, 400000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionSummaryIncludesMinOrderMoney(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		common.AffiliateCommissionMinOrderMoney = 25.5
		inviter, _ := seedAffiliateUsers(t, -1)

		summary, err := GetAffiliateCommissionSummary(inviter.Id)
		require.NoError(t, err)

		configBytes, err := common.Marshal(summary.Config)
		require.NoError(t, err)
		var config map[string]any
		require.NoError(t, common.Unmarshal(configBytes, &config))
		require.Equal(t, 25.5, config["min_order_money"])
	})
}

func TestAffiliateCommissionNoInviterCreatesSkippedRow(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		invitee := User{Id: 2, Username: "invitee", Password: "password", DisplayName: "Invitee", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, AffCode: "aff-invitee"}
		require.NoError(t, DB.Create(&invitee).Error)
		topUp := &TopUp{Id: 108, UserId: invitee.Id, Money: 10, TradeNo: "topup-no-inviter", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay}

		grantTopUpForAffiliateTest(t, topUp)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, topUp.Id)
		require.Equal(t, AffiliateCommissionStatusSkipped, commission.Status)
		require.Equal(t, AffiliateCommissionReasonNoInviter, commission.Reason)
		require.Equal(t, 0, commission.InviterId)
		require.Equal(t, invitee.Id, commission.InviteeId)
	})
}

func TestAffiliateCommissionManualDeliverySubscriptionIsExcluded(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, -1)
		order := &SubscriptionOrder{
			Id:               201,
			UserId:           invitee.Id,
			PlanId:           1,
			Money:            30,
			TradeNo:          "sub-manual",
			PaymentMethod:    PaymentMethodStripe,
			PaymentProvider:  PaymentProviderStripe,
			PlanDeliveryMode: SubscriptionDeliveryModeManualDelivery,
		}

		grantSubscriptionForAffiliateTest(t, order)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceSubscriptionOrder, order.Id)
		require.Equal(t, AffiliateCommissionStatusSkipped, commission.Status)
		require.Equal(t, AffiliateCommissionReasonManualDeliveryExcluded, commission.Reason)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 0, updatedInviter.AffQuota)
		require.Equal(t, 0, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionRechargeEpayGrantsOnlineTopUpCommission(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, -1)
		require.NoError(t, DB.Create(&TopUp{
			Id:              301,
			UserId:          invitee.Id,
			Amount:          10,
			Money:           10,
			TradeNo:         "topup-online-epay",
			PaymentMethod:   "wxpay",
			PaymentProvider: PaymentProviderEpay,
			CreateTime:      common.GetTimestamp(),
			Status:          common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeEpay("topup-online-epay", "alipay")
		require.NoError(t, err)
		require.True(t, completed)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceTopUp, 301)
		require.Equal(t, AffiliateCommissionStatusGranted, commission.Status)
		require.Equal(t, 500000, commission.CommissionQuota)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 500000, updatedInviter.AffQuota)
		require.Equal(t, 500000, updatedInviter.AffHistoryQuota)
	})
}

func TestAffiliateCommissionCompleteSubscriptionOrderGrantsAutoDeliveryCommission(t *testing.T) {
	withAffiliateCommissionTestDB(t, func() {
		inviter, invitee := seedAffiliateUsers(t, -1)
		plan := &SubscriptionPlan{
			Id:            401,
			Title:         "affiliate-auto-plan",
			DurationUnit:  SubscriptionDurationMonth,
			DurationValue: 1,
			Enabled:       true,
			ResourceType:  SubscriptionResourceQuota,
			TotalAmount:   100,
			DeliveryMode:  SubscriptionDeliveryModeAutoActivate,
		}
		require.NoError(t, DB.Create(plan).Error)
		order := &SubscriptionOrder{
			Id:              402,
			UserId:          invitee.Id,
			PlanId:          plan.Id,
			Money:           20,
			TradeNo:         "subscription-online-epay",
			PaymentMethod:   "wxpay",
			PaymentProvider: PaymentProviderEpay,
			CreateTime:      common.GetTimestamp(),
			Status:          common.TopUpStatusPending,
		}
		order.ApplyPlanSnapshot(plan)
		require.NoError(t, order.Insert())

		completed, err := CompleteSubscriptionOrderWithResult("subscription-online-epay", `{"ok":true}`, PaymentProviderEpay, "alipay")
		require.NoError(t, err)
		require.True(t, completed)

		commission := getAffiliateCommissionBySource(t, AffiliateCommissionSourceSubscriptionOrder, order.Id)
		require.Equal(t, AffiliateCommissionStatusGranted, commission.Status)
		require.Equal(t, 1000000, commission.CommissionQuota)

		updatedInviter := getAffiliateUser(t, inviter.Id)
		require.Equal(t, 1000000, updatedInviter.AffQuota)
		require.Equal(t, 1000000, updatedInviter.AffHistoryQuota)
	})
}
