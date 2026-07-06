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
			_, total, err := GetAllLogs(LogTypeConsume, now-10, now+10, 0, modelName, "", "", 0, 100, 0, "", "", "", "", "", 0, 0, false)
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

// 新能力: AdminErrorLogDisplayEnabled=true 时，即使 ErrorLogDisplayEnabled=false，
// 管理员日志查询(GetAllLogs)仍返回错误日志；用户自查(GetUserLogs)不受该 flag 影响。
// spec: docs/superpowers/specs/2026-07-06-admin-error-log-display-design.md
func TestAdminErrorLogDisplayOverride(t *testing.T) {
	withLogStatTestDB(t, func() {
		// 保存/还原全局 flag，避免串扰；这些用例不得并行。
		oldErr := common.ErrorLogDisplayEnabled
		oldAdmin := common.AdminErrorLogDisplayEnabled
		oldDetails := common.ErrorDetailsEnabled
		defer func() {
			common.ErrorLogDisplayEnabled = oldErr
			common.AdminErrorLogDisplayEnabled = oldAdmin
			common.ErrorDetailsEnabled = oldDetails
		}()
		common.ErrorDetailsEnabled = true // 排除 user 查询里 ErrorDetailsEnabled 的干扰

		now := common.GetTimestamp()
		require.NoError(t, LOG_DB.Create(&Log{Id: 1, UserId: 7, Type: LogTypeConsume, ModelName: "gpt-4", CreatedAt: now}).Error)
		require.NoError(t, LOG_DB.Create(&Log{Id: 2, UserId: 7, Type: LogTypeError, ModelName: "gpt-4", CreatedAt: now}).Error)

		adminErrCount := func() int64 {
			_, total, err := GetAllLogs(LogTypeError, now-10, now+10, 0, "", "", "", 0, 100, 0, "", "", "", "", "", 0, 0, false)
			require.NoError(t, err)
			return total
		}
		userErrCount := func() int64 {
			_, total, err := GetUserLogs(7, LogTypeError, now-10, now+10, "", "", 0, 100, "", "", "", "", "", 0, 0, false)
			require.NoError(t, err)
			return total
		}

		// 组合 1: 主开关关 + admin 关 → 管理员看不到（现状）
		common.ErrorLogDisplayEnabled = false
		common.AdminErrorLogDisplayEnabled = false
		require.EqualValues(t, 0, adminErrCount(), "主关+admin关: 管理员不应看到错误日志")

		// 组合 2: 主开关关 + admin 开 → 管理员能看到（新能力）；用户仍看不到
		common.AdminErrorLogDisplayEnabled = true
		require.EqualValues(t, 1, adminErrCount(), "主关+admin开: 管理员应看到错误日志")
		require.EqualValues(t, 0, userErrCount(), "主关+admin开: 用户自查不受 admin flag 影响，仍不可见")

		// 组合 3: 主开关开 → 两者都能看到（回归）
		common.ErrorLogDisplayEnabled = true
		common.AdminErrorLogDisplayEnabled = false
		require.EqualValues(t, 1, adminErrCount(), "主开: 管理员应看到错误日志")
		require.EqualValues(t, 1, userErrCount(), "主开: 用户应看到错误日志")
	})
}
