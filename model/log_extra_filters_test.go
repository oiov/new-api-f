package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func seedExportLog(t *testing.T, id, userId int, model, token, group string, isStream bool, comp, quota int) {
	t.Helper()
	require.NoError(t, LOG_DB.Create(&Log{
		Id: id, UserId: userId, Type: LogTypeConsume,
		ModelName: model, TokenName: token, Group: group,
		IsStream: isStream, CompletionTokens: comp, Quota: quota,
		CreatedAt: common.GetTimestamp(),
	}).Error)
}

func TestGetUserLogsForExportExtraFilters(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		seedExportLog(t, 1, 10, "gpt-5", "prod", "vip", false, 20, 100)
		seedExportLog(t, 2, 10, "claude-opus-4-8", "prod", "vip", false, 30, 200)
		seedExportLog(t, 3, 10, "gpt-5", "test", "vip", false, 10, 50)

		count := func(f LogExportFilters) int {
			logs, _, _, err := GetUserLogsForExport(10, LogTypeConsume, now-100, now+100, "", "", "", "", "", "", "", 0, 0, false, false, f)
			require.NoError(t, err)
			return len(logs)
		}

		require.Equal(t, 2, count(LogExportFilters{ModelNames: []string{"gpt-5"}}))
		require.Equal(t, 3, count(LogExportFilters{}))
		require.Equal(t, 2, count(LogExportFilters{TokenNames: []string{"prod"}}))
		require.Equal(t, 3, count(LogExportFilters{ModelNames: []string{"gpt-5", "claude-opus-4-8"}}))
	})
}

func TestGetUserLogsForExportExcludeStreamZeroCompletion(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		// A: 流式对话模型 + 0输出 + 扣费 → 异常，应排除
		seedExportLog(t, 1, 10, "claude-opus-4-8", "t", "g", true, 0, 174660)
		// B: 流式 embedding + 0输出 + 扣费 → 非对话，应保留
		seedExportLog(t, 2, 10, "text-embedding-3-small", "t", "g", true, 0, 500)
		// C: 流式对话 + 有输出 → 保留
		seedExportLog(t, 3, 10, "claude-opus-4-8", "t", "g", true, 40, 200)
		// D: 非流式对话 + 0输出 + 扣费 → 保留（非流式不排除）
		seedExportLog(t, 4, 10, "claude-opus-4-8", "t", "g", false, 0, 300)

		f := LogExportFilters{
			ExcludeStreamZeroCompletion: true,
			NonChatModels:               []string{"text-embedding-3-small"},
		}
		logs, _, _, err := GetUserLogsForExport(10, LogTypeConsume, now-100, now+100, "", "", "", "", "", "", "", 0, 0, false, false, f)
		require.NoError(t, err)

		// 用户导出会清空 Id，故按特征断言：异常行 (is_stream && comp==0 && quota==174660) 必须缺席。
		require.Equal(t, 3, len(logs), "应保留 B/C/D 三条，排除 A")
		for _, l := range logs {
			anomalous := l.IsStream && l.CompletionTokens == 0 && l.Quota == 174660 && l.ModelName == "claude-opus-4-8"
			require.False(t, anomalous, "异常流式对话零输出行应被排除")
		}
		// embedding 零输出应保留
		var embeddingKept bool
		for _, l := range logs {
			if l.ModelName == "text-embedding-3-small" {
				embeddingKept = true
			}
		}
		require.True(t, embeddingKept, "embedding 零输出应保留")
	})
}
