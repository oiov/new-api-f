package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCreateActivityLotteryAutoJobValidation(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		now := time.Unix(1_700_000_000, 0)
		job, err := CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "x", TitleTemplate: "第{n}期", RunAtSeconds: 32400, DurationSeconds: 86400,
			WinnerCount: 3, PrizeQuota: 500000, PrizeName: "活动抽奖第{n}期", JoinSources: "manual",
		}, now)
		require.NoError(t, err)
		require.Equal(t, 0, job.IssueNo)
		require.True(t, job.Enabled)

		// 缺 prize_quota 应失败
		_, err = CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "y", TitleTemplate: "第{n}期", DurationSeconds: 86400, WinnerCount: 1, PrizeQuota: 0, PrizeName: "码",
		}, now)
		require.Error(t, err)

		// 缺 title_template 应失败
		_, err = CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "z", DurationSeconds: 86400, WinnerCount: 1, PrizeQuota: 100, PrizeName: "码",
		}, now)
		require.Error(t, err)

		// prize_name 展开后超长应失败
		_, err = CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "w", TitleTemplate: "第{n}期", DurationSeconds: 86400, WinnerCount: 1, PrizeQuota: 100,
			PrizeName: "这是一个非常非常非常非常长的兑换码名称模板第{n}期",
		}, now)
		require.Error(t, err)
	})
}

func TestRunActivityLotteryAutoJobCreatesRound(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		day := getActivityLotteryDayStart(time.Unix(1_700_000_000, 0))
		now := time.Unix(day+9*3600+1800, 0) // 当天 09:30
		job, err := CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "daily", TitleTemplate: "Nbility 日常抽奖活动第{n}期",
			RunAtSeconds: 9 * 3600, DurationSeconds: 86400, WinnerCount: 3,
			PrizeQuota: 500000, PrizeName: "活动抽奖第{n}期", JoinSources: "manual",
		}, now)
		require.NoError(t, err)

		created, err := RunActivityLotteryAutoJob(job.Id, now)
		require.NoError(t, err)
		require.NotNil(t, created)
		require.Equal(t, "Nbility 日常抽奖活动第1期", created.Title)
		require.Equal(t, ActivityLotteryPrizeModePerWinnerCode, created.PrizeMode)
		require.Equal(t, ActivityLotteryRoundStatusOpen, created.Status)
		require.Equal(t, job.Id, created.AutoJobId)
		require.Equal(t, 500000, created.PrizeQuota)
		require.Equal(t, "活动抽奖第1期", created.PrizeName)

		// job 状态更新
		updated, err := GetActivityLotteryAutoJobById(job.Id)
		require.NoError(t, err)
		require.Equal(t, 1, updated.IssueNo)
		require.Equal(t, created.Id, updated.LastRoundId)

		// 当天再次运行不重复建期
		created2, err := RunActivityLotteryAutoJob(job.Id, now.Add(time.Minute))
		require.NoError(t, err)
		require.Nil(t, created2, "当天已建期应跳过")

		var roundCount int64
		require.NoError(t, DB.Model(&ActivityLotteryRound{}).Count(&roundCount).Error)
		require.EqualValues(t, 1, roundCount)
	})
}

func TestRunActivityLotteryAutoJobSkipsBeforeRunAt(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		day := getActivityLotteryDayStart(time.Unix(1_700_000_000, 0))
		now := time.Unix(day+8*3600, 0) // 当天 08:00，早于 09:00
		job, err := CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "daily", TitleTemplate: "第{n}期", RunAtSeconds: 9 * 3600,
			DurationSeconds: 86400, WinnerCount: 1, PrizeQuota: 100, PrizeName: "码{n}", JoinSources: "manual",
		}, now)
		require.NoError(t, err)
		created, err := RunActivityLotteryAutoJob(job.Id, now)
		require.NoError(t, err)
		require.Nil(t, created, "未到 run_at 不建期")
	})
}

func TestRunActivityLotteryAutoJobSkipsWhenLastRoundOpen(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		day := getActivityLotteryDayStart(time.Unix(1_700_000_000, 0))
		now := time.Unix(day+9*3600+1800, 0)
		job, err := CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "daily", TitleTemplate: "第{n}期", RunAtSeconds: 9 * 3600,
			DurationSeconds: 86400, WinnerCount: 1, PrizeQuota: 100, PrizeName: "码{n}", JoinSources: "manual",
		}, now)
		require.NoError(t, err)
		created, err := RunActivityLotteryAutoJob(job.Id, now)
		require.NoError(t, err)
		require.NotNil(t, created)

		// 模拟次日：清掉 last_run_date，但上一期仍 open
		require.NoError(t, DB.Model(&ActivityLotteryAutoJob{}).Where("id = ?", job.Id).
			Update("last_run_date", "").Error)
		nextDay := now.Add(24 * time.Hour)
		created2, err := RunActivityLotteryAutoJob(job.Id, nextDay)
		require.NoError(t, err)
		require.Nil(t, created2, "上一期仍进行中不应建新期")
	})
}

func TestForceRunActivityLotteryAutoJobIgnoresScheduleAndDedup(t *testing.T) {
	withActivityLotteryTestDB(t, func() {
		day := getActivityLotteryDayStart(time.Unix(1_700_000_000, 0))
		now := time.Unix(day+8*3600, 0) // 08:00，早于 run_at 09:00
		job, err := CreateActivityLotteryAutoJob(&ActivityLotteryAutoJobUpsertRequest{
			Name: "daily", TitleTemplate: "第{n}期", RunAtSeconds: 9 * 3600,
			DurationSeconds: 6 * 3600, WinnerCount: 1, PrizeQuota: 100,
			PrizeName: "码{n}", JoinSources: "manual",
		}, now)
		require.NoError(t, err)

		// 未到 run_at，但强制执行应立即建一期
		round, err := ForceRunActivityLotteryAutoJob(job.Id, now)
		require.NoError(t, err)
		require.NotNil(t, round)
		require.Equal(t, "第1期", round.Title)
		require.Equal(t, ActivityLotteryRoundStatusOpen, round.Status)
		require.Equal(t, now.Unix(), round.StartAt, "开期时间应为当前时刻")
		require.Equal(t, now.Unix()+6*3600, round.EndAt)

		// 当天已 run 过，强制执行仍能再建一期（忽略去重），期号自增
		round2, err := ForceRunActivityLotteryAutoJob(job.Id, now.Add(time.Minute))
		require.NoError(t, err)
		require.NotNil(t, round2)
		require.Equal(t, "第2期", round2.Title)

		updated, err := GetActivityLotteryAutoJobById(job.Id)
		require.NoError(t, err)
		require.Equal(t, 2, updated.IssueNo)
		require.Equal(t, round2.Id, updated.LastRoundId)
	})
}
