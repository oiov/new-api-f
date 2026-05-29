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
	activityLotteryAutoCreateTickInterval = 20 * time.Second
)

var (
	activityLotteryAutoCreateOnce    sync.Once
	activityLotteryAutoCreateRunning atomic.Bool
)

// StartActivityLotteryAutoCreateTask 启动“自动建期”定时任务（仅 master 节点）。
// 开奖+发奖由已有的 StartActivityLotteryTask 负责，本任务只负责到点按模板创建并开启新一期。
func StartActivityLotteryAutoCreateTask() {
	activityLotteryAutoCreateOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("activity lottery auto-create task started: tick=%s", activityLotteryAutoCreateTickInterval))
			ticker := time.NewTicker(activityLotteryAutoCreateTickInterval)
			defer ticker.Stop()

			runActivityLotteryAutoCreateOnce()
			for range ticker.C {
				runActivityLotteryAutoCreateOnce()
			}
		})
	})
}

func runActivityLotteryAutoCreateOnce() {
	if !operation_setting.IsActivityLotteryEnabled() {
		return
	}
	if !activityLotteryAutoCreateRunning.CompareAndSwap(false, true) {
		return
	}
	defer activityLotteryAutoCreateRunning.Store(false)

	ctx := context.Background()
	now := model.GetCheckinNow()

	jobs, err := model.ListDueActivityLotteryAutoJobs(now)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("activity lottery auto-create query failed: %v", err))
		return
	}
	for _, job := range jobs {
		if job == nil || job.Id <= 0 {
			continue
		}
		round, err := model.RunActivityLotteryAutoJob(job.Id, now)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("activity lottery auto-create failed: job_id=%d err=%v", job.Id, err))
			continue
		}
		if round != nil {
			logger.LogInfo(ctx, fmt.Sprintf("activity lottery auto-create round: job_id=%d round_id=%d title=%s", job.Id, round.Id, round.Title))
		}
	}
}
