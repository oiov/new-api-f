package model

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withActivityLotteryTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true

	require.NoError(t, db.AutoMigrate(
		&User{},
		&ActivityLotteryRound{},
		&ActivityLotteryEntry{},
		&ActivityLotteryWinner{},
		&Redemption{},
		&SiteNotification{},
	))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func seedActivityLotteryRoundBelowThreshold(t *testing.T, now time.Time) *ActivityLotteryRound {
	t.Helper()

	require.NoError(t, DB.Create(&User{
		Id:          1001,
		Username:    "lottery-user",
		DisplayName: "Lottery User",
		Email:       "lottery-user@example.com",
		Status:      common.UserStatusEnabled,
	}).Error)

	round := &ActivityLotteryRound{
		Title:            "Force Draw Round",
		Prize:            "Public Prize",
		PrizeContent:     "Private Prize",
		JoinSources:      "manual",
		Published:        true,
		Status:           ActivityLotteryRoundStatusOpen,
		StartAt:          now.Add(-time.Hour).Unix(),
		EndAt:            now.Add(time.Hour).Unix(),
		MinParticipants:  2,
		WinnerCount:      1,
		ParticipantCount: 1,
		CreatedAt:        now.Unix(),
		UpdatedAt:        now.Unix(),
	}
	require.NoError(t, DB.Create(round).Error)
	require.NoError(t, DB.Create(&ActivityLotteryEntry{
		RoundId:         round.Id,
		UserId:          1001,
		Source:          "manual",
		Qualified:       true,
		QualifiedSource: "manual",
		QualifiedAt:     now.Unix(),
		CreatedAt:       now.Unix(),
	}).Error)

	return round
}

func TestActivityLotteryDrawRequiresTimeAndParticipantTargetByDefault(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1800000000, 0)
		round := seedActivityLotteryRoundBelowThreshold(t, now)

		winners, drawnRound, isNewDraw, err := DrawActivityLotteryRound(round.Id, now)

		require.Error(t, err)
		require.Contains(t, err.Error(), "参与人数不足")
		require.Nil(t, winners)
		require.Nil(t, drawnRound)
		require.False(t, isNewDraw)

		var persisted ActivityLotteryRound
		require.NoError(t, DB.First(&persisted, round.Id).Error)
		require.Equal(t, ActivityLotteryRoundStatusOpen, persisted.Status)
		require.Contains(t, persisted.LastError, "参与人数不足")
	})
}

func TestActivityLotteryForceDrawSkipsTimeAndParticipantTarget(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1800000000, 0)
		round := seedActivityLotteryRoundBelowThreshold(t, now)

		winners, drawnRound, isNewDraw, err := DrawActivityLotteryRoundWithOptions(round.Id, now, ActivityLotteryDrawOptions{Force: true})

		require.NoError(t, err)
		require.True(t, isNewDraw)
		require.NotNil(t, drawnRound)
		require.Equal(t, ActivityLotteryRoundStatusDrawn, drawnRound.Status)
		require.Len(t, winners, 1)
		require.Equal(t, 1001, winners[0].UserId)

		var persisted ActivityLotteryRound
		require.NoError(t, DB.First(&persisted, round.Id).Error)
		require.Equal(t, ActivityLotteryRoundStatusDrawn, persisted.Status)
		require.Equal(t, now.Unix(), persisted.DrawnAt)
		require.Empty(t, persisted.LastError)

		var notification SiteNotification
		require.NoError(t, DB.Where("user_id = ?", 1001).First(&notification).Error)
		require.Equal(t, "活动抽奖中奖通知", notification.Title)
		require.True(t, strings.Contains(notification.Content, "Private Prize"))
	})
}

