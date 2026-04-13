package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	defaultFinanceRangeSeconds = 30 * 24 * 60 * 60
	maxFinanceRangeSeconds     = 366 * 24 * 60 * 60
)

func GetFinanceOverview(c *gin.Context) {
	now := common.GetTimestamp()
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	if endTimestamp <= 0 {
		endTimestamp = now
	}
	if startTimestamp <= 0 {
		startTimestamp = endTimestamp - defaultFinanceRangeSeconds
	}
	if startTimestamp >= endTimestamp {
		common.ApiErrorMsg(c, "开始时间必须早于结束时间")
		return
	}
	if endTimestamp-startTimestamp > maxFinanceRangeSeconds {
		common.ApiErrorMsg(c, "时间跨度不能超过 366 天")
		return
	}

	granularity := normalizeFinanceGranularity(c.Query("granularity"), startTimestamp, endTimestamp)
	data, err := model.GetFinanceOverview(startTimestamp, endTimestamp, granularity)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func normalizeFinanceGranularity(input string, startTimestamp int64, endTimestamp int64) string {
	switch input {
	case "day", "week", "month":
		return input
	}

	rangeSeconds := endTimestamp - startTimestamp
	if rangeSeconds > 180*24*60*60 {
		return "month"
	}
	if rangeSeconds > 60*24*60*60 {
		return "week"
	}
	return "day"
}
