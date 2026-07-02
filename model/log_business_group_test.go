package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestLogsCanFilterAndExportByBusinessGroup(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		logs := []Log{
			{
				Id:               1,
				UserId:           10,
				Username:         "alice",
				TokenName:        "research-a",
				BusinessGroup:    "研发部",
				ModelName:        "gpt-5",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now,
				Quota:            100,
				PromptTokens:     10,
				RequestId:        "req-research",
				CompletionTokens: 5,
			},
			{
				Id:               2,
				UserId:           10,
				Username:         "alice",
				TokenName:        "support-a",
				BusinessGroup:    "客服部",
				ModelName:        "gpt-5",
				Group:            "vip",
				Type:             LogTypeConsume,
				CreatedAt:        now + 1,
				Quota:            250,
				PromptTokens:     20,
				RequestId:        "req-support",
				CompletionTokens: 10,
			},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		items, total, err := GetUserLogs(10, LogTypeConsume, now-10, now+10, "", "", 0, 100, "", "研发部", "", "", "", 0, 0, false)
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, items, 1)
		require.Equal(t, "req-research", items[0].RequestId)
		require.Equal(t, "研发部", items[0].BusinessGroup)

		stat, err := SumUsedQuota(0, now-10, now+10, 10, "", "alice", "", 0, "vip", "研发部", "", "", "", 0, 0, LogExportFilters{})
		require.NoError(t, err)
		require.EqualValues(t, 100, stat.Quota)
		require.EqualValues(t, 1, stat.RequestCount)

		exported, total, truncated, err := GetUserLogsForExport(10, LogTypeConsume, now-10, now+10, "", "", "", "研发部", "", "", "", 0, 0, false, true, LogExportFilters{})
		require.NoError(t, err)
		require.False(t, truncated)
		require.EqualValues(t, 1, total)
		require.Len(t, exported, 1)
		require.Equal(t, "req-research", exported[0].RequestId)
	})
}