func TestCreateActivityLotteryRoundDefaultsPrizeModeShared(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1_700_000_000, 0)
		round, err := CreateActivityLotteryRound(&ActivityLotteryRoundUpsertRequest{
			Title: "手动期", EndAt: now.Unix() + 3600,
		}, now)
		require.NoError(t, err)
		require.Equal(t, ActivityLotteryPrizeModeShared, round.PrizeMode)
		require.Equal(t, 0, round.AutoJobId)
		require.Equal(t, 0, round.PrizeQuota)
	})
}

func TestDrawActivityLotteryRoundPerWinnerCode(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1_700_000_000, 0)
		for _, id := range []int{2001, 2002} {
			require.NoError(t, DB.Create(&User{Id: id, Username: fmt.Sprintf("u%d", id), AffCode: fmt.Sprintf("aff%d", id), Email: fmt.Sprintf("u%d@e.com", id), Status: common.UserStatusEnabled}).Error)
		}
		round := &ActivityLotteryRound{
			Title: "自动期第1期", Published: true, Status: ActivityLotteryRoundStatusOpen,
			StartAt: now.Unix() - 100, EndAt: now.Unix() - 10,
			MinParticipants: 2, WinnerCount: 2,
			PrizeMode: ActivityLotteryPrizeModePerWinnerCode, PrizeQuota: 500000, PrizeName: "活动抽奖第1期",
		}
		require.NoError(t, DB.Create(round).Error)
		for _, id := range []int{2001, 2002} {
			require.NoError(t, DB.Create(&ActivityLotteryEntry{RoundId: round.Id, UserId: id, Source: "manual", Qualified: true}).Error)
		}

		winners, drawn, isNew, err := DrawActivityLotteryRound(round.Id, now)
		require.NoError(t, err)
		require.True(t, isNew)
		require.Equal(t, ActivityLotteryRoundStatusDrawn, drawn.Status)
		require.Len(t, winners, 2)

		seen := map[string]bool{}
		for _, w := range winners {
			require.NotEmpty(t, w.Prize, "每个中奖者应有自己的兑换码")
			require.False(t, seen[w.Prize], "兑换码不可重复")
			seen[w.Prize] = true
			var r Redemption
			require.NoError(t, DB.Where(&Redemption{Key: w.Prize}).First(&r).Error)
			require.Equal(t, 500000, r.Quota)
			require.Equal(t, RedemptionTypeQuota, r.RedemptionType)
			require.Equal(t, common.RedemptionCodeStatusEnabled, r.Status)
			require.EqualValues(t, 0, r.ExpiredTime)
		}

		// 中奖者本人通过 summary 可见自己的码
		summary, err := GetActivityLotterySummary(now, 2001)
		require.NoError(t, err)
		require.True(t, summary.IsWinner)
		require.True(t, seen[summary.Prize], "summary 应返回本人的兑换码")
	})
}

func TestDrawActivityLotteryRoundSharedUnchanged(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1_700_000_000, 0)
		require.NoError(t, DB.Create(&User{Id: 3001, Username: "u3001", AffCode: "aff3001", Email: "u3001@e.com", Status: common.UserStatusEnabled}).Error)
		round := &ActivityLotteryRound{
			Title: "手动期", Published: true, Status: ActivityLotteryRoundStatusOpen,
			StartAt: now.Unix() - 100, EndAt: now.Unix() - 10, MinParticipants: 1, WinnerCount: 1,
			PrizeContent: "共享奖品文本",
		}
		require.NoError(t, DB.Create(round).Error)
		require.NoError(t, DB.Create(&ActivityLotteryEntry{RoundId: round.Id, UserId: 3001, Source: "manual", Qualified: true}).Error)

		winners, _, _, err := DrawActivityLotteryRound(round.Id, now)
		require.NoError(t, err)
		require.Len(t, winners, 1)
		require.Empty(t, winners[0].Prize, "shared 期不生成 per-winner 码")
		var cnt int64
		require.NoError(t, DB.Model(&Redemption{}).Count(&cnt).Error)
		require.EqualValues(t, 0, cnt, "shared 期不应生成任何兑换码")
	})
}
