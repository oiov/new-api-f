package model

import (
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

func TestDecreaseTokenQuotaRecordsUsageAndCheckBlocksWhenExceeded(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		currentWindow := time.Now().Unix()
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
			PeriodDuration:  PeriodDurationDaily,
			PeriodQuota:     100,
			PeriodUsedQuota: 80,
			PeriodStartAt:   currentWindow,
		}
		require.NoError(t, DB.Create(token).Error)

		// Consuming 30 pushes period_used to 110 (over 100 limit), but DecreaseTokenQuota
		// should NOT block — it always records accurately.
		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 30))
		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 970, token.RemainQuota)
		require.Equal(t, 230, token.UsedQuota)
		require.Equal(t, 110, token.PeriodUsedQuota)

		// CheckTokenPeriodQuota should now block — period_used (110) >= period_quota (100)
		require.Error(t, CheckTokenPeriodQuota(token))

		// Simulate period expiry: set period_start_at to 1 day ago
		require.NoError(t, DB.Model(&Token{}).Where("id = ?", token.Id).Updates(map[string]any{
			"period_used_quota": 110,
			"period_start_at":   currentWindow - 86400,
		}).Error)

		// After expiry, CheckTokenPeriodQuota should pass (period will reset on next consume)
		require.NoError(t, DB.First(token, token.Id).Error)
		require.NoError(t, CheckTokenPeriodQuota(token))

		// Consuming after expiry: period resets, only new consumption counted
		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 40))
		require.NoError(t, DB.First(token, token.Id).Error)
		require.Equal(t, 930, token.RemainQuota)
		require.Equal(t, 270, token.UsedQuota)
		require.Equal(t, 40, token.PeriodUsedQuota)
		require.True(t, token.PeriodStartAt >= currentWindow)
	})
}

func TestIncreaseTokenQuotaRestoresCurrentPeriodUsageForRefunds(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		currentWindow := time.Now().Unix()
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
			PeriodDuration:  PeriodDurationDaily,
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
		currentWindow := time.Now().Unix()
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

		count, err := UpdateUserBusinessGroupPeriodQuota(20, "研发部", 500, PeriodDurationDaily, 0)
		require.NoError(t, err)
		require.EqualValues(t, 2, count)

		var updated []Token
		require.NoError(t, DB.Order("id asc").Find(&updated).Error)
		require.Equal(t, 500, updated[0].PeriodQuota)
		require.Equal(t, 0, updated[0].PeriodUsedQuota)
		require.True(t, updated[0].PeriodStartAt >= currentWindow)
		require.Equal(t, 500, updated[1].PeriodQuota)
		require.Equal(t, 0, updated[1].PeriodUsedQuota)
		require.True(t, updated[1].PeriodStartAt >= currentWindow)
		require.Equal(t, 300, updated[2].PeriodQuota)
		require.Equal(t, 20, updated[2].PeriodUsedQuota)
	})
}

func TestAlignToAnchor(t *testing.T) {
	loc := subscriptionResetLocation
	if loc == nil {
		loc = time.UTC
	}

	t.Run("anchor_before_now_returns_today", func(t *testing.T) {
		now := time.Date(2026, 6, 15, 10, 0, 0, 0, loc)
		anchor := int64(28800) // 08:00
		got := AlignToAnchor(now, anchor, PeriodDurationDaily)
		expected := time.Date(2026, 6, 15, 8, 0, 0, 0, loc).Unix()
		require.Equal(t, expected, got)
	})

	t.Run("anchor_after_now_returns_yesterday", func(t *testing.T) {
		now := time.Date(2026, 6, 15, 6, 0, 0, 0, loc)
		anchor := int64(28800) // 08:00
		got := AlignToAnchor(now, anchor, PeriodDurationDaily)
		expected := time.Date(2026, 6, 14, 8, 0, 0, 0, loc).Unix()
		require.Equal(t, expected, got)
	})

	t.Run("anchor_midnight", func(t *testing.T) {
		now := time.Date(2026, 6, 15, 12, 0, 0, 0, loc)
		anchor := int64(0) // 00:00
		got := AlignToAnchor(now, anchor, PeriodDurationDaily)
		expected := time.Date(2026, 6, 15, 0, 0, 0, 0, loc).Unix()
		require.Equal(t, expected, got)
	})

	t.Run("anchor_clamped_to_valid_range", func(t *testing.T) {
		now := time.Date(2026, 6, 15, 12, 0, 0, 0, loc)
		got := AlignToAnchor(now, 100000, PeriodDurationDaily) // > 86399, clamped to 86399
		expected := time.Date(2026, 6, 14, 23, 59, 59, 0, loc).Unix()
		require.Equal(t, expected, got)
	})
}

func TestDecreaseTokenQuotaWithAnchorAlignedReset(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		loc := subscriptionResetLocation
		if loc == nil {
			loc = time.UTC
		}
		now := time.Now().In(loc)
		anchor := int64(28800) // 08:00
		alignedStart := AlignToAnchor(now, anchor, PeriodDurationDaily)

		token := &Token{
			UserId:            10,
			Name:              "anchor-test",
			Key:               "anchor-test-key",
			Status:            common.TokenStatusEnabled,
			CreatedTime:       now.Unix(),
			AccessedTime:      now.Unix(),
			ExpiredTime:       -1,
			RemainQuota:       1000,
			PeriodDuration:    PeriodDurationDaily,
			PeriodQuota:       100,
			PeriodUsedQuota:   80,
			PeriodStartAt:     alignedStart - PeriodDurationDaily, // expired: one full period ago
			PeriodResetAnchor: anchor,
		}
		require.NoError(t, DB.Create(token).Error)

		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 20))
		require.NoError(t, DB.First(token, token.Id).Error)

		require.Equal(t, 20, token.PeriodUsedQuota)
		// PeriodStartAt should be anchor-aligned, not raw now
		h := time.Unix(token.PeriodStartAt, 0).In(loc).Hour()
		m := time.Unix(token.PeriodStartAt, 0).In(loc).Minute()
		require.Equal(t, 8, h)
		require.Equal(t, 0, m)
	})
}

func TestAnchorIgnoredForShortPeriods(t *testing.T) {
	withTokenPeriodQuotaTestDB(t, func() {
		now := time.Now()
		token := &Token{
			UserId:            10,
			Name:              "short-period",
			Key:               "short-period-key",
			Status:            common.TokenStatusEnabled,
			CreatedTime:       now.Unix(),
			AccessedTime:      now.Unix(),
			ExpiredTime:       -1,
			RemainQuota:       1000,
			PeriodDuration:    3600, // 1 hour — short period
			PeriodQuota:       100,
			PeriodUsedQuota:   50,
			PeriodStartAt:     now.Unix() - 7200, // expired: 2 hours ago
			PeriodResetAnchor: 28800,              // should be ignored
		}
		require.NoError(t, DB.Create(token).Error)

		require.NoError(t, DecreaseTokenQuota(token.Id, token.Key, 10))
		require.NoError(t, DB.First(token, token.Id).Error)

		require.Equal(t, 10, token.PeriodUsedQuota)
		// PeriodStartAt should be ~now, not anchor-aligned
		require.InDelta(t, now.Unix(), token.PeriodStartAt, 5)
	})
}
