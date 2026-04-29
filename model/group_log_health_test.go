package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withGroupLogHealthTestDB(t *testing.T, run func()) {
	t.Helper()

	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	LOG_DB = db
	common.UsingSQLite = true
	initCol()

	require.NoError(t, db.AutoMigrate(&Log{}))

	t.Cleanup(func() {
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestGetGroupLogHealthStatsAggregatesByGroupAndWindow(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		now := time.Now().Unix()
		logs := []*Log{
			{CreatedAt: now - 10*60, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt", TokenName: "main", Quota: 10, PromptTokens: 8, CompletionTokens: 2, UseTime: 3},
			{CreatedAt: now - 20*60, Type: LogTypeError, Group: "vip", UserId: 2, ModelName: "gpt", TokenName: "main", Content: "500", UseTime: 5},
			{CreatedAt: now - 90*60, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt", TokenName: "main", Quota: 20, PromptTokens: 10, CompletionTokens: 5, UseTime: 7},
			{CreatedAt: now - 30*60, Type: LogTypeConsume, Group: "default", UserId: 3, ModelName: "gpt", TokenName: "main", Quota: 30, PromptTokens: 20, CompletionTokens: 10, UseTime: 4},
			{CreatedAt: now - 25*60*60, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt", TokenName: "main", Quota: 99},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{
			StartTimestamp: now - 24*60*60,
			EndTimestamp:   now,
			Group:          "vip",
		})
		require.NoError(t, err)
		require.Len(t, stats, 1)

		stat := stats[0]
		assert.Equal(t, "vip", stat.Group)
		assert.EqualValues(t, 3, stat.TotalCount)
		assert.EqualValues(t, 2, stat.SuccessCount)
		assert.EqualValues(t, 1, stat.ErrorCount)
		assert.EqualValues(t, 30, stat.Quota)
		assert.EqualValues(t, 25, stat.Tokens)
		assert.InDelta(t, 66.67, stat.SuccessRate, 0.01)
		assert.InDelta(t, 5, stat.AvgUseTime, 0.01)
		assert.EqualValues(t, now-90*60, stat.FirstSeenAt)
		assert.EqualValues(t, now-10*60, stat.LastSeenAt)
	})
}

func TestGetGroupLogHealthStatsFiltersByUserAndModel(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		now := time.Now().Unix()
		logs := []*Log{
			{CreatedAt: now - 10, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt-4o"},
			{CreatedAt: now - 10, Type: LogTypeError, Group: "vip", UserId: 2, ModelName: "gpt-4o"},
			{CreatedAt: now - 10, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "claude"},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{
			StartTimestamp: now - 60,
			EndTimestamp:   now,
			UserId:         1,
			ModelName:      "gpt-4o",
		})
		require.NoError(t, err)
		require.Len(t, stats, 1)
		assert.EqualValues(t, 1, stats[0].TotalCount)
		assert.EqualValues(t, 1, stats[0].SuccessCount)
		assert.EqualValues(t, 0, stats[0].ErrorCount)
	})
}
