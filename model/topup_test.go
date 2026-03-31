package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
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
