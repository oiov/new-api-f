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

func TestGetSpecificKeyReturnsErrorWhenMultiKeyLimitReached(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		channel := &Channel{
			Id:     2,
			Name:   "multi-key-channel",
			Key:    "sk-a\nsk-b",
			Status: common.ChannelStatusEnabled,
			Group:  "default",
			Models: "gpt-4o-mini",
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 2,
				MultiKeyStatusList: map[int]int{
					0: common.ChannelStatusEnabled,
					1: common.ChannelStatusEnabled,
				},
				MultiKeyUsedCount: map[int]int64{
					0: 3,
				},
				MultiKeyMaxRequestCount: map[int]int64{
					0: 3,
				},
			},
			Weight:   common.GetPointer[uint](0),
			Priority: common.GetPointer[int64](0),
		}
		require.NoError(t, DB.Create(channel).Error)

		_, errResp := channel.GetSpecificKey(0)
		require.NotNil(t, errResp)

		key, okResp := channel.GetSpecificKey(1)
		require.Nil(t, okResp)
		assert.Equal(t, "sk-b", key)
	})
}

func TestGetSpecificKeyReturnsErrorWhenSingleKeyLimitReached(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		channel := &Channel{
			Id:              5,
			Name:            "single-key-channel",
			Key:             "sk-only",
			Status:          common.ChannelStatusEnabled,
			Group:           "default",
			Models:          "gpt-4o-mini",
			UsedCount:       3,
			MaxRequestCount: 3,
			Weight:          common.GetPointer[uint](0),
			Priority:        common.GetPointer[int64](0),
		}
		require.NoError(t, DB.Create(channel).Error)

		_, errResp := channel.GetSpecificKey(0)
		require.NotNil(t, errResp)
	})
}

func TestResetChannelRequestCountsBatchResetsSingleAndMultiKeyUsage(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		single := &Channel{
			Id:              3,
			Name:            "single",
			Key:             "sk-single",
			Status:          common.ChannelStatusEnabled,
			Group:           "default",
			Models:          "gpt-4o-mini",
			UsedCount:       8,
			MaxRequestCount: 10,
			Weight:          common.GetPointer[uint](0),
			Priority:        common.GetPointer[int64](0),
		}
		multi := &Channel{
			Id:        4,
			Name:      "multi",
			Key:       "sk-1\nsk-2",
			Status:    common.ChannelStatusEnabled,
			Group:     "default",
			Models:    "gpt-4o-mini",
			UsedCount: 5,
			ChannelInfo: ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: 2,
				MultiKeyUsedCount: map[int]int64{
					0: 2,
					1: 3,
				},
			},
			Weight:   common.GetPointer[uint](0),
			Priority: common.GetPointer[int64](0),
		}
		require.NoError(t, DB.Create(single).Error)
		require.NoError(t, DB.Create(multi).Error)
		require.NoError(t, single.AddAbilities(nil))
		require.NoError(t, multi.AddAbilities(nil))

		InitChannelCache()

		nextLastID, scanned, reset, err := ResetChannelRequestCountsBatch(0, 10)
		require.NoError(t, err)
		assert.EqualValues(t, 4, nextLastID)
		assert.EqualValues(t, 2, scanned)
		assert.EqualValues(t, 2, reset)

		var reloadedSingle Channel
		require.NoError(t, DB.Select("used_count").Where("id = ?", single.Id).First(&reloadedSingle).Error)
		assert.EqualValues(t, 0, reloadedSingle.UsedCount)

		var reloadedMulti Channel
		require.NoError(t, DB.Select("used_count", "channel_info").Where("id = ?", multi.Id).First(&reloadedMulti).Error)
		assert.EqualValues(t, 0, reloadedMulti.UsedCount)
		assert.Nil(t, reloadedMulti.ChannelInfo.MultiKeyUsedCount)

		cachedSingle, err := CacheGetChannel(single.Id)
		require.NoError(t, err)
		assert.EqualValues(t, 0, cachedSingle.UsedCount)

		cachedMulti, err := CacheGetChannel(multi.Id)
		require.NoError(t, err)
		assert.EqualValues(t, 0, cachedMulti.UsedCount)
		assert.Nil(t, cachedMulti.ChannelInfo.MultiKeyUsedCount)
	})
}
