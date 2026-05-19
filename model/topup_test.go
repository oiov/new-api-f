package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withTopUpTestDB(t *testing.T, run func()) {
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

	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestGetAllTopUpsByFilter(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 1, Username: "u1", AffCode: "aff_u1", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&User{Id: 2, Username: "u2", AffCode: "aff_u2", Status: common.UserStatusEnabled}).Error)

		require.NoError(t, DB.Create(&TopUp{UserId: 1, Amount: 100, Money: 1.0, TradeNo: "t-u1-success", PaymentMethod: "alipay", CreateTime: 1700000000, Status: common.TopUpStatusSuccess}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 1, Amount: 200, Money: 2.0, TradeNo: "t-u1-pending", PaymentMethod: "alipay", CreateTime: 1700001000, Status: common.TopUpStatusPending}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 2, Amount: 300, Money: 3.0, TradeNo: "t-u2-success", PaymentMethod: "stripe", CreateTime: 1700002000, Status: common.TopUpStatusSuccess}).Error)

		pageInfo := &common.PageInfo{Page: 1, PageSize: 20}
		items, total, err := GetAllTopUpsWithFilters(pageInfo, TopUpAdminFilters{
			UserID:         1,
			Keyword:        "u1",
			Status:         common.TopUpStatusSuccess,
			StartTimestamp: 1699999999,
			EndTimestamp:   1700000001,
		})
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, "t-u1-success", items[0].TradeNo)
	})
}

func TestGetUserTopUpsLimitsDefaultWindow(t *testing.T) {
	withTopUpTestDB(t, func() {
		now := common.GetTimestamp()
		require.NoError(t, DB.Create(&User{Id: 3, Username: "u3", AffCode: "aff_u3", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 3, Amount: 100, Money: 1.0, TradeNo: "recent-topup", PaymentMethod: "alipay", CreateTime: now - 3600, Status: common.TopUpStatusSuccess}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 3, Amount: 100, Money: 1.0, TradeNo: "old-topup", PaymentMethod: "alipay", CreateTime: now - 31*24*3600, Status: common.TopUpStatusSuccess}).Error)

		items, total, err := GetUserTopUpsWithFilters(3, &common.PageInfo{Page: 1, PageSize: 20}, TopUpUserFilters{})
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, "recent-topup", items[0].TradeNo)
	})
}

func TestTopUpSearchRejectsWildcardFlood(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 4, Username: "u4", AffCode: "aff_u4", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 4, Amount: 100, Money: 1.0, TradeNo: "wildcard-target", PaymentMethod: "alipay", CreateTime: common.GetTimestamp(), Status: common.TopUpStatusSuccess}).Error)

		_, _, err := SearchUserTopUps(4, "%%", &common.PageInfo{Page: 1, PageSize: 20})
		require.Error(t, err)
		require.Contains(t, err.Error(), "连续的 %")

		_, _, err = SearchAllTopUps("%%%target", &common.PageInfo{Page: 1, PageSize: 20})
		require.Error(t, err)
		require.Contains(t, err.Error(), "连续的 %")
	})
}

func TestTopUpSearchEscapesUnderscore(t *testing.T) {
	withTopUpTestDB(t, func() {
		now := common.GetTimestamp()
		require.NoError(t, DB.Create(&User{Id: 5, Username: "u5", AffCode: "aff_u5", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 5, Amount: 100, Money: 1.0, TradeNo: "abc_def", PaymentMethod: "alipay", CreateTime: now, Status: common.TopUpStatusSuccess}).Error)
		require.NoError(t, DB.Create(&TopUp{UserId: 5, Amount: 100, Money: 1.0, TradeNo: "abcXdef", PaymentMethod: "alipay", CreateTime: now, Status: common.TopUpStatusSuccess}).Error)

		items, total, err := SearchUserTopUps(5, "abc_def", &common.PageInfo{Page: 1, PageSize: 20})
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, "abc_def", items[0].TradeNo)
	})
}

func TestValidateTopUpPaidMoney(t *testing.T) {
	topUp := &TopUp{Money: 12.345}
	require.NoError(t, ValidateTopUpPaidMoney(topUp, decimal.RequireFromString("12.35")))
	require.ErrorIs(t, ValidateTopUpPaidMoney(topUp, decimal.RequireFromString("12.36")), ErrPaymentAmountMismatch)
	require.EqualError(t, ValidateTopUpPaidMoney(nil, decimal.RequireFromString("1.00")), "充值订单不存在")
}

func TestRechargeEpayRejectsCrossGatewayOrder(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 11, Username: "u11", AffCode: "aff_u11", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:          11,
			Amount:          10,
			Money:           1,
			TradeNo:         "stripe-order-from-epay-callback",
			PaymentMethod:   PaymentMethodStripe,
			PaymentProvider: PaymentProviderStripe,
			CreateTime:      time.Now().Unix(),
			Status:          common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeEpay("stripe-order-from-epay-callback", "alipay")
		require.Error(t, err)
		require.False(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "stripe-order-from-epay-callback").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusPending, topUp.Status)

		var user User
		require.NoError(t, DB.First(&user, 11).Error)
		require.Zero(t, user.Quota)
	})
}

