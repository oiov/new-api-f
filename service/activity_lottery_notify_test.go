package service

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestBuildActivityLotteryWinnerNotificationWithPrize(t *testing.T) {
	round := &model.ActivityLotteryRound{Title: "第1期", StartAt: 1, EndAt: 2}

	// per-winner 码优先
	_, content := buildActivityLotteryWinnerNotificationWithPrize(round, "CODE-XYZ")
	require.True(t, strings.Contains(content, "CODE-XYZ"))

	// 空 prize 回退到 round.PrizeContent（手动期行为）
	round.PrizeContent = "共享奖品"
	_, content = buildActivityLotteryWinnerNotificationWithPrize(round, "")
	require.True(t, strings.Contains(content, "共享奖品"))
}
