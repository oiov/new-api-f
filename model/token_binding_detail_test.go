package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withTokenBindingDetailTestDB(t *testing.T, run func()) {
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
		&Token{},
		&Channel{},
		&UserSubscription{},
	))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestGetActiveSpecificChannelKeyBindingDetailMap_IncludesUserSubscriptions(t *testing.T) {
	withTokenBindingDetailTestDB(t, func() {
		now := common.GetTimestamp()

		require.NoError(t, DB.Create(&User{
			Id:       2001,
			Username: "binding_user",
			AffCode:  "binding_aff",
			Group:    "sub_plan_claude_lite",
			Status:   common.UserStatusEnabled,
		}).Error)

		require.NoError(t, DB.Create(&Channel{
			Id:          4001,
			Name:        "Claude Lite Pool",
			Key:         "sk-a\nsk-b",
			Status:      common.ChannelStatusEnabled,
			Group:       "sub_plan_claude_lite",
			CreatedTime: now,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 2,
			},
		}).Error)

		sub := &UserSubscription{
			Id:                      5001,
			UserId:                  2001,
			PlanId:                  3001,
			ResourceType:            SubscriptionResourceRequestCount,
			RequestCountTotal:       15000,
			RequestCountPeriodTotal: 500,
			Status:                  "active",
			StartTime:               now - 3600,
			EndTime:                 now + 7200,
			UpgradeGroup:            "sub_plan_claude_lite",
			SpecificChannelId:       4001,
			SpecificChannelKeyIndex: 0,
			CreatedAt:               now - 3600,
			UpdatedAt:               now - 3600,
		}
		require.NoError(t, DB.Create(sub).Error)
		require.NoError(t, DB.Model(&UserSubscription{}).
			Where("id = ?", 5001).
			Update("specific_channel_key_index", 0).Error)

		detailMap, err := GetActiveSpecificChannelKeyBindingDetailMap(4001)
		require.NoError(t, err)

		detail, ok := detailMap[0]
		require.True(t, ok)
		require.EqualValues(t, 1, detail.BindingCount)
		require.Contains(t, detail.BindingGroups, "sub_plan_claude_lite")
		require.Len(t, detail.BindingUsers, 1)
		require.Equal(t, 2001, detail.BindingUsers[0].UserId)
		require.Equal(t, "binding_user", detail.BindingUsers[0].Username)
		require.Equal(t, -5001, detail.BindingUsers[0].TokenId)
		require.Equal(t, "sub_plan_claude_lite", detail.BindingUsers[0].TokenGroup)
	})
}
