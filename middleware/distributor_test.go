package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withDistributorTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := model.DB
	oldLogDB := model.LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldUsingMySQL := common.UsingMySQL
	oldUsingPostgreSQL := common.UsingPostgreSQL
	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	model.DB = db
	model.LOG_DB = db
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.MemoryCacheEnabled = true
	common.BatchUpdateEnabled = false

	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))

	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.UsingMySQL = oldUsingMySQL
		common.UsingPostgreSQL = oldUsingPostgreSQL
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
	})

	run()
}

func seedDistributorChannel(t *testing.T, id int, group string, modelName string) {
	t.Helper()
	channel := &model.Channel{
		Id:       id,
		Name:     group + "-channel",
		Key:      "sk-test",
		Status:   common.ChannelStatusEnabled,
		Group:    group,
		Models:   modelName,
		Weight:   common.GetPointer[uint](0),
		Priority: common.GetPointer[int64](0),
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, channel.AddAbilities(nil))
}

func TestDistributeSelectsLaterAuthorizedTokenGroupForRequestedModel(t *testing.T) {
	withDistributorTestDB(t, func() {
		gin.SetMode(gin.TestMode)
		seedDistributorChannel(t, 1, "claude", "claude-opus-4-6")
		seedDistributorChannel(t, 2, "codex", "gpt-5")
		model.InitChannelCache()

		router := gin.New()
		router.Use(func(c *gin.Context) {
			common.SetContextKey(c, constant.ContextKeyUserGroup, "claude")
			common.SetContextKey(c, constant.ContextKeyUsingGroup, "claude")
			common.SetContextKey(c, constant.ContextKeyTokenGroup, "claude,codex")
			common.SetContextKey(c, constant.ContextKeyTokenGroups, []string{"claude", "codex"})
			c.Next()
		})
		router.Use(Distribute())
		router.POST("/v1/chat/completions", func(c *gin.Context) {
			assert.Equal(t, 2, common.GetContextKeyInt(c, constant.ContextKeyChannelId))
			assert.Equal(t, "codex", common.GetContextKeyString(c, constant.ContextKeyUsingGroup))
			assert.Equal(t, "codex", common.GetContextKeyString(c, constant.ContextKeyTokenGroup))
			c.Status(http.StatusNoContent)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-5","messages":[]}`))
		req.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusNoContent, recorder.Code, recorder.Body.String())
	})
}
