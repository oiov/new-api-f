package model

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// user.Update 用于资料/设置更新，绝不能用读取时的旧快照覆盖 quota 相关字段——
// 这些字段由独立的原子路径(消费/充值/兑换)维护。否则改设置会抹掉并发的 quota 变动。
func TestUserUpdateOmitsQuotaFields(t *testing.T) {
	truncateTables(t)

	user := &User{Username: "quota-race-guard", Quota: 1000, UsedQuota: 200, RequestCount: 5}
	require.NoError(t, DB.Create(user).Error)

	// controller 读到的旧快照(quota=1000)
	snapshot, err := GetUserById(user.Id, true)
	require.NoError(t, err)
	require.Equal(t, 1000, snapshot.Quota)

	// 与此同时，原子路径消费了 50(quota-50, used_quota+50, request_count+1)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Updates(map[string]interface{}{
		"quota":         gorm.Expr("quota - ?", 50),
		"used_quota":    gorm.Expr("used_quota + ?", 50),
		"request_count": gorm.Expr("request_count + ?", 1),
	}).Error)

	// 用户用旧快照更新资料/设置
	snapshot.DisplayName = "updated-name"
	require.NoError(t, snapshot.Update(false))

	fresh, err := GetUserById(user.Id, true)
	require.NoError(t, err)
	require.Equal(t, "updated-name", fresh.DisplayName, "普通字段应正常更新")
	require.Equal(t, 950, fresh.Quota, "quota 不应被旧快照覆盖")
	require.Equal(t, 250, fresh.UsedQuota, "used_quota 不应被旧快照覆盖")
	require.Equal(t, 6, fresh.RequestCount, "request_count 不应被旧快照覆盖")
}
