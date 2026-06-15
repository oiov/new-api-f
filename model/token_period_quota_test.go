package model

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withTokenPeriodQuotaTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite
	oldUsingMySQL := common.UsingMySQL
	oldUsingPostgreSQL := common.UsingPostgreSQL
	oldRedisEnabled := common.RedisEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false

	require.NoError(t, db.AutoMigrate(&Token{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
		common.UsingMySQL = oldUsingMySQL
		common.UsingPostgreSQL = oldUsingPostgreSQL
		common.RedisEnabled = oldRedisEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
	})

	run()
}

func TestDecreaseTokenQuotaEnforcesDailyPeriodAndResetsWithoutClearingHistory(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		currentWindow := tokenPeriodWindowStart(now)
		token := &Token{
			UserId:          10,
			Name:            "research-key",
			Key:             "period-quota-key",
			Status:          common.TokenStatusEnabled,
			CreatedTime:     now.Unix(),
			AccessedTime:    now.Unix(),
			ExpiredTime:     -1,
			RemainQuota:     1000,
			UsedQuota:       200,
			BusinessGroup:   "研发部",
			PeriodQuota:     100,
			PeriodUsedQuota: 80,
			PeriodStartAt:   currentWindow,
		}
		require.NoError(t, DB.Create(token).Error)

		err := DecreaseTokenQuota(token.Id, token.Key, 30)
		require.Error(t, err)
		require.Contains(t, strings.ToLower(err.Error()), "period quota")

		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 1000, token.RemainQuota)
		require.Equal(t, 200, token.UsedQuota)
		require.Equal(t, 80, token.PeriodUsedQuota)

		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 20))
		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 980, token.RemainQuota)
		require.Equal(t, 220, token.UsedQuota)
		require.Equal(t, 100, token.PeriodUsedQuota)
		require.Equal(t, currentWindow, token.PeriodStartAt)

		require.NoError(t, DB.Model(&Token{}).Where("id = ?", token.Id).Updates(map[string]any{
			"period_used_quota": 100,
			"period_start_at":   currentWindow - 86400,
		}).Error)

		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 40))
		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 940, token.RemainQuota)
		require.Equal(t, 260, token.UsedQuota)
		require.Equal(t, 40, token.PeriodUsedQuota)
		require.Equal(t, currentWindow, token.PeriodStartAt)
	})
}

func TestIncreaseTokenQuotaRestoresCurrentPeriodUsageForRefunds(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		currentWindow := tokenPeriodWindowStart(now)
		token := &Token{
			UserId:          10,
			Name:            "refund-key",
			Key:             "period-refund-key",
			Status:          common.TokenStatusEnabled,
			CreatedTime:     now.Unix(),
			AccessedTime:    now.Unix(),
			ExpiredTime:     -1,
			RemainQuota:     950,
			UsedQuota:       50,
			BusinessGroup:   "研发部",
			PeriodQuota:     100,
			PeriodUsedQuota: 50,
			PeriodStartAt:   currentWindow,
		}
		require.NoError(t, DB.Create(token).Error)

		require.NoError(t, IncreaseTokenQuota(token.Id, token.Key, 20))

		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 970, token.RemainQuota)
		require.Equal(t, 30, token.UsedQuota)
		require.Equal(t, 30, token.PeriodUsedQuota)
		require.Equal(t, currentWindow, token.PeriodStartAt)
	})
}

func TestUpdateUserBusinessGroupPeriodQuotaUpdatesAllTokensInBusinessGroup(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		currentWindow := tokenPeriodWindowStart(now)
		tokens := []*Token{
			{
				UserId:          20,
				Name:            "research-a",
				Key:             "research-a",
				Status:          common.TokenStatusEnabled,
				CreatedTime:     now.Unix(),
				AccessedTime:    now.Unix(),
				ExpiredTime:     -1,
				RemainQuota:     1000,
				BusinessGroup:   "研发部",
				PeriodQuota:     100,
				PeriodUsedQuota: 90,
				PeriodStartAt:   currentWindow - 86400,
			},
			{
				UserId:        20,
				Name:          "research-b",
				Key:           "research-b",
				Status:        common.TokenStatusEnabled,
				CreatedTime:   now.Unix(),
				AccessedTime:  now.Unix(),
				ExpiredTime:   -1,
				RemainQuota:   1000,
				BusinessGroup: "研发部",
			},
			{
				UserId:          20,
				Name:            "support-a",
				Key:             "support-a",
				Status:          common.TokenStatusEnabled,
				CreatedTime:     now.Unix(),
				AccessedTime:    now.Unix(),
				ExpiredTime:     -1,
				RemainQuota:     1000,
				BusinessGroup:   "客服部",
				PeriodQuota:     300,
				PeriodUsedQuota: 20,
				PeriodStartAt:   currentWindow,
			},
		}
		require.NoError(t, DB.Create(&tokens).Error)

		count, err := UpdateUserBusinessGroupPeriodQuota(20, "研发部", 500)
		require.NoError(t, err)
		require.EqualValues(t, 2, count)

		var updated []Token
		require.NoError(t, DB.Order("id asc").Find(&updated).Error)
		require.Equal(t, 500, updated[0].PeriodQuota)
		require.Equal(t, 0, updated[0].PeriodUsedQuota)
		require.Equal(t, currentWindow, updated[0].PeriodStartAt)
		require.Equal(t, 500, updated[1].PeriodQuota)
		require.Equal(t, 0, updated[1].PeriodUsedQuota)
		require.Equal(t, currentWindow, updated[1].PeriodStartAt)
		require.Equal(t, 300, updated[2].PeriodQuota)
		require.Equal(t, 20, updated[2].PeriodUsedQuota)
	})
}
