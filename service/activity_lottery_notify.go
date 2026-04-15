package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

func NotifyActivityLotteryWinnersAsync(round *model.ActivityLotteryRound, winners []*model.ActivityLotteryWinner) {
	if round == nil || round.Id <= 0 || len(winners) == 0 {
		return
	}
	roundCopy := *round
	winnerCopies := make([]*model.ActivityLotteryWinner, 0, len(winners))
	for _, winner := range winners {
		if winner == nil || winner.UserId <= 0 {
			continue
		}
		winnerCopy := *winner
		winnerCopies = append(winnerCopies, &winnerCopy)
	}
	if len(winnerCopies) == 0 {
		return
	}

	gopool.Go(func() {
		title, content := buildActivityLotteryWinnerNotification(&roundCopy)
		notify := dto.NewNotify(dto.NotifyTypeActivityLotteryWin, title, content, nil)
		for _, winner := range winnerCopies {
			user, err := model.GetUserById(winner.UserId, false)
			if err != nil || user == nil {
				continue
			}
			if err := NotifyUser(user.Id, user.Email, user.GetSetting(), notify); err != nil {
				common.SysLog(fmt.Sprintf("failed to notify activity lottery winner: round_id=%d user_id=%d err=%v", roundCopy.Id, user.Id, err))
			}
		}
	})
}

func buildActivityLotteryWinnerNotification(round *model.ActivityLotteryRound) (string, string) {
	if round == nil {
		return "活动抽奖中奖通知", "恭喜中奖！"
	}
	startAtText := "-"
	endAtText := "-"
	if round.StartAt > 0 {
		startAtText = time.Unix(round.StartAt, 0).Format("2006-01-02 15:04:05")
	}
	if round.EndAt > 0 {
		endAtText = time.Unix(round.EndAt, 0).Format("2006-01-02 15:04:05")
	}
	prizeText := strings.TrimSpace(round.PrizeContent)
	if prizeText == "" {
		prizeText = strings.TrimSpace(round.Prize)
	}
	content := fmt.Sprintf(
		"恭喜中奖！\n\n活动：%s\n奖品：%s\n活动时间：%s ~ %s\n\n请妥善保管奖品信息。",
		strings.TrimSpace(round.Title),
		prizeText,
		startAtText,
		endAtText,
	)
	return "活动抽奖中奖通知", content
}
