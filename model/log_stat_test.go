package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withLogStatTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldCommonGroupCol := commonGroupCol
	oldCommonKeyCol := commonKeyCol
	oldLogGroupCol := logGroupCol
	oldLogKeyCol := logKeyCol

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	initCol()

	require.NoError(t, db.AutoMigrate(&Log{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		commonGroupCol = oldCommonGroupCol
		commonKeyCol = oldCommonKeyCol
		logGroupCol = oldLogGroupCol
		logKeyCol = oldLogKeyCol
	})

	run()
}

func TestSumUsedQuotaIncludesPromptCacheStatsForCurrentFilters(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		logs := []Log{
			{
				Id:               1,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gpt-5",
				Group:            "vip",
				ChannelId:        7,
				Type:             LogTypeConsume,
				CreatedAt:        now - 300,
				Quota:            10,
				PromptTokens:     100,
				CompletionTokens: 20,
				Other:            `{"cache_tokens":40}`,
			},
			{
				Id:               2,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gpt-5",
				Group:            "vip",
				ChannelId:        7,
				Type:             LogTypeConsume,
				CreatedAt:        now - 250,
				Quota:            20,
				PromptTokens:     50,
				CompletionTokens: 10,
				Other:            `{"prompt_cache_hit_tokens":25}`,
			},
			{
				Id:               3,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gpt-5",
				Group:            "vip",
				ChannelId:        7,
				Type:             LogTypeConsume,
				CreatedAt:        now - 200,
				Quota:            30,
				PromptTokens:     80,
				CompletionTokens: 5,
				Other:            `{"cache_creation_tokens_5m":30,"cache_creation_tokens_1h":50}`,
			},
			{
				Id:               4,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gpt-5",
				Group:            "vip",
				ChannelId:        7,
				Type:             LogTypeConsume,
				CreatedAt:        now - 100,
				Quota:            40,
				PromptTokens:     120,
				CompletionTokens: 15,
				Other:            `{}`,
			},
			{
				Id:               5,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "claude-ignored",
				Group:            "vip",
				ChannelId:        7,
				Type:             LogTypeConsume,
				CreatedAt:        now - 100,
				Quota:            50,
				PromptTokens:     300,
				CompletionTokens: 30,
				Other:            `{"cache_tokens":300}`,
			},
		}
		require.NoError(t, DB.Create(&logs).Error)

		stat, err := SumUsedQuota(0, now-400, now, 10, "gpt-5", "alice", "prod", 7, "vip", "", "", "", 0, 0)
		require.NoError(t, err)

		require.EqualValues(t, 100, stat.Quota)
		require.EqualValues(t, 4, stat.PromptCacheTotalCount)
		require.EqualValues(t, 2, stat.PromptCacheHitCount)
		require.InDelta(t, 0.5, stat.PromptCacheHitRate, 0.0001)
		require.EqualValues(t, 350, stat.PromptCacheInputTokens)
		require.EqualValues(t, 65, stat.PromptCacheReadTokens)
		require.EqualValues(t, 80, stat.PromptCacheWriteTokens)
	})
}
