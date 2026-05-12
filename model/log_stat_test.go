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
				IsStream:         true,
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
				IsStream:         true,
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
				IsStream:         true,
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
				IsStream:         true,
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
				IsStream:         true,
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
		require.EqualValues(t, 0, stat.PromptCacheReadTokens)
		require.EqualValues(t, 0, stat.PromptCacheWriteTokens)
		require.EqualValues(t, 2, stat.PromptCacheOpenAI.HitCount)
		require.EqualValues(t, 4, stat.PromptCacheOpenAI.TotalCount)
		require.InDelta(t, 0.5, stat.PromptCacheOpenAI.HitRate, 0.0001)
		require.EqualValues(t, 0, stat.PromptCacheClaude.HitCount)
		require.EqualValues(t, 0, stat.PromptCacheClaude.TotalCount)
	})
}

func TestSumUsedQuotaCountsPeriodTotalsAndStreamingOnlyPromptCacheStats(t *testing.T) {
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
				IsStream:         true,
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
				IsStream:         false,
				Other:            `{"cache_tokens":50}`,
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
				IsStream:         true,
				Other:            `{}`,
			},
		}
		require.NoError(t, DB.Create(&logs).Error)

		stat, err := SumUsedQuota(0, now-400, now, 10, "gpt-5", "alice", "prod", 7, "vip", "", "", "", 0, 0)
		require.NoError(t, err)

		require.EqualValues(t, 60, stat.Quota)
		require.EqualValues(t, 3, stat.RequestCount)
		require.EqualValues(t, 2, stat.PromptCacheTotalCount)
		require.EqualValues(t, 1, stat.PromptCacheHitCount)
		require.InDelta(t, 0.5, stat.PromptCacheHitRate, 0.0001)
		require.EqualValues(t, 180, stat.PromptCacheInputTokens)
		require.EqualValues(t, 0, stat.PromptCacheReadTokens)
		require.EqualValues(t, 0, stat.PromptCacheWriteTokens)
	})
}

func TestSumUsedQuotaSplitsPromptCacheStatsByOpenAIAndClaudeModels(t *testing.T) {
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
				Type:             LogTypeConsume,
				CreatedAt:        now - 300,
				Quota:            10,
				PromptTokens:     100,
				CompletionTokens: 20,
				IsStream:         true,
				Other:            `{"cache_tokens":40}`,
			},
			{
				Id:               2,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gpt-5-mini",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now - 250,
				Quota:            20,
				PromptTokens:     50,
				CompletionTokens: 10,
				IsStream:         true,
				Other:            `{"cache_tokens":0}`,
			},
			{
				Id:               3,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "claude-sonnet-4-6",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now - 200,
				Quota:            30,
				PromptTokens:     80,
				CompletionTokens: 5,
				IsStream:         true,
				Other:            `{"cache_tokens":30,"claude":true}`,
			},
			{
				Id:               4,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "mapped-model",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now - 100,
				Quota:            40,
				PromptTokens:     120,
				CompletionTokens: 15,
				IsStream:         true,
				Other:            `{"cache_tokens":0,"usage_semantic":"anthropic"}`,
			},
			{
				Id:               5,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "claude-opus-4-6",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now - 50,
				Quota:            50,
				PromptTokens:     300,
				CompletionTokens: 30,
				IsStream:         false,
				Other:            `{"cache_tokens":300,"claude":true}`,
			},
			{
				Id:               6,
				UserId:           10,
				Username:         "alice",
				TokenName:        "prod",
				ModelName:        "gemini-3-pro",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now - 25,
				Quota:            60,
				PromptTokens:     70,
				CompletionTokens: 30,
				IsStream:         true,
				Other:            `{"cache_tokens":70}`,
			},
		}
		require.NoError(t, DB.Create(&logs).Error)

		stat, err := SumUsedQuota(0, now-400, now, 10, "", "alice", "prod", 0, "vip", "", "", "", 0, 0)
		require.NoError(t, err)

		require.EqualValues(t, 5, stat.PromptCacheTotalCount)
		require.EqualValues(t, 3, stat.PromptCacheHitCount)
		require.InDelta(t, 0.6, stat.PromptCacheHitRate, 0.0001)
		require.EqualValues(t, 1, stat.PromptCacheOpenAI.HitCount)
		require.EqualValues(t, 2, stat.PromptCacheOpenAI.TotalCount)
		require.InDelta(t, 0.5, stat.PromptCacheOpenAI.HitRate, 0.0001)
		require.EqualValues(t, 150, stat.PromptCacheOpenAI.InputTokens)
		require.EqualValues(t, 1, stat.PromptCacheClaude.HitCount)
		require.EqualValues(t, 2, stat.PromptCacheClaude.TotalCount)
		require.InDelta(t, 0.5, stat.PromptCacheClaude.HitRate, 0.0001)
		require.EqualValues(t, 200, stat.PromptCacheClaude.InputTokens)
	})
}
