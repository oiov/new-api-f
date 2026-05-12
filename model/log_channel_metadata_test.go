package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withLogChannelMetadataTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldMemoryCacheEnabled := common.MemoryCacheEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	common.MemoryCacheEnabled = false

	require.NoError(t, db.AutoMigrate(&Channel{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
	})

	run()
}

func TestAttachChannelMetadataToLogsAddsNameAndTag(t *testing.T) {
	withLogChannelMetadataTestDB(t, func() {
		tag := "premium"
		require.NoError(t, DB.Create(&Channel{
			Id:     77,
			Name:   "fast-openai",
			Key:    "sk-test",
			Tag:    &tag,
			Group:  "default",
			Models: "gpt-4o-mini",
		}).Error)

		logs := []*Log{{ChannelId: 77}}

		require.NoError(t, attachChannelNamesToLogs(logs))

		require.Equal(t, "fast-openai", logs[0].ChannelName)
		require.Equal(t, "premium", logs[0].ChannelTag)
	})
}

func TestFormatLogsRemovesChannelMetadataForUserView(t *testing.T) {
	logs := []*Log{
		{
			Id:          99,
			ChannelName: "test-channel",
			ChannelTag:  "test-tag",
			Other:       `{"safe":"ok"}`,
		},
	}

	formatLogs(logs, 10, true, true, false)

	require.Empty(t, logs[0].ChannelName)
	require.Empty(t, logs[0].ChannelTag)
}
