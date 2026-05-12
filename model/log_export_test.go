package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGetAllLogsForExportSupportsCompactBillingRows(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		require.NoError(t, LOG_DB.Create(&Log{
			Id:               1,
			UserId:           43,
			Username:         "wqwe159",
			TokenName:        "settlement",
			ModelName:        "gpt-5",
			Group:            "codex",
			Type:             LogTypeConsume,
			CreatedAt:        now,
			Quota:            500000,
			PromptTokens:     1000,
			CompletionTokens: 200,
			UseTime:          3,
			IsStream:         true,
			Ip:               "127.0.0.1",
			RequestId:        "req-1",
			Content:          strings.Repeat("large-content", 1024),
			Other:            `{"messages_preview":"sensitive","cache_tokens":100}`,
		}).Error)

		logs, total, truncated, err := GetAllLogsForExport(2, now-10, now+10, 43, "", "wqwe159", "", 0, "codex", "", "", "", 0, 0, false, true)
		require.NoError(t, err)
		require.False(t, truncated)
		require.EqualValues(t, 1, total)
		require.Len(t, logs, 1)
		require.Equal(t, "req-1", logs[0].RequestId)
		require.Equal(t, 500000, logs[0].Quota)
		require.Empty(t, logs[0].Content)
		require.Empty(t, logs[0].Other)
	})
}

func TestGetAllLogsForExportKeepsOrderAcrossBatches(t *testing.T) {
	withLogStatTestDB(t, func() {
		oldBatchSize := logExportBatchSize
		logExportBatchSize = 2
		t.Cleanup(func() {
			logExportBatchSize = oldBatchSize
		})

		now := common.GetTimestamp()
		for i := 1; i <= 5; i++ {
			require.NoError(t, LOG_DB.Create(&Log{
				Id:        i,
				UserId:    43,
				Username:  "wqwe159",
				Group:     "codex",
				Type:      LogTypeConsume,
				CreatedAt: now + int64(i),
				RequestId: "req",
			}).Error)
		}

		logs, total, truncated, err := GetAllLogsForExport(2, now, now+10, 43, "", "wqwe159", "", 0, "codex", "", "", "", 0, 0, false, true)
		require.NoError(t, err)
		require.False(t, truncated)
		require.EqualValues(t, 5, total)
		require.Len(t, logs, 5)
		require.Equal(t, []int{5, 4, 3, 2, 1}, []int{logs[0].Id, logs[1].Id, logs[2].Id, logs[3].Id, logs[4].Id})
	})
}
