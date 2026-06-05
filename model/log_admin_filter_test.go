package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#5097): admin 日志查询此前用 `model_name like ?` 直接把用户输入当
// LIKE 模式，未转义 `_`/`%`。搜 "gpt_4" 时下划线会通配任意单字符，误匹配 "gpt-4"。
// 修复后：无显式 % 时精确匹配，有 % 时走转义模糊。
// 注意: 本测试只覆盖 admin 查询（GetAllLogs）；user 查询语义不变，不在范围内。
func TestGetAllLogsAdminModelFilterExactUnlessWildcard(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		seed := func(id int, model string) {
			require.NoError(t, LOG_DB.Create(&Log{
				Id:        id,
				UserId:    43,
				ModelName: model,
				Type:      LogTypeConsume,
				CreatedAt: now,
			}).Error)
		}
		seed(1, "gpt-4")
		seed(2, "gpt-4-mini")

		countAdmin := func(modelName string) int64 {
			_, total, err := GetAllLogs(LogTypeConsume, now-10, now+10, 0, modelName, "", "", 0, 100, 0, "", "", "", "", 0, 0, false)
			require.NoError(t, err)
			return total
		}

		// 核心红用例: 下划线必须被当字面量，不得通配匹配 "gpt-4"。
		require.EqualValues(t, 0, countAdmin("gpt_4"), `"gpt_4" 不应通过下划线通配误匹配 "gpt-4"`)
		// 精确匹配: "gpt-4" 只匹配自身，不匹配 "gpt-4-mini"。
		require.EqualValues(t, 1, countAdmin("gpt-4"))
		// 显式通配: "gpt%" 模糊匹配两条。
		require.EqualValues(t, 2, countAdmin("gpt%"))
	})
}
