package service

import (
	"net/http/httptest"
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

func withChannelSelectTestDB(t *testing.T, run func()) {
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

func seedSelectableChannel(t *testing.T, id int, group string, modelName string) {
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

func TestCacheGetRandomSatisfiedChannelSelectsFirstAuthorizedGroupWithModel(t *testing.T) {
	withChannelSelectTestDB(t, func() {
		gin.SetMode(gin.TestMode)
		seedSelectableChannel(t, 1, "claude", "claude-opus-4-6")
		seedSelectableChannel(t, 2, "codex", "gpt-5")
		model.InitChannelCache()

		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"claude", "codex"})

		channel, selectedGroup, err := CacheGetRandomSatisfiedChannel(&RetryParam{
			Ctx:        ctx,
			TokenGroup: "claude,codex",
			ModelName:  "gpt-5",
			Retry:      common.GetPointer(0),
		})

		require.NoError(t, err)
		require.NotNil(t, channel)
		assert.Equal(t, 2, channel.Id)
		assert.Equal(t, "codex", selectedGroup)
	})
}
