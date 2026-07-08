package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/utils/tests"
)

// lockForUpdate 必须在支持的数据库上产生 SELECT ... FOR UPDATE，并在 SQLite 上跳过。
// 用 DummyDialector 而非真实 SQLite,因为 SQLite 驱动会剥离锁子句,掩盖 helper 本身的行为。
// 同时对照证明:GORM v1 的 Set("gorm:query_option","FOR UPDATE") 在 GORM v2 下被静默忽略,
// 根本不加锁——这正是本次修复的 bug 根因。
func TestLockForUpdateEmitsRowLock(t *testing.T) {
	dummyDB, err := gorm.Open(tests.DummyDialector{}, &gorm.Config{DryRun: true})
	require.NoError(t, err)

	oldSQLite := common.UsingSQLite
	t.Cleanup(func() { common.UsingSQLite = oldSQLite })

	buildSQL := func() string {
		var rows []Redemption
		return lockForUpdate(dummyDB).Where("id = ?", 1).Find(&rows).Statement.SQL.String()
	}
	legacySQL := func() string {
		var rows []Redemption
		return dummyDB.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", 1).Find(&rows).Statement.SQL.String()
	}

	// 非 SQLite:lockForUpdate 产生行锁;旧 v1 写法不产生(bug)
	common.UsingSQLite = false
	assert.Contains(t, buildSQL(), "FOR UPDATE", "非 SQLite 应产生 FOR UPDATE 行锁")
	assert.NotContains(t, legacySQL(), "FOR UPDATE", "GORM v1 Set(query_option) 在 v2 下被忽略,不加锁")

	// SQLite:无 FOR UPDATE 语法,跳过
	common.UsingSQLite = true
	assert.NotContains(t, buildSQL(), "FOR UPDATE", "SQLite 应跳过行锁")
}