func TestRechargeEpayAcceptsLegacyEpayOrderAndUpdatesActualPaymentMethod(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 12, Username: "u12", AffCode: "aff_u12", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:        12,
			Amount:        10,
			Money:         1,
			TradeNo:       "legacy-epay-order",
			PaymentMethod: "wxpay",
			CreateTime:    time.Now().Unix(),
			Status:        common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeEpay("legacy-epay-order", "alipay")
		require.NoError(t, err)
		require.True(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "legacy-epay-order").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		require.Equal(t, "alipay", topUp.PaymentMethod)
		require.Equal(t, PaymentProviderEpay, topUp.PaymentProvider)

		var user User
		require.NoError(t, DB.First(&user, 12).Error)
		require.Equal(t, int(10*common.QuotaPerUnit), user.Quota)
	})
}

func TestRechargeStripeRejectsEpayProviderEvenIfMethodWasTampered(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 13, Username: "u13", AffCode: "aff_u13", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:          13,
			Amount:          10,
			Money:           1,
			TradeNo:         "epay-order-with-stripe-method",
			PaymentMethod:   PaymentMethodStripe,
			PaymentProvider: PaymentProviderEpay,
			CreateTime:      time.Now().Unix(),
			Status:          common.TopUpStatusPending,
		}).Error)

		completed, err := Recharge("epay-order-with-stripe-method", "cus_test")
		require.Error(t, err)
		require.False(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "epay-order-with-stripe-method").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusPending, topUp.Status)
	})
}

func TestStripeExpireRejectsEpayProviderEvenIfMethodWasTampered(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 14, Username: "u14", AffCode: "aff_u14", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:          14,
			Amount:          10,
			Money:           1,
			TradeNo:         "epay-order-from-stripe-expire",
			PaymentMethod:   PaymentMethodStripe,
			PaymentProvider: PaymentProviderEpay,
			CreateTime:      time.Now().Unix(),
			Status:          common.TopUpStatusPending,
		}).Error)

		err := UpdatePendingTopUpStatus("epay-order-from-stripe-expire", PaymentProviderStripe, common.TopUpStatusExpired)
		require.ErrorIs(t, err, ErrPaymentMethodMismatch)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "epay-order-from-stripe-expire").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusPending, topUp.Status)
	})
}

func TestRechargeCreemRejectsStripeProviderEvenIfMethodWasTampered(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 15, Username: "u15", AffCode: "aff_u15", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:          15,
			Amount:          100,
			Money:           1,
			TradeNo:         "stripe-order-with-creem-method",
			PaymentMethod:   PaymentMethodCreem,
			PaymentProvider: PaymentProviderStripe,
			CreateTime:      time.Now().Unix(),
			Status:          common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeCreem("stripe-order-with-creem-method", "pay@example.com", "payer")
		require.Error(t, err)
		require.False(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "stripe-order-with-creem-method").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusPending, topUp.Status)

		var user User
		require.NoError(t, DB.First(&user, 15).Error)
		require.Zero(t, user.Quota)
	})
}

func TestRechargeCreemAcceptsLegacyCreemOrderAndBackfillsProvider(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 16, Username: "u16", AffCode: "aff_u16", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:        16,
			Amount:        100,
			Money:         1,
			TradeNo:       "legacy-creem-order",
			PaymentMethod: PaymentMethodCreem,
			CreateTime:    time.Now().Unix(),
			Status:        common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeCreem("legacy-creem-order", "pay@example.com", "payer")
		require.NoError(t, err)
		require.True(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "legacy-creem-order").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		require.Equal(t, PaymentProviderCreem, topUp.PaymentProvider)

		var user User
		require.NoError(t, DB.First(&user, 16).Error)
		require.Equal(t, 100, user.Quota)
	})
}

func TestRechargeWaffoRejectsStripeProviderEvenIfMethodWasTampered(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 17, Username: "u17", AffCode: "aff_u17", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:          17,
			Amount:          10,
			Money:           1,
			TradeNo:         "stripe-order-with-waffo-method",
			PaymentMethod:   PaymentMethodWaffo,
			PaymentProvider: PaymentProviderStripe,
			CreateTime:      time.Now().Unix(),
			Status:          common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeWaffo("stripe-order-with-waffo-method")
		require.Error(t, err)
		require.False(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "stripe-order-with-waffo-method").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusPending, topUp.Status)

		var user User
		require.NoError(t, DB.First(&user, 17).Error)
		require.Zero(t, user.Quota)
	})
}

func TestRechargeWaffoAcceptsLegacyWaffoOrderAndBackfillsProvider(t *testing.T) {
	withTopUpTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 18, Username: "u18", AffCode: "aff_u18", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&TopUp{
			UserId:        18,
			Amount:        10,
			Money:         1,
			TradeNo:       "legacy-waffo-order",
			PaymentMethod: PaymentMethodWaffo,
			CreateTime:    time.Now().Unix(),
			Status:        common.TopUpStatusPending,
		}).Error)

		completed, err := RechargeWaffo("legacy-waffo-order")
		require.NoError(t, err)
		require.True(t, completed)

		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", "legacy-waffo-order").First(&topUp).Error)
		require.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		require.Equal(t, PaymentProviderWaffo, topUp.PaymentProvider)

		var user User
		require.NoError(t, DB.First(&user, 18).Error)
		require.Equal(t, int(10*common.QuotaPerUnit), user.Quota)
	})
}
