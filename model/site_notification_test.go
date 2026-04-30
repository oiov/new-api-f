package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withSiteNotificationTestDB(t *testing.T, run func()) {
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

	require.NoError(t, db.AutoMigrate(&SiteNotification{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestGetUserSiteNotificationsUsesCursorAndUnreadFilter(t *testing.T) {
	withSiteNotificationTestDB(t, func() {
		require.NoError(t, DB.Create(&SiteNotification{Id: 1, UserId: 7, Title: "n1", Content: "c1", IsRead: false}).Error)
		require.NoError(t, DB.Create(&SiteNotification{Id: 2, UserId: 7, Title: "n2", Content: "c2", IsRead: true}).Error)
		require.NoError(t, DB.Create(&SiteNotification{Id: 3, UserId: 7, Title: "n3", Content: "c3", IsRead: false}).Error)
		require.NoError(t, DB.Create(&SiteNotification{Id: 4, UserId: 8, Title: "other", Content: "other", IsRead: false}).Error)

		items, total, hasMore, nextBeforeID, err := GetUserSiteNotifications(7, 2, 0, false)
		require.NoError(t, err)
		require.EqualValues(t, 3, total)
		require.Len(t, items, 2)
		require.True(t, hasMore)
		require.Equal(t, 2, nextBeforeID)
		require.Equal(t, 3, items[0].Id)
		require.Equal(t, 2, items[1].Id)

		items, total, hasMore, nextBeforeID, err = GetUserSiteNotifications(7, 2, nextBeforeID, false)
		require.NoError(t, err)
		require.EqualValues(t, 3, total)
		require.Len(t, items, 1)
		require.False(t, hasMore)
		require.Equal(t, 1, nextBeforeID)
		require.Equal(t, 1, items[0].Id)

		items, total, hasMore, nextBeforeID, err = GetUserSiteNotifications(7, 20, 0, true)
		require.NoError(t, err)
		require.EqualValues(t, 2, total)
		require.Len(t, items, 2)
		require.False(t, hasMore)
		require.Equal(t, 1, nextBeforeID)
		require.Equal(t, 3, items[0].Id)
		require.Equal(t, 1, items[1].Id)

		_, _, _, _, err = GetUserSiteNotifications(7, 20, -1, false)
		require.EqualError(t, err, "无效的站内信游标")
	})
}
