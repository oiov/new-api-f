package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// 回归测试 (#5116): 日志列表查询应按 created_at desc 排序（id desc 兜底），
// 以便走 (created_at, ...) 复合索引并符合"最新在前"语义。
// 种入 id 与 created_at 故意反序的数据来验证排序键。
// 注意: 仅覆盖 list 查询（GetUserLogs/GetAllLogs）；导出 keyset 分页保持 id desc，不在此测试范围。
func seedOrderLogs(t *testing.T) {
	t.Helper()
	// id=1 时间最新(300)，id=2 最旧(100)，id=3 居中(200)
	for _, l := range []*Log{
		{Id: 1, UserId: 7, CreatedAt: 300, Type: LogTypeConsume},
		{Id: 2, UserId: 7, CreatedAt: 100, Type: LogTypeConsume},
		{Id: 3, UserId: 7, CreatedAt: 200, Type: LogTypeConsume},
	} {
		require.NoError(t, LOG_DB.Create(l).Error)
	}
}

func idsOf(logs []*Log) []int {
	out := make([]int, len(logs))
	for i, l := range logs {
		out[i] = l.Id
	}
	return out
}

func TestGetUserLogsOrdersByCreatedAtDesc(t *testing.T) {
	withLogStatTestDB(t, func() {
		seedOrderLogs(t)
		logs, total, err := GetUserLogs(7, LogTypeConsume, 0, 0, "", "", 0, 100, "", "", "", "", 0, 0, false)
		require.NoError(t, err)
		require.EqualValues(t, 3, total)
		require.Equal(t, []int{1, 3, 2}, idsOf(logs), "按 created_at desc 排序: 300,200,100")
	})
}

func TestGetAllLogsOrdersByCreatedAtDesc(t *testing.T) {
	withLogStatTestDB(t, func() {
		require.NoError(t, DB.AutoMigrate(&Channel{}))
		seedOrderLogs(t)
		logs, total, err := GetAllLogs(LogTypeConsume, 0, 0, 0, "", "", "", 0, 100, 0, "", "", "", "", 0, 0, false)
		require.NoError(t, err)
		require.EqualValues(t, 3, total)
		require.Equal(t, []int{1, 3, 2}, idsOf(logs), "按 created_at desc 排序: 300,200,100")
	})
}
