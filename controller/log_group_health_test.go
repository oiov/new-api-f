package controller

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupLogGroupHealthControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}, &model.UserSubscription{}))

	originUserUsableGroups := setting.UserUsableGroups2JSONString()
	originAutoGroups := setting.AutoGroups2JsonString()
	originBillingFilter := setting.EnableGroupBillingFilter
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组"}`))
	setting.EnableGroupBillingFilter = false

	t.Cleanup(func() {
		_ = setting.UpdateAutoGroupsByJsonString(originAutoGroups)
		_ = setting.UpdateUserUsableGroupsByJSONString(originUserUsableGroups)
		setting.EnableGroupBillingFilter = originBillingFilter
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func decodeGroupHealthStats(t *testing.T, response tokenAPIResponse) []model.GroupLogHealthStat {
	t.Helper()
	stats := make([]model.GroupLogHealthStat, 0)
	require.NoError(t, common.Unmarshal(response.Data, &stats))
	return stats
}

func TestGetGroupLogSelfHealthStatsExpandsAutoGroup(t *testing.T) {
	db := setupLogGroupHealthControllerTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default"]`))
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "alice", Group: "default", Quota: 100}).Error)
	require.NoError(t, db.Create(&[]model.Log{
		{CreatedAt: now - 10, Type: model.LogTypeConsume, Group: "default", UserId: 2},
		{CreatedAt: now - 10, Type: model.LogTypeConsume, Group: "vip", UserId: 3},
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, fmt.Sprintf("/api/log/self/group_health?group=auto&start_timestamp=%d&end_timestamp=%d", now-60, now), nil, 1)
	GetGroupLogSelfHealthStats(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	stats := decodeGroupHealthStats(t, response)
	require.Len(t, stats, 1)
	assert.Equal(t, "default", stats[0].Group)
	assert.EqualValues(t, 1, stats[0].TotalCount)
}

func TestGetGroupLogSelfHealthStatsRejectsUnavailableGroup(t *testing.T) {
	db := setupLogGroupHealthControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "alice", Group: "default", Quota: 100}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/log/self/group_health?group=vip", nil, 1)
	GetGroupLogSelfHealthStats(ctx)

	response := decodeAPIResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "无权查看该分组健康状态")
}
