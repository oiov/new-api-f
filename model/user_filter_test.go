package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withUserFilterTestDB(t *testing.T, run func()) {
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

	require.NoError(t, db.AutoMigrate(&User{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestApplyUserStatusFilterAcceptsKnownStatusesOnly(t *testing.T) {
	withUserFilterTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 1, Username: "enabled_user", AffCode: "aff_enabled", Status: common.UserStatusEnabled}).Error)
		require.NoError(t, DB.Create(&User{Id: 2, Username: "disabled_user", AffCode: "aff_disabled", Status: common.UserStatusDisabled}).Error)
		require.NoError(t, DB.Create(&User{Id: 3, Username: "banned_user", AffCode: "aff_banned", Status: common.UserStatusBanned}).Error)

		pageInfo := &common.PageInfo{Page: 1, PageSize: 20}

		users, total, err := GetAllUsers(pageInfo, "1", "id", "desc")
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, users, 1)
		require.Equal(t, common.UserStatusEnabled, users[0].Status)

		users, total, err = SearchUsers("user", "", "2", 0, 20, "id", "desc")
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, users, 1)
		require.Equal(t, common.UserStatusDisabled, users[0].Status)

		users, total, err = GetAllUsers(pageInfo, "3", "id", "desc")
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, users, 1)
		require.Equal(t, common.UserStatusBanned, users[0].Status)

		_, _, err = GetAllUsers(pageInfo, "0", "id", "desc")
		require.EqualError(t, err, "无效的用户状态")

		_, _, err = GetAllUsers(pageInfo, "4", "id", "desc")
		require.EqualError(t, err, "无效的用户状态")

		_, _, err = SearchUsers("user", "", "invalid", 0, 20, "id", "desc")
		require.EqualError(t, err, "无效的用户状态")
	})
}
