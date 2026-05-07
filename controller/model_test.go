package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withModelListTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := model.DB
	oldLogDB := model.LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldUsingMySQL := common.UsingMySQL
	oldUsingPostgreSQL := common.UsingPostgreSQL
	oldRedisEnabled := common.RedisEnabled
	oldSelfUseModeEnabled := operation_setting.SelfUseModeEnabled

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
	common.RedisEnabled = false
	operation_setting.SelfUseModeEnabled = false

	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Ability{}))

	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.UsingMySQL = oldUsingMySQL
		common.UsingPostgreSQL = oldUsingPostgreSQL
		common.RedisEnabled = oldRedisEnabled
		operation_setting.SelfUseModeEnabled = oldSelfUseModeEnabled
	})

	run()
}

func TestListModelsReturnsUnionForMultipleTokenGroups(t *testing.T) {
	withModelListTestDB(t, func() {
		gin.SetMode(gin.TestMode)
		require.NoError(t, model.DB.Create(&model.User{
			Id:       10,
			Username: "multi-model-user",
			Status:   common.UserStatusEnabled,
			Group:    "claude",
			Quota:    1000,
		}).Error)
		claudePriority := int64(0)
		codexPriority := int64(0)
		require.NoError(t, model.DB.Create(&model.Ability{
			Group:     "claude",
			Model:     "claude-opus-4-6",
			ChannelId: 1,
			Enabled:   true,
			Priority:  &claudePriority,
		}).Error)
		require.NoError(t, model.DB.Create(&model.Ability{
			Group:     "codex",
			Model:     "gpt-5",
			ChannelId: 2,
			Enabled:   true,
			Priority:  &codexPriority,
		}).Error)

		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 10)
		common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "claude,codex")

		ListModels(ctx, constant.ChannelTypeOpenAI)

		require.Equal(t, http.StatusOK, recorder.Code)
		var response struct {
			Success bool             `json:"success"`
			Data    []dtoOpenAIModel `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)

		modelIDs := make([]string, 0, len(response.Data))
		for _, item := range response.Data {
			modelIDs = append(modelIDs, item.ID)
		}
		assert.Contains(t, modelIDs, "claude-opus-4-6")
		assert.Contains(t, modelIDs, "gpt-5")
	})
}

func TestListModelsDoesNotRequireModelRatioForTokenGroupModels(t *testing.T) {
	withModelListTestDB(t, func() {
		gin.SetMode(gin.TestMode)
		require.NoError(t, model.DB.Create(&model.User{
			Id:       11,
			Username: "unset-ratio-model-user",
			Status:   common.UserStatusEnabled,
			Group:    "codex",
			Quota:    1000,
		}).Error)
		priority := int64(0)
		require.NoError(t, model.DB.Create(&model.Ability{
			Group:     "codex",
			Model:     "custom-codex-without-ratio",
			ChannelId: 1,
			Enabled:   true,
			Priority:  &priority,
		}).Error)

		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 11)
		common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "codex")

		ListModels(ctx, constant.ChannelTypeOpenAI)

		require.Equal(t, http.StatusOK, recorder.Code)
		var response struct {
			Success bool             `json:"success"`
			Data    []dtoOpenAIModel `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)

		modelIDs := make([]string, 0, len(response.Data))
		for _, item := range response.Data {
			modelIDs = append(modelIDs, item.ID)
		}
		assert.Contains(t, modelIDs, "custom-codex-without-ratio")
	})
}

type dtoOpenAIModel struct {
	ID string `json:"id"`
}
