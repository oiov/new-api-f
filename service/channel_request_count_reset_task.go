package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	channelRequestCountResetTickInterval = 1 * time.Minute
	channelRequestCountResetBatchSize    = 300
	channelRequestCountResetOptionKey    = "ChannelRequestCountResetMarker"
)

var (
	channelRequestCountResetOnce     sync.Once
	channelRequestCountResetRunning  atomic.Bool
	channelRequestCountResetLocation = loadChannelRequestCountResetLocation()
)

func loadChannelRequestCountResetLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("UTC+8", 8*3600)
	}
	return loc
}

func currentChannelRequestResetMarker(now time.Time) string {
	localNow := now
	if channelRequestCountResetLocation != nil {
		localNow = now.In(channelRequestCountResetLocation)
	}
	if localNow.Hour() < 8 {
		localNow = localNow.AddDate(0, 0, -1)
	}
	return localNow.Format("2006-01-02")
}

func getChannelRequestCountResetMarker() string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return strings.TrimSpace(common.OptionMap[channelRequestCountResetOptionKey])
}

func StartChannelRequestCountResetTask() {
	channelRequestCountResetOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("channel request count reset task started: tick=%s timezone=%s reset_at=%s", channelRequestCountResetTickInterval, channelRequestCountResetLocation.String(), "08:00"))
			ticker := time.NewTicker(channelRequestCountResetTickInterval)
			defer ticker.Stop()

			runChannelRequestCountResetOnce()
			for range ticker.C {
				runChannelRequestCountResetOnce()
			}
		})
	})
}

func runChannelRequestCountResetOnce() {
	if !channelRequestCountResetRunning.CompareAndSwap(false, true) {
		return
	}
	defer channelRequestCountResetRunning.Store(false)

	ctx := context.Background()
	marker := currentChannelRequestResetMarker(time.Now())
	if marker == "" || marker == getChannelRequestCountResetMarker() {
		return
	}

	lastID := 0
	totalReset := 0
	totalScanned := 0
	for {
		nextLastID, scanned, reset, err := model.ResetChannelRequestCountsBatch(lastID, channelRequestCountResetBatchSize)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("channel request count reset task failed: marker=%s err=%v", marker, err))
			return
		}
		if scanned == 0 {
			break
		}
		totalScanned += scanned
		totalReset += reset
		lastID = nextLastID
		if scanned < channelRequestCountResetBatchSize {
			break
		}
	}
	if err := model.UpdateOption(channelRequestCountResetOptionKey, marker); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("channel request count reset marker update failed: marker=%s err=%v", marker, err))
		return
	}
	logger.LogInfo(ctx, fmt.Sprintf("channel request count reset task done: marker=%s scanned=%d reset=%d", marker, totalScanned, totalReset))
}
