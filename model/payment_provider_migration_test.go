package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigratePaymentProviderColumnsAddsMissingColumns(t *testing.T) {
	oldDB := DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	DB = db
	common.UsingSQLite = true
	t.Cleanup(func() {
		DB = oldDB
		common.UsingSQLite = oldUsingSQLite
	})

	require.NoError(t, DB.Exec(`
CREATE TABLE top_ups (
	id integer PRIMARY KEY AUTOINCREMENT,
	user_id integer,
	amount bigint,
	money real,
	trade_no varchar(255),
	payment_method varchar(50),
	create_time bigint,
	complete_time bigint,
	status varchar(32),
	invoiced numeric DEFAULT 0
)`).Error)
	require.NoError(t, DB.Exec(`
CREATE TABLE subscription_orders (
	id integer PRIMARY KEY AUTOINCREMENT,
	user_id integer,
	plan_id integer,
	money real,
	trade_no varchar(255),
	payment_method varchar(50),
	status varchar(32),
	create_time bigint,
	complete_time bigint
)`).Error)

	require.False(t, DB.Migrator().HasColumn(&TopUp{}, "payment_provider"))
	require.False(t, DB.Migrator().HasColumn(&SubscriptionOrder{}, "payment_provider"))

	require.NoError(t, migratePaymentProviderColumns())

	require.True(t, DB.Migrator().HasColumn(&TopUp{}, "payment_provider"))
	require.True(t, DB.Migrator().HasColumn(&SubscriptionOrder{}, "payment_provider"))

	require.NoError(t, DB.Create(&TopUp{
		UserId:          1,
		Amount:          5,
		Money:           5,
		TradeNo:         "legacy-topup-migrated",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
	}).Error)
}
