package model

import (
	"testing"

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

	require.NoError(t, db.AutoMigrate(&User{}, &UserSubscription{}))

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
