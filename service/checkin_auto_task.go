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

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	checkinAutoJobTickInterval = 20 * time.Second
	checkinAutoJobBatchSize    = 100
	checkinAutoJobStaleTimeout = 10 * time.Minute
)

var (
	checkinAutoJobOnce    sync.Once
	checkinAutoJobRunning atomic.Bool
)

func StartCheckinAutoJobTask() {
	checkinAutoJobOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("checkin auto job task started: tick=%s", checkinAutoJobTickInterval))
			ticker := time.NewTicker(checkinAutoJobTickInterval)
			defer ticker.Stop()

			runCheckinAutoJobOnce()
			for range ticker.C {
				runCheckinAutoJobOnce()
			}
		})
	})
}

func runCheckinAutoJobOnce() {
	if !checkinAutoJobRunning.CompareAndSwap(false, true) {
		return
	}
	defer checkinAutoJobRunning.Store(false)

	ctx := context.Background()
	now := model.GetCheckinNow()
	if recovered, err := model.ResetStaleRunningCheckinAutoJobItems(now.Add(-checkinAutoJobStaleTimeout).Unix(), now.Unix()); err == nil {
		if common.DebugEnabled && recovered > 0 {
			logger.LogDebug(ctx, "checkin auto job recovered stale items: count=%d", recovered)
		}
	} else {
		logger.LogWarn(ctx, fmt.Sprintf("checkin auto job stale recovery failed: %v", err))
	}
	items, err := model.ListDueCheckinAutoJobItems(now.Unix(), checkinAutoJobBatchSize)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("checkin auto job task query failed: %v", err))
		return
	}
	if len(items) == 0 {
		return
	}

	for _, item := range items {
		if item == nil || item.Id <= 0 {
			continue
		}
		claimed, err := model.ClaimCheckinAutoJobItem(item.Id, now.Unix())
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("checkin auto job claim failed: item_id=%d err=%v", item.Id, err))
			continue
		}
		if !claimed {
			continue
		}
		executeCheckinAutoJobItem(ctx, item, now)
	}
}

func executeCheckinAutoJobItem(ctx context.Context, item *model.CheckinAutoJobItem, now time.Time) {
	if item == nil {
		return
	}
	job, err := model.GetCheckinAutoJobByID(item.JobID)
	if err != nil {
		_ = model.FinishCheckinAutoJobItem(item.Id, model.CheckinAutoJobItemStatusFailed, 0, err.Error(), now.Unix())
		logger.LogWarn(ctx, fmt.Sprintf("checkin auto job load failed: item_id=%d job_id=%d err=%v", item.Id, item.JobID, err))
		return
	}
	if !job.Enabled || job.Status == model.CheckinAutoJobStatusCancelled {
		_ = model.FinishCheckinAutoJobItem(item.Id, model.CheckinAutoJobItemStatusCancelled, 0, "任务已取消", now.Unix())
		return
	}

	checkinTime := time.Unix(item.ScheduledAt, 0)

	checkin, err := model.UserCheckinWithOptions(item.UserID, model.UserCheckinOptions{
		Now:    &checkinTime,
		Source: "auto_job",
	})
	if err != nil {
		status := model.CheckinAutoJobItemStatusFailed
		if err.Error() == "今日已签到" {
			status = model.CheckinAutoJobItemStatusSkipped
		}
		_ = model.FinishCheckinAutoJobItem(item.Id, status, 0, err.Error(), now.Unix())
		if status == model.CheckinAutoJobItemStatusFailed {
			logger.LogWarn(ctx, fmt.Sprintf("checkin auto job execute failed: item_id=%d user_id=%d job_id=%d err=%v", item.Id, item.UserID, item.JobID, err))
		}
		return
	}

	_ = model.FinishCheckinAutoJobItem(item.Id, model.CheckinAutoJobItemStatusSuccess, checkin.QuotaAwarded, "", now.Unix())
	model.RecordLog(item.UserID, model.LogTypeSystem, fmt.Sprintf("后台自动签到，获得额度 %s", logger.LogQuota(checkin.QuotaAwarded)))
	if common.DebugEnabled {
		logger.LogDebug(ctx, "checkin auto job execute success: item_id=%d user_id=%d job_id=%d quota=%d", item.Id, item.UserID, item.JobID, checkin.QuotaAwarded)
	}
}
