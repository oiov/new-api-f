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
			{CreatedAt: now - 15*60, Type: LogTypeError, Group: "vip", UserId: 2, ModelName: "gpt", TokenName: "main", Content: "status_code=429, rate limit", UseTime: 2},
			{CreatedAt: now - 20*60, Type: LogTypeError, Group: "vip", UserId: 2, ModelName: "gpt", TokenName: "main", Content: "500", UseTime: 5},
			{CreatedAt: now - 90*60, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt", TokenName: "main", Quota: 20, PromptTokens: 10, CompletionTokens: 5, UseTime: 7},
			{CreatedAt: now - 30*60, Type: LogTypeConsume, Group: "default", UserId: 3, ModelName: "gpt", TokenName: "main", Quota: 30, PromptTokens: 20, CompletionTokens: 10, UseTime: 4},
			{CreatedAt: now - 25*60*60, Type: LogTypeConsume, Group: "vip", UserId: 1, ModelName: "gpt", TokenName: "main", Quota: 99},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{
			StartTimestamp:        now - 24*60*60,
			EndTimestamp:          now,
			Group:                 "vip",
			IgnoreRateLimitErrors: true,
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

func TestGetGroupLogHealthStatsCanIncludeRateLimitErrors(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		now := time.Now().Unix()
		logs := []*Log{
			{CreatedAt: now - 10, Type: LogTypeConsume, Group: "vip"},
			{CreatedAt: now - 9, Type: LogTypeError, Group: "vip", Content: "status_code=429, rate limit"},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{StartTimestamp: now - 60, EndTimestamp: now, Group: "vip"})
		require.NoError(t, err)
		require.Len(t, stats, 1)
		assert.EqualValues(t, 2, stats[0].TotalCount)
		assert.EqualValues(t, 1, stats[0].ErrorCount)
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

func TestGetGroupLogHealthStatsIncludesTopErrorReasons(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		now := time.Now().Unix()
		logs := []*Log{
			{CreatedAt: now - 10, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "status_code=429, rate limit", UseTime: 1},
			{CreatedAt: now - 9, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "status_code=429, rate limit", UseTime: 1},
			{CreatedAt: now - 8, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "quota exceeded", UseTime: 1},
			{CreatedAt: now - 7, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "bad request", UseTime: 1},
			{CreatedAt: now - 6, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "auth failed", UseTime: 1},
			{CreatedAt: now - 5, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "status_code=429, rate limit again", UseTime: 1},
			{CreatedAt: now - 4, Type: LogTypeConsume, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "status_code=429, rate limit", UseTime: 1},
			{CreatedAt: now - 3, Type: LogTypeError, Group: "vip", UserId: 2, Username: "bob", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "status_code=429, rate limit", UseTime: 1},
			{CreatedAt: now - 2, Type: LogTypeError, Group: "free", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "other group", UseTime: 1},
			{CreatedAt: now - 70, Type: LogTypeError, Group: "vip", UserId: 1, Username: "alice", ModelName: "gpt-4o", TokenName: "main", ChannelId: 2, Content: "outside window", UseTime: 1},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{
			StartTimestamp: now - 60,
			EndTimestamp:   now,
			UserId:         1,
			Username:       "alice",
			TokenName:      "main",
			ModelName:      "gpt-4o",
			Channel:        2,
			Group:          "vip",
			StatusCode:     "429",
		})
		require.NoError(t, err)
		require.Len(t, stats, 1)
		require.Len(t, stats[0].ErrorReasons, 2)
		assert.Equal(t, GroupLogHealthErrorReason{Content: "status_code=429, rate limit", Count: 2, StatusCode: "429"}, stats[0].ErrorReasons[0])
		assert.Equal(t, GroupLogHealthErrorReason{Content: "status_code=429, rate limit again", Count: 1, StatusCode: "429"}, stats[0].ErrorReasons[1])
	})
}

func TestGetGroupLogHealthStatsLimitsErrorReasonsPerGroup(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		now := time.Now().Unix()
		logs := []*Log{
			{CreatedAt: now - 6, Type: LogTypeError, Group: "vip", Content: "delta"},
			{CreatedAt: now - 5, Type: LogTypeError, Group: "vip", Content: "alpha"},
			{CreatedAt: now - 4, Type: LogTypeError, Group: "vip", Content: "charlie"},
			{CreatedAt: now - 3, Type: LogTypeError, Group: "vip", Content: "bravo"},
			{CreatedAt: now - 2, Type: LogTypeError, Group: "vip", Content: "alpha"},
			{CreatedAt: now - 1, Type: LogTypeError, Group: "", Content: "empty group"},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		stats, err := GetGroupLogHealthStats(GroupLogHealthStatsQuery{StartTimestamp: now - 60, EndTimestamp: now})
		require.NoError(t, err)

		byGroup := make(map[string]GroupLogHealthStat)
		for _, stat := range stats {
			byGroup[stat.Group] = stat
		}

		require.Len(t, byGroup["vip"].ErrorReasons, 3)
		assert.Equal(t, "alpha", byGroup["vip"].ErrorReasons[0].Content)
		assert.EqualValues(t, 2, byGroup["vip"].ErrorReasons[0].Count)
		assert.Equal(t, "bravo", byGroup["vip"].ErrorReasons[1].Content)
		assert.Equal(t, "charlie", byGroup["vip"].ErrorReasons[2].Content)
		require.Len(t, byGroup["default"].ErrorReasons, 1)
		assert.Equal(t, "empty group", byGroup["default"].ErrorReasons[0].Content)
	})
}
