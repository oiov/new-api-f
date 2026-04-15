package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	activityLotteryTickInterval = 20 * time.Second
	activityLotteryBatchSize    = 10
)

var (
	activityLotteryOnce    sync.Once
	activityLotteryRunning atomic.Bool
)

func StartActivityLotteryTask() {
	activityLotteryOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("activity lottery task started: tick=%s", activityLotteryTickInterval))
			ticker := time.NewTicker(activityLotteryTickInterval)
			defer ticker.Stop()

			runActivityLotteryOnce()
			for range ticker.C {
				runActivityLotteryOnce()
			}
		})
	})
}

func runActivityLotteryOnce() {
	setting := operation_setting.GetActivityLotterySetting()
	if setting == nil || !setting.Enabled || !setting.AutoDrawEnabled {
		return
	}
	if !activityLotteryRunning.CompareAndSwap(false, true) {
		return
	}
	defer activityLotteryRunning.Store(false)

	now := model.GetCheckinNow()
	ctx := context.Background()

	rounds, err := model.ListDueActivityLotteryRoundsToFinalize(now, activityLotteryBatchSize)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("activity lottery query failed: %v", err))
		return
	}
	for _, round := range rounds {
		if round == nil || round.Id <= 0 {
			continue
		}
		_ = model.RefreshActivityLotteryRoundParticipantCount(round.Id)
		if err := model.DB.First(round, round.Id).Error; err != nil {
			continue
		}
		need := round.MinParticipants
		if need <= 0 {
			need = setting.DefaultMinParticipants
		}
		if need > 0 && round.ParticipantCount < int64(need) {
			if err := model.ExpireActivityLotteryRound(round.Id, now); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("activity lottery expire failed: round_id=%d err=%v", round.Id, err))
				continue
			}
			logger.LogInfo(ctx, fmt.Sprintf("activity lottery expired: round_id=%d", round.Id))
			continue
		}
		winners, drawnRound, isNewDraw, err := model.DrawActivityLotteryRound(round.Id, now)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("activity lottery draw failed: round_id=%d err=%v", round.Id, err))
			continue
		}
		if isNewDraw {
			NotifyActivityLotteryWinnersAsync(drawnRound, winners)
		}
		logger.LogInfo(ctx, fmt.Sprintf("activity lottery drawn: round_id=%d", round.Id))
	}
}
