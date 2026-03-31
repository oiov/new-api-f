package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withChannelUsageTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled
	oldChannelsIDM := channelsIDM
	oldGroup2model2channels := group2model2channels

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	common.MemoryCacheEnabled = true
	common.BatchUpdateEnabled = false
	channelsIDM = nil
	group2model2channels = nil

	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
		channelsIDM = oldChannelsIDM
		group2model2channels = oldGroup2model2channels
	})

	run()
}

func TestUpdateChannelUsageUpdatesMemoryCacheImmediately(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		channel := &Channel{
			Id:       1,
			Name:     "test-channel",
			Key:      "sk-test",
			Status:   common.ChannelStatusEnabled,
			Group:    "default",
			Models:   "gpt-4o-mini",
			Weight:   common.GetPointer[uint](0),
			Priority: common.GetPointer[int64](0),
		}
		require.NoError(t, DB.Create(channel).Error)
		require.NoError(t, channel.AddAbilities(nil))

		InitChannelCache()

		UpdateChannelUsedQuota(channel.Id, 120)
		UpdateChannelRequestCount(channel.Id, 1)

		cached, err := CacheGetChannel(channel.Id)
		require.NoError(t, err)
		assert.EqualValues(t, 120, cached.UsedQuota)
		assert.EqualValues(t, 1, cached.UsedCount)

		var persisted Channel
		require.NoError(t, DB.Select("used_quota", "used_count").Where("id = ?", channel.Id).First(&persisted).Error)
		assert.EqualValues(t, 120, persisted.UsedQuota)
		assert.EqualValues(t, 1, persisted.UsedCount)
	})
}
